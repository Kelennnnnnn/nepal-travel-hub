-- ============================================================================
-- Fixes audit C1: trusted SECURITY DEFINER functions in the public schema
-- are callable by anon/authenticated via /rest/v1/rpc because Postgres
-- grants EXECUTE to PUBLIC by default and no prior migration ever revoked
-- it. Verified before writing this migration: grepping every migration for
-- "revoke"/"grant" turns up exactly one existing lockdown (audit_logs'
-- column-level UPDATE/DELETE revoke, migration 15) and zero function-level
-- EXECUTE revokes anywhere — every function created since migration 1,
-- including hold_inventory/confirm_reservation/release_reservation/
-- record_booking_event/record_audit_log, has been sitting on the Postgres
-- default (EXECUTE granted to PUBLIC) this entire time.
--
-- This migration does not edit any existing migration file (rule 2) — it
-- re-declares hold_inventory() with `create or replace function` (same
-- signature, so it supersedes migration 5's definition at apply time) and
-- otherwise only adds REVOKE/GRANT statements on top of what earlier
-- migrations already defined.
-- ============================================================================

-- ── Step 1: lock down the mutation/audit RPCs ──────────────────────────────
-- These are only ever meant to be called from trusted server contexts
-- (edge functions using the service-role key, or — for record_audit_log —
-- exclusively via the record-audit-log edge function). None of them have
-- any business being reachable from a browser session at all, regardless
-- of what role that session authenticated as.

revoke execute on function public.hold_inventory(uuid, integer, integer) from public, anon, authenticated;
grant  execute on function public.hold_inventory(uuid, integer, integer) to service_role;

revoke execute on function public.confirm_reservation(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.confirm_reservation(uuid, uuid) to service_role;

revoke execute on function public.release_reservation(uuid, text) from public, anon, authenticated;
grant  execute on function public.release_reservation(uuid, text) to service_role;

revoke execute on function public.record_booking_event(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.record_booking_event(uuid, text, jsonb) to service_role;

revoke execute on function public.record_audit_log(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant  execute on function public.record_audit_log(uuid, text, text, text, jsonb, jsonb, text) to service_role;

-- expire_stale_reservations()/expire_stale_quotes() are called only by
-- pg_cron (migration 20260917000004), which runs its scheduled jobs as the
-- `postgres` role — a superuser, which bypasses GRANT/REVOKE checks
-- entirely, so revoking here does not touch the cron jobs' own ability to
-- call them. No role needs to call these directly; not even service_role
-- has a legitimate reason to (there is no edge function that calls them).
revoke execute on function public.expire_stale_reservations() from public, anon, authenticated, service_role;
revoke execute on function public.expire_stale_quotes() from public, anon, authenticated, service_role;

-- ── Step 2: hold_inventory() hardening ──────────────────────────────────────
-- Adds three checks migration 5's version never had — none of them were a
-- gap in the concurrency logic itself (that part was always correct, see
-- Phase 7's report), they're gaps in what counts as a *legitimate* hold
-- request in the first place, which only mattered once this function's
-- exposure surface was being locked down for real and it became worth
-- asking "what happens if the ttl or departure_id a caller supplies is
-- nonsense." The atomic single-UPDATE capacity claim (the concurrency-
-- critical part) is untouched.
create or replace function public.hold_inventory(
  p_departure_id uuid,
  p_quantity     integer,
  p_ttl_minutes  integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_id uuid;
  v_reservation_id uuid;
  v_departure record;
begin
  if p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes < 1 or p_ttl_minutes > 30 then
    raise exception 'INVALID_TTL' using errcode = 'P0001';
  end if;

  -- Bookability check: a departure/listing that isn't actually live and
  -- open for sale right now should never accept a hold, even a
  -- structurally valid one. This is a plain read, not part of the atomic
  -- capacity claim below — departure/listing status doesn't change under
  -- the same kind of concurrent-write pressure inventory counts do, so
  -- checking it here first (rather than folding it into the UPDATE's WHERE
  -- clause) doesn't reintroduce any race.
  select d.status, d.departure_date, d.cutoff_at, l.status as listing_status, l.agency_id
  into v_departure
  from public.departures d
  join public.listings l on l.id = d.listing_id
  where d.id = p_departure_id;

  if v_departure is null
     or v_departure.status <> 'scheduled'
     or v_departure.departure_date < current_date
     or (v_departure.cutoff_at is not null and v_departure.cutoff_at <= now())
     or v_departure.listing_status <> 'published'
     or not public.is_agency_publicly_approved(v_departure.agency_id) then
    raise exception 'DEPARTURE_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  -- The atomic claim: this single UPDATE's WHERE clause re-checks capacity
  -- and commits to it in the same statement, under the row's lock. No two
  -- concurrent callers can both succeed for the last spot(s) — exactly the
  -- pattern the old system's claim_availability_spots() got right (kept
  -- here, per PHASE_1_ARCHITECTURE.md §8's explicit "keep the pattern"),
  -- and proven under real concurrent load in Phase 7's testing (six
  -- concurrent callers, five spots, exactly five succeed).
  update public.inventory
  set    capacity_held = capacity_held + p_quantity,
         version = version + 1
  where  departure_id = p_departure_id
    and  capacity_total - capacity_held - capacity_confirmed >= p_quantity
  returning id into v_inventory_id;

  if v_inventory_id is null then
    raise exception 'INSUFFICIENT_INVENTORY' using errcode = 'P0001';
  end if;

  insert into public.inventory_reservations (inventory_id, quantity, status, expires_at)
  values (v_inventory_id, p_quantity, 'held', now() + make_interval(mins => p_ttl_minutes))
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

comment on function public.hold_inventory(uuid, integer, integer) is
  'Atomically reserves capacity for a departure and returns a reservation_id. Raises INVALID_QUANTITY/INVALID_TTL (ttl must be 1-30 minutes) for malformed input, DEPARTURE_NOT_BOOKABLE if the departure/listing/agency isn''t actually live for sale right now, INSUFFICIENT_INVENTORY if not enough capacity is available. service_role only (audit C1) — called by create-quote (Phase 9), before a booking row exists.';

-- Re-apply after CREATE OR REPLACE — Postgres actually preserves a
-- function's ACL across a same-signature REPLACE, so this is redundant in
-- practice, but stated explicitly rather than relied on implicitly, same
-- reasoning as the rest of this migration.
revoke execute on function public.hold_inventory(uuid, integer, integer) from public, anon, authenticated;
grant  execute on function public.hold_inventory(uuid, integer, integer) to service_role;

-- ── Step 3: release_reservation() reason validation ────────────────────────
create or replace function public.release_reservation(p_reservation_id uuid, p_reason text default 'released')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.inventory_reservations;
begin
  if p_reason not in ('released', 'expired', 'cancelled', 'admin_release') then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select * into v_reservation from public.inventory_reservations where id = p_reservation_id for update;

  if v_reservation is null or v_reservation.status in ('released', 'expired') then
    return;  -- idempotent no-op
  end if;

  if v_reservation.status = 'held' then
    update public.inventory set capacity_held = capacity_held - v_reservation.quantity, version = version + 1 where id = v_reservation.inventory_id;
  elsif v_reservation.status = 'confirmed' then
    update public.inventory set capacity_confirmed = capacity_confirmed - v_reservation.quantity, version = version + 1 where id = v_reservation.inventory_id;
  end if;

  -- inventory_reservations.status only ever holds 'held'/'confirmed'/
  -- 'released'/'expired' (its own CHECK constraint, migration 5) — the two
  -- new reason values ('cancelled', 'admin_release') are legitimate CAUSES
  -- of a release, not additional terminal states, so they still map to the
  -- existing 'released' status, same as the original 'released' reason did.
  update public.inventory_reservations
  set    status = case when p_reason = 'expired' then 'expired' else 'released' end,
         released_at = now()
  where  id = p_reservation_id;
end;
$$;

comment on function public.release_reservation(uuid, text) is
  'Releases capacity from either a HELD or CONFIRMED reservation (the latter case covers booking cancellation restoring inventory). Idempotent — releasing an already-released/expired reservation is a safe no-op. p_reason must be one of released/expired/cancelled/admin_release (INVALID_REASON otherwise); all map to status=released except ''expired'', which is the only distinct terminal status inventory_reservations tracks. service_role only (audit C1).';

revoke execute on function public.release_reservation(uuid, text) from public, anon, authenticated;
grant  execute on function public.release_reservation(uuid, text) to service_role;

-- ── Step 4: RLS helper functions — make the anon/authenticated grant
--    explicit rather than an unstated PUBLIC default, and lock down
--    set_departure_capacity to authenticated only ──────────────────────────
-- These are the functions RLS policies invoke as the calling role (not via
-- a service-role edge function), so anon/authenticated genuinely need
-- EXECUTE on them for ordinary queries to work at all — unlike step 1's
-- functions, restricting these would break the app, not secure it. Making
-- the grant explicit (instead of leaving it as the implicit PUBLIC
-- default) is what closes audit C1's actual finding here: today nothing
-- states these are *intentionally* open to anon/authenticated, so nothing
-- distinguishes them from the accidentally-open functions in step 1.

grant execute on function public.current_platform_role() to anon, authenticated;
grant execute on function public.current_platform_role_unverified() to anon, authenticated;
grant execute on function public.is_authenticated_aal2() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.is_finance_or_admin() to anon, authenticated;
grant execute on function public.is_support_or_admin() to anon, authenticated;
grant execute on function public.has_agency_access(uuid, text) to anon, authenticated;
grant execute on function public.is_agency_publicly_approved(uuid) to anon, authenticated;
grant execute on function public.is_conversation_participant(uuid) to anon, authenticated;
grant execute on function public.capacity_available(public.inventory) to anon, authenticated;

-- set_departure_capacity() does its own caller-authorization check
-- internally (has_agency_access(v_agency_id, 'manager')) and is meant to be
-- called directly by an authenticated agency session — but never by a
-- signed-out visitor, who could never pass that internal check anyway and
-- has no legitimate reason to be probing it.
revoke execute on function public.set_departure_capacity(uuid, integer) from public, anon;
grant  execute on function public.set_departure_capacity(uuid, integer) to authenticated;

-- ── Step 5: CI guard — every SECURITY DEFINER function in public that
--    anon/authenticated can still execute, outside the explicit allowlist
--    above. Should always return zero rows; a non-empty result means a
--    future migration reintroduced audit C1's exposure. ──────────────────
create or replace function public.audit_definer_exposure()
returns table(function_name text, arguments text, executable_by text[])
language sql
stable
as $$
  select
    p.proname::text,
    pg_get_function_identity_arguments(p.oid),
    array_remove(array[
      case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
      case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end
    ], null)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef                                   -- SECURITY DEFINER only
    and p.prorettype <> 'trigger'::regtype              -- trigger functions are never PostgREST RPC-callable, regardless of grants — excluded so this guard stays focused on audit C1's actual exposure surface (anon/authenticated hitting /rest/v1/rpc/<fn>), not flagged as noise requiring its own allowlist entries
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity'
    );
$$;

comment on function public.audit_definer_exposure() is
  'CI guard for audit C1: lists every SECURITY DEFINER function in public still reachable by anon/authenticated outside the explicit allowlist (the RLS helper functions from step 4, plus set_departure_capacity). Must return zero rows. service_role only — this is an operational/CI check, not an app feature.';

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
