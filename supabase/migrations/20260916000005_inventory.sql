-- ============================================================================
-- Into Nepal — migration 5 of N: Inventory
--
-- PHASE_1_ARCHITECTURE.md §3.3. This is the most concurrency-critical part of
-- the whole schema, and directly fixes two confirmed, currently-live bugs in
-- the old system (AUDIT_REPORT.md AVAIL-01/AVAIL-02): the old schema had TWO
-- separate, never-reconciled trigger pairs both decrementing/restoring
-- spots_remaining on every booking/cancellation — a leftover AFTER INSERT/
-- UPDATE trigger from the original migration that was never dropped when a
-- newer, correct atomic RPC (claim_availability_spots) was introduced later.
-- Every booking double-decremented; every cancellation double-restored.
--
-- Here there is exactly ONE write path: hold_inventory() / confirm_reservation()
-- / release_reservation(), each a single atomic UPDATE. No trigger anywhere
-- in this schema decrements or restores capacity as a side effect of a
-- bookings-table write — capacity changes ONLY happen by explicitly calling
-- one of these three functions, which is exactly the discipline the old
-- system lacked.
-- ============================================================================

create table public.inventory (
  id                 uuid primary key default gen_random_uuid(),
  departure_id       uuid not null unique references public.departures(id) on delete cascade,
  capacity_total      integer not null check (capacity_total >= 0),
  capacity_held       integer not null default 0 check (capacity_held >= 0),
  capacity_confirmed  integer not null default 0 check (capacity_confirmed >= 0),
  version            integer not null default 0,  -- optimistic-lock counter, belt-and-
                                                     -- suspenders alongside the atomic
                                                     -- UPDATE pattern below (target §10)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (capacity_held + capacity_confirmed <= capacity_total)
);

comment on table public.inventory is
  'One row per departure. capacity_available is NOT a stored column — it is always capacity_total - capacity_held - capacity_confirmed, computed at read time (see capacity_available() below) so there is exactly one formula for it, never a value that can drift out of sync with the three source columns.';

create trigger set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

create or replace function public.capacity_available(inv public.inventory)
returns integer
language sql
immutable
as $$
  select inv.capacity_total - inv.capacity_held - inv.capacity_confirmed;
$$;

comment on function public.capacity_available(public.inventory) is
  'Usage: SELECT capacity_available(inventory) FROM inventory WHERE ... (Postgres composite-type function-call syntax). Single source of truth for "how many spots are actually free right now."';

-- ── Reservations (HELD/CONFIRMED/RELEASED/EXPIRED state machine — target §10) ─

create table public.inventory_reservations (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventory(id) on delete cascade,
  booking_id    uuid,  -- FK added in the Booking migration once bookings exists
                        -- (nullable until a booking row actually exists — a
                        -- reservation is held during quote/payment-attempt
                        -- BEFORE a booking is created, per target §13 steps 7-8)
  quantity      integer not null check (quantity > 0),
  status        text not null default 'held' check (status in ('held', 'confirmed', 'released', 'expired')),
  held_at       timestamptz not null default now(),
  expires_at    timestamptz not null,
  confirmed_at  timestamptz,
  released_at   timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.inventory_reservations is
  'Explicit HELD/CONFIRMED/RELEASED/EXPIRED lifecycle, decoupled from the booking row itself (target §7/§10). A HELD row that expires before payment completes is reclaimed by expire_stale_reservations() (below), independent of whatever later happens to any booking that might reference it.';

create index idx_inventory_reservations_inventory on public.inventory_reservations (inventory_id);
create index idx_inventory_reservations_booking on public.inventory_reservations (booking_id);
create index idx_inventory_reservations_expiry on public.inventory_reservations (status, expires_at) where status = 'held';

-- ── The three atomic operations. Every one is a single UPDATE statement —
--    the row lock Postgres takes for the UPDATE's WHERE clause is what makes
--    "check availability and commit to it" indivisible, closing exactly the
--    race condition target §10's worked example describes (six travelers,
--    five spots, only five may succeed). ─────────────────────────────────────

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
begin
  if p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  -- The atomic claim: this single UPDATE's WHERE clause re-checks capacity
  -- and commits to it in the same statement, under the row's lock. No two
  -- concurrent callers can both succeed for the last spot(s) — exactly the
  -- pattern the old system's claim_availability_spots() got right (kept
  -- here, per PHASE_1_ARCHITECTURE.md §8's explicit "keep the pattern").
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
  values (v_inventory_id, p_quantity, 'held', now() + (p_ttl_minutes || ' minutes')::interval)
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

comment on function public.hold_inventory(uuid, integer, integer) is
  'Atomically reserves capacity for a departure and returns a reservation_id. Raises INSUFFICIENT_INVENTORY if not enough capacity is available. Called by create-quote (Phase 9), before a booking row exists.';

create or replace function public.confirm_reservation(p_reservation_id uuid, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.inventory_reservations;
begin
  select * into v_reservation from public.inventory_reservations where id = p_reservation_id for update;

  if v_reservation is null then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_reservation.status = 'confirmed' then
    -- Idempotent: a webhook replay calling this twice for the same
    -- reservation is a safe no-op, not a double-confirm.
    return;
  end if;

  if v_reservation.status <> 'held' then
    -- Expired or already released — this is the "payment succeeds after a
    -- hold has expired" scenario target §10/§51 explicitly calls out. This
    -- function does NOT silently confirm in that case; it raises, and the
    -- caller (the booking-confirmation transaction, migration 7) is
    -- responsible for routing to the manual-resolution path described in
    -- PHASE_1_ARCHITECTURE.md §3.3 rather than either overselling or
    -- silently keeping the traveler's money with no booking.
    raise exception 'RESERVATION_NOT_HELD' using errcode = 'P0001';
  end if;

  update public.inventory
  set    capacity_held = capacity_held - v_reservation.quantity,
         capacity_confirmed = capacity_confirmed + v_reservation.quantity,
         version = version + 1
  where  id = v_reservation.inventory_id;

  update public.inventory_reservations
  set    status = 'confirmed', confirmed_at = now(), booking_id = p_booking_id
  where  id = p_reservation_id;
end;
$$;

comment on function public.confirm_reservation(uuid, uuid) is
  'Moves a HELD reservation to CONFIRMED (capacity_held -> capacity_confirmed) and links it to the now-created booking. Idempotent on repeat calls for an already-confirmed reservation. Raises RESERVATION_NOT_HELD if the hold already expired/released — caller must handle this explicitly, never assume success.';

create or replace function public.release_reservation(p_reservation_id uuid, p_reason text default 'released')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.inventory_reservations;
begin
  select * into v_reservation from public.inventory_reservations where id = p_reservation_id for update;

  if v_reservation is null or v_reservation.status in ('released', 'expired') then
    return;  -- idempotent no-op
  end if;

  if v_reservation.status = 'held' then
    update public.inventory set capacity_held = capacity_held - v_reservation.quantity, version = version + 1 where id = v_reservation.inventory_id;
  elsif v_reservation.status = 'confirmed' then
    update public.inventory set capacity_confirmed = capacity_confirmed - v_reservation.quantity, version = version + 1 where id = v_reservation.inventory_id;
  end if;

  update public.inventory_reservations
  set    status = case when p_reason = 'expired' then 'expired' else 'released' end,
         released_at = now()
  where  id = p_reservation_id;
end;
$$;

comment on function public.release_reservation(uuid, text) is
  'Releases capacity from either a HELD or CONFIRMED reservation (the latter case covers booking cancellation restoring inventory). Idempotent — releasing an already-released/expired reservation is a safe no-op, which is what makes it safe to call from both a cancellation flow and, separately, the expiry sweep below without coordinating who calls it first.';

create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select id from public.inventory_reservations
    where status = 'held' and expires_at < now()
    for update skip locked
    -- SKIP LOCKED: if two invocations of this sweep somehow overlap, they
    -- simply divide the expired rows between them rather than blocking on
    -- each other or double-processing the same row.
  loop
    perform public.release_reservation(v_row.id, 'expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.expire_stale_reservations() is
  'Called on a schedule (pg_cron, replacing the old reap-stale-bookings design) to reclaim capacity from HELD reservations whose TTL has passed with no completed payment. Operates on inventory_reservations directly, not on bookings as a side effect — decoupling the hold''s lifecycle from the booking''s lifecycle, per PHASE_1_ARCHITECTURE.md §3.3.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.inventory enable row level security;
alter table public.inventory_reservations enable row level security;

drop policy if exists "inventory_public_select" on public.inventory;
create policy "inventory_public_select"
  on public.inventory for select
  using (exists (
    select 1 from public.departures d join public.listings l on l.id = d.listing_id
    where d.id = inventory.departure_id and l.status = 'published'
  ));
  -- Public can SEE capacity (needed to show "3 spots left" on the listing
  -- page) but has no write grant at all — every mutation goes through the
  -- SECURITY DEFINER functions above, called from trusted server functions
  -- (create-quote, confirm-booking, cancel-booking), never directly via
  -- `supabase.from("inventory").update(...)` from the browser. This is the
  -- concrete enforcement of target §10's "never rely on frontend
  -- availability checks + client-side decrement."

drop policy if exists "inventory_staff_select_own" on public.inventory;
create policy "inventory_staff_select_own"
  on public.inventory for select
  using (exists (select 1 from public.departures d where d.id = inventory.departure_id and public.has_agency_access(d.agency_id)));

drop policy if exists "inventory_admin_all" on public.inventory;
create policy "inventory_admin_all" on public.inventory for all using (public.is_admin()) with check (public.is_admin());

-- inventory_reservations has NO select/insert/update policy for travelers or
-- agency staff at all — it is purely a server-internal bookkeeping table,
-- touched only via the SECURITY DEFINER functions and read only by admins
-- for operational visibility. This is deliberate: a traveler doesn't need to
-- see their own HELD row directly (the booking_quotes row is what the
-- frontend shows them), and exposing raw reservation rows would leak
-- capacity-shape information about other travelers' in-flight checkouts.
drop policy if exists "inventory_reservations_admin_select" on public.inventory_reservations;
create policy "inventory_reservations_admin_select"
  on public.inventory_reservations for select
  using (public.is_admin());
