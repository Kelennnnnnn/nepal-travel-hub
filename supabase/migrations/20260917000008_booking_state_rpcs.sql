-- Fixes audit H2
--
-- bookings_traveler_request_cancel's WITH CHECK only constrained the new
-- booking_status value (cancel_requested/cancelled) and traveler_id
-- ownership — every other column (participant_count, agency_id,
-- listing_id, quote_id, completed_at, and booking_status itself, which
-- could jump straight from confirmed to cancelled bypassing the
-- cancel_requested step) was left completely open to the traveler.
-- bookings_agency_update_own's WITH CHECK only pinned payment_status/
-- balance_status/settlement_status/refund_status to their OLD values —
-- booking_status could move pending_payment -> payment_processing ->
-- confirmed with payment_status staying 'unpaid' the entire time (no
-- payment logic exists yet to actually gate that), and traveler_id/
-- participant_count/agency_id/listing_id/quote_id were all writable by any
-- staff member, not just a manager.
--
-- Fix: drop both UPDATE policies entirely (no client role keeps bare
-- UPDATE on bookings except the existing admin-only bookings_admin_all),
-- and replace them with two narrow SECURITY DEFINER RPCs that do exactly
-- one state transition each, plus a CHECK constraint and a trigger that
-- hold as data-integrity invariants regardless of caller. No payment,
-- refund, or payout logic is added here — see PROMPT SCOPE: request_
-- booking_cancellation() stops at cancel_requested; actual cancellation
-- and any refund remain the payments phase's responsibility.
-- ============================================================================

-- ── 1. Close both open UPDATE policies. ─────────────────────────────────────

drop policy if exists "bookings_traveler_request_cancel" on public.bookings;
drop policy if exists "bookings_agency_update_own" on public.bookings;

-- ── 2. Data-integrity invariant: a booking can never be confirmed/in_progress/
--    completed while its platform-fee payment_status is still unpaid. This
--    holds for EVERY writer, including admin and service_role — it is not an
--    authorization rule, it is a fact about what "confirmed" is allowed to
--    mean, exactly like the existing transition-guard triggers above it. ────

alter table public.bookings
  add constraint bookings_paid_before_active check (
    booking_status not in ('confirmed', 'in_progress', 'completed')
    or payment_status in ('paid', 'partially_refunded', 'disputed')
  );

comment on constraint bookings_paid_before_active on public.bookings is
  'The future trusted-agency "pay at agency" tier will add an explicit bookings.fee_collection_mode column and extend this constraint (e.g. exempting fee_collection_mode = ''agency_collected'' bookings from the payment_status requirement) — that column does not exist yet and is deliberately NOT added by this migration (audit H2 is RLS/authorization scope, not a payments feature).';

-- ── 3. request_booking_cancellation(): the only way a traveler moves their
--    own booking toward cancellation. Stops at cancel_requested — does not
--    set cancelled, does not touch inventory or any payment/refund column.
--    Actual cancellation (inventory release, refund initiation) is the
--    payments phase's job, once it exists. ─────────────────────────────────

create or replace function public.request_booking_cancellation(p_booking_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.booking_status <> 'confirmed' then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  update public.bookings
  set booking_status = 'cancel_requested',
      cancellation_reason = left(coalesce(p_reason, ''), 1000)
  where id = p_booking_id;

  perform public.record_booking_event(
    p_booking_id, 'CANCEL_REQUESTED',
    jsonb_build_object('reason', left(coalesce(p_reason, ''), 1000))
  );
end;
$$;

comment on function public.request_booking_cancellation(uuid, text) is
  'Audit H2. The only client-reachable path from confirmed to cancel_requested. Deliberately stops there: it does not set cancelled, does not release inventory, and does not touch payment_status/refund_status — those all require actual refund logic that does not exist yet (out of scope, see this migration''s header). Only the booking''s own traveler, only from booking_status=confirmed (pending_payment -> NOT_CANCELLABLE, since nothing has been paid yet to refund).';

revoke execute on function public.request_booking_cancellation(uuid, text) from public, anon;
grant  execute on function public.request_booking_cancellation(uuid, text) to authenticated;

-- ── 4. agency_set_trip_status(): the only way agency staff move a booking
--    through fulfillment. Manager+ only (a plain staff member could not
--    trigger this before either, in principle, but the old policy never
--    actually checked — has_agency_access(agency_id) with no min_role
--    argument defaults to 'staff'). The existing guard_booking_status_
--    transition trigger still enforces the graph (confirmed -> in_progress
--    -> completed, not a direct jump) — this function does not bypass it. ──

create or replace function public.agency_set_trip_status(p_booking_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  if p_status not in ('in_progress', 'completed', 'no_show') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select agency_id into v_agency_id from public.bookings where id = p_booking_id for update;

  if v_agency_id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = 'P0001';
  end if;

  update public.bookings
  set booking_status = p_status,
      completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_booking_id;

  perform public.record_booking_event(p_booking_id, 'TRIP_STATUS_' || upper(p_status), '{}'::jsonb);
end;
$$;

comment on function public.agency_set_trip_status(uuid, text) is
  'Audit H2. Requires manager+ of the booking''s agency (not just any staff member, which the old bookings_agency_update_own policy allowed via has_agency_access''s default min_role=''staff''). p_status is restricted to the three fulfillment-only values; guard_booking_status_transition (migration 20260916000007) still validates the actual edge is legal, so e.g. confirmed -> completed directly still fails INVALID_TRANSITION even though both are in this function''s allowed p_status list.';

revoke execute on function public.agency_set_trip_status(uuid, text) from public, anon;
grant  execute on function public.agency_set_trip_status(uuid, text) to authenticated;

-- ── 5. Belt-and-suspenders: even though no client-role policy grants bare
--    UPDATE on bookings anymore (step 1), pin down the columns above the
--    RPCs should never be able to touch as a hard invariant, not just an
--    absence of a policy — the same defense-in-depth reasoning as the
--    financial-fields lock on messages. ────────────────────────────────────

create or replace function public.guard_booking_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- nullif(..., '') guards against an empty-but-set GUC (''::jsonb raises
  -- invalid_text_representation, unlike an unset GUC which current_setting
  -- with missing_ok=true just returns NULL for) — defensive, not merely a
  -- test-fixture convenience: any caller/pooler path that ends up setting
  -- this GUC to '' rather than leaving it unset must not crash every write.
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
begin
  if v_is_service_role or public.is_admin() then
    return new;
  end if;

  if new.quote_id is distinct from old.quote_id
     or new.listing_id is distinct from old.listing_id
     or new.departure_id is distinct from old.departure_id
     or new.agency_id is distinct from old.agency_id
     or new.traveler_id is distinct from old.traveler_id
     or new.participant_count is distinct from old.participant_count
     or new.booking_ref is distinct from old.booking_ref
     or new.created_at is distinct from old.created_at
  then
    raise exception 'IMMUTABLE_FIELD_CHANGE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_booking_immutable_fields() is
  'Audit H2 defense-in-depth: quote_id/listing_id/departure_id/agency_id/traveler_id/participant_count/booking_ref/created_at can never change via any UPDATE that is not service_role or admin, regardless of what future policies or functions get added to this table. request_booking_cancellation() and agency_set_trip_status() above never touch any of these columns, so this trigger is a no-op for them.';

drop trigger if exists guard_booking_immutable_fields on public.bookings;
create trigger guard_booking_immutable_fields
  before update on public.bookings
  for each row execute function public.guard_booking_immutable_fields();

-- ── 6. Extend audit C1's exposure-guard allowlist for the two new
--    authenticated-granted functions above (same reasoning/pattern as the
--    audit C2 migration's own extension of this function — re-created here
--    rather than editing migration 005 directly, rule 2). ─────────────────

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
      'capacity_available', 'set_departure_capacity',
      -- audit C2 additions
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      -- audit H2 additions: both authenticated-only, argument-validated,
      -- and re-derive/re-check ownership and privilege level from live
      -- tables rather than trusting anything client-supplied
      'request_booking_cancellation', 'agency_set_trip_status'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
