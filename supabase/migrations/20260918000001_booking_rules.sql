-- ============================================================================
-- Into Nepal — Phase 19: Flexible-date booking rules
--
-- Switches every listing from pre-created, hand-managed departures with a
-- fixed seat count to on-demand dates: the traveler picks any open date, and
-- the system creates the departure row itself (ensure_departure()) only when
-- one is actually needed. Agencies stop creating departures/capacity by hand
-- (set_departure_capacity() from migrations 6/11/19 still exists — nothing
-- calls it from the UI anymore) and instead configure RULES that describe
-- which dates are open at all: notice period, operating days, blackout
-- calendars, group-size bounds, a daily cap on bookings, and a pause switch.
--
-- This migration builds the rules layer and the read-side API
-- (get_bookable_dates/is_date_bookable) only. Holds, quotes, and bookings
-- against an on-demand date are Prompt 20's job — nothing here creates a
-- booking or charges anyone. get_bookable_dates below therefore references
-- booking_status = 'awaiting_agency_confirmation', a value that does not
-- exist in bookings.booking_status's CHECK constraint yet (Prompt 20 adds
-- it to the state machine) — harmless today (it simply never matches any
-- row) and correct once that status exists.
-- ============================================================================

-- ── 1. listings: booking-rule columns ───────────────────────────────────────

alter table public.listings
  add column confirmation_mode      text check (confirmation_mode in ('instant', 'agency_confirm')),
  add column restricted_area        boolean not null default false,
  add column min_participants       integer not null default 1,
  add column min_advance_hours      integer,
  add column max_advance_days       integer not null default 365,
  add column default_start_time     time not null default '07:00',
  add column operating_days         smallint[],
  add column daily_booking_limit    integer,
  add column bookings_paused        boolean not null default false,
  add column no_show_grace_minutes  integer not null default 30,
  add column payment_requirement    text not null default 'fee_only';

comment on column public.listings.confirmation_mode is
  'instant = capacity/rules alone decide bookability; agency_confirm = the agency must explicitly accept the booking (Prompt 20). Nullable on write — guard_listing_rules() below fills the default on INSERT only; agencies may change it afterward via a plain update.';
comment on column public.listings.restricted_area is
  'Admin-only (see guard_listing_protected_fields below) — a listing that needs extra notice/group-size floor because it touches a permit-controlled or restricted zone. Agencies request this via support, not a self-service toggle.';
comment on column public.listings.min_advance_hours is
  'Nullable on write — guard_listing_rules() below fills a sane default (restricted_area / multi-day / day-activity) whenever this is null, on both INSERT and UPDATE.';
comment on column public.listings.operating_days is
  'ISO weekdays (1=Monday..7=Sunday) this listing runs on. NULL means every day.';
comment on column public.listings.daily_booking_limit is
  'Max number of booking GROUPS (not pax) per calendar date. NULL = unlimited.';
comment on column public.listings.payment_requirement is
  'fee_only = the existing 15%-reservation-fee model; full_online = the agency requires the whole price upfront (refund option 2). full_online is restricted to day activities (duration_days <= 1) unless is_admin() — multi-day stays on the reservation-fee model for now.';

alter table public.listings
  add constraint chk_listings_min_participants
    check (min_participants >= 1 and min_participants <= max_participants),
  add constraint chk_listings_restricted_area_min_participants
    check (not restricted_area or min_participants >= 2),
  add constraint chk_listings_min_advance_hours_bounds
    check (
      min_advance_hours is null
      or (duration_days <= 1 and min_advance_hours between 2 and 720)
      or (duration_days > 1 and min_advance_hours between 24 and 2160)
    ),
  add constraint chk_listings_max_advance_days
    check (max_advance_days between 1 and 540),
  add constraint chk_listings_operating_days
    check (operating_days is null or operating_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  add constraint chk_listings_daily_booking_limit
    check (daily_booking_limit is null or daily_booking_limit >= 1),
  add constraint chk_listings_no_show_grace
    check (no_show_grace_minutes between 15 and 60),
  add constraint chk_listings_payment_requirement
    check (payment_requirement in ('fee_only', 'full_online'));

-- Role-conditional rules a plain CHECK can't express (same reasoning as
-- guard_departure_past_date/guard_listing_status_transition: CHECK
-- constraints are pure row-value predicates, with no way to ask "unless
-- is_admin()"). Named to sort alphabetically AFTER guard_listing_protected_
-- fields (below) among this table's BEFORE triggers — Postgres fires
-- same-event BEFORE ROW triggers in trigger-name order, and this function
-- must see restricted_area AFTER it has already been re-pinned to OLD for a
-- non-admin writer, not the client's raw, possibly-spoofed value.
create or replace function public.guard_listing_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.confirmation_mode is null then
    if new.duration_days > 1 or new.category in ('Trekking', 'Mountaineering') then
      new.confirmation_mode := 'agency_confirm';
    else
      new.confirmation_mode := 'instant';
    end if;
  end if;

  if new.min_advance_hours is null then
    if new.restricted_area then
      new.min_advance_hours := 336;
    elsif new.duration_days > 1 then
      new.min_advance_hours := 168;
    else
      new.min_advance_hours := 24;
    end if;
  end if;

  if new.restricted_area and new.min_advance_hours < 336 and not public.is_admin() then
    raise exception 'INVALID_MIN_ADVANCE_HOURS: restricted-area listings require min_advance_hours >= 336'
      using errcode = 'P0001';
  end if;

  if new.payment_requirement = 'full_online' and new.duration_days > 1 and not public.is_admin() then
    raise exception 'INVALID_PAYMENT_REQUIREMENT: full_online is only allowed for day activities (duration_days <= 1)'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_listing_rules() is
  'Fills confirmation_mode (INSERT only) and min_advance_hours (INSERT/UPDATE) defaults when null, and enforces the two role-conditional booking-rule invariants a CHECK constraint cannot express. Everything else about these columns (bounds, restricted_area->min_participants>=2) is a plain CHECK constraint above, applicable to every writer including admins.';

create trigger guard_listing_rules
  before insert or update on public.listings
  for each row execute function public.guard_listing_rules();

-- ── Extend guard_listing_protected_fields (migrations 2/9/11) to also pin
--    restricted_area for non-admins — re-created in full per this repo's
--    "never edit an existing migration file" rule. ───────────────────────────

create or replace function public.guard_listing_protected_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    new.rating := 0;
    new.review_count := 0;
    new.restricted_area := false;
    return new;
  end if;

  new.featured := old.featured;
  new.rating := old.rating;
  new.review_count := old.review_count;
  new.agency_id := old.agency_id;
  new.restricted_area := old.restricted_area;

  return new;
end;
$$;

comment on function public.guard_listing_protected_fields() is
  'Audit H3 + Phase 19: featured/rating/review_count/agency_id (H3) and now restricted_area (Phase 19 — admin-only; agencies request it via support, never a self-service toggle) are all pinned to false/0/OLD for non-admin writers. pg_trigger_depth() > 1 exempts recalc_listing_rating''s own nested write, same as before.';

-- ── 2. agencies: agency-wide pause + alert preferences (agency-editable,
--    unlike payout_account_reference/legal_name/slug — no change needed to
--    guard_agency_protected_fields, these columns are deliberately NOT added
--    to its pin list). ───────────────────────────────────────────────────────

alter table public.agencies
  add column bookings_paused        boolean not null default false,
  add column alert_phone_e164       text,
  add column alert_whatsapp_opt_in  boolean not null default false,
  add column alert_sms_opt_in       boolean not null default false;

alter table public.agencies
  add constraint chk_agencies_alert_phone_e164
    check (alert_phone_e164 is null or alert_phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- ── 3. Blackouts ─────────────────────────────────────────────────────────────

create table public.agency_blackout_periods (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  reason       text,
  listing_ids  uuid[],   -- null = every listing this agency owns
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366),
  check (reason is null or char_length(reason) <= 200)
);

comment on table public.agency_blackout_periods is
  'Agency-wide or per-listing date ranges where no new booking should be possible, layered on top of the existing per-listing blackout_dates (migration 4). listing_ids NULL applies to every listing the agency owns; a non-null array is checked (guard_blackout_period_listing_ids) against the agency''s own listings.';

create index idx_agency_blackout_periods_agency on public.agency_blackout_periods (agency_id, start_date, end_date);

create or replace function public.guard_blackout_period_listing_ids()
returns trigger
language plpgsql
as $$
begin
  if new.listing_ids is not null and exists (
    select 1 from unnest(new.listing_ids) as lid
    where not exists (
      select 1 from public.listings l where l.id = lid and l.agency_id = new.agency_id
    )
  ) then
    raise exception 'INVALID_LISTING_IDS: every id in listing_ids must be a listing owned by this agency'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_blackout_period_listing_ids
  before insert or update of listing_ids, agency_id on public.agency_blackout_periods
  for each row execute function public.guard_blackout_period_listing_ids();

alter table public.agency_blackout_periods enable row level security;

create policy "agency_blackout_periods_staff_select"
  on public.agency_blackout_periods for select
  using (public.has_agency_access(agency_id));

create policy "agency_blackout_periods_staff_manage"
  on public.agency_blackout_periods for all
  using (public.has_agency_access(agency_id, 'manager'))
  with check (public.has_agency_access(agency_id, 'manager') and public.agency_is_active(agency_id));

create policy "agency_blackout_periods_admin_all"
  on public.agency_blackout_periods for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.platform_blackout_presets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  year        integer not null,
  description text,
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

comment on table public.platform_blackout_presets is
  'Admin-managed festival/holiday date ranges (Dashain, Tihar, ...) that change every year — deliberately data, never hardcoded in application logic. Agencies copy one into their own agency_blackout_periods via apply_blackout_preset() below.';

create index idx_platform_blackout_presets_active on public.platform_blackout_presets (active, start_date);

alter table public.platform_blackout_presets enable row level security;

create policy "platform_blackout_presets_public_select"
  on public.platform_blackout_presets for select
  using (active);

create policy "platform_blackout_presets_admin_all"
  on public.platform_blackout_presets for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.apply_blackout_preset(p_preset_id uuid, p_listing_ids uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id   uuid;
  v_preset      public.platform_blackout_presets;
  v_existing_id uuid;
  v_new_id      uuid;
begin
  select * into v_preset from public.platform_blackout_presets where id = p_preset_id;
  if v_preset is null then
    raise exception 'PRESET_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- No agency_id parameter is taken from the client — derived from the
  -- caller's own manager-or-owner membership, same trust boundary as
  -- set_departure_capacity() deriving the agency from the departure rather
  -- than a client-supplied id.
  select agency_id into v_agency_id
  from public.agency_users
  where user_id = auth.uid() and removed_at is null and accepted_at is not null
    and agency_role in ('manager', 'owner')
  limit 1;

  if v_agency_id is null then
    raise exception 'INSUFFICIENT_PRIVILEGE: caller is not a manager of any agency' using errcode = '42501';
  end if;

  if not public.agency_is_active(v_agency_id) then
    raise exception 'AGENCY_SUSPENDED' using errcode = 'P0001';
  end if;

  -- Idempotent: re-applying the same preset to the same agency returns the
  -- already-existing row instead of inserting a duplicate.
  select id into v_existing_id
  from public.agency_blackout_periods
  where agency_id = v_agency_id
    and reason = v_preset.name
    and start_date = v_preset.start_date
    and end_date = v_preset.end_date;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.agency_blackout_periods (agency_id, start_date, end_date, reason, listing_ids, created_by)
  values (v_agency_id, v_preset.start_date, v_preset.end_date, v_preset.name, p_listing_ids, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.apply_blackout_preset(uuid, uuid[]) is
  'Copies a platform festival preset into the caller''s own agency_blackout_periods. Manager+ of an active agency only. Idempotent on (agency_id, preset name, dates).';

revoke all on function public.apply_blackout_preset(uuid, uuid[]) from public, anon;
grant execute on function public.apply_blackout_preset(uuid, uuid[]) to authenticated;

create or replace function public.agency_close_date(p_listing_id uuid, p_date date, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_id        uuid;
begin
  select agency_id into v_agency_id from public.listings where id = p_listing_id;
  if v_agency_id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE: not a manager of this listing''s agency' using errcode = '42501';
  end if;

  if not public.agency_is_active(v_agency_id) then
    raise exception 'AGENCY_SUSPENDED' using errcode = 'P0001';
  end if;

  insert into public.agency_blackout_periods (agency_id, start_date, end_date, reason, listing_ids, created_by)
  values (v_agency_id, p_date, p_date, coalesce(p_reason, 'Closed from the availability calendar'), array[p_listing_id], auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.agency_close_date(uuid, date, text) is
  'Shorthand used by the agency availability calendar: closes a single date for a single listing by inserting a one-day agency_blackout_periods row. Manager+ of an active agency only.';

revoke all on function public.agency_close_date(uuid, date, text) from public, anon;
grant execute on function public.agency_close_date(uuid, date, text) to authenticated;

-- ── 4. Inventory: capacity_total NULL = unlimited ───────────────────────────

alter table public.inventory alter column capacity_total drop not null;

alter table public.inventory drop constraint inventory_capacity_total_check;
alter table public.inventory drop constraint inventory_check;

alter table public.inventory
  add constraint chk_inventory_capacity_total check (capacity_total is null or capacity_total >= 0),
  add constraint chk_inventory_capacity_bounds check (capacity_total is null or capacity_held + capacity_confirmed <= capacity_total);

comment on table public.inventory is
  'One row per departure. capacity_total NULL means unlimited capacity (Phase 19 — flexible-date listings) — capacity_available() returns NULL in that case, and hold_inventory() skips the capacity re-check but still increments capacity_held so the reservation lifecycle/counters keep working for operational visibility.';

create or replace function public.capacity_available(inv public.inventory)
returns integer
language sql
immutable
as $$
  select case when inv.capacity_total is null then null
              else inv.capacity_total - inv.capacity_held - inv.capacity_confirmed
         end;
$$;

comment on function public.capacity_available(public.inventory) is
  'NULL means unlimited (Phase 19). Otherwise capacity_total - capacity_held - capacity_confirmed, same single formula as before.';

-- Re-created in full (only the WHERE clause's capacity condition changes) —
-- every Prompt-1 hardening check (INVALID_QUANTITY, INVALID_TTL,
-- DEPARTURE_NOT_BOOKABLE, the atomic single-UPDATE claim, service_role-only
-- grant) is preserved verbatim.
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

  -- Phase 19: when capacity_total is null (unlimited), the capacity
  -- re-check is skipped, but the row is still updated — capacity_held
  -- keeps incrementing so the HELD/CONFIRMED/RELEASED/EXPIRED reservation
  -- lifecycle and operational counters stay meaningful even for an
  -- unlimited-capacity departure.
  update public.inventory
  set    capacity_held = capacity_held + p_quantity,
         version = version + 1
  where  departure_id = p_departure_id
    and  (capacity_total is null or capacity_total - capacity_held - capacity_confirmed >= p_quantity)
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
  'Atomically reserves capacity for a departure and returns a reservation_id. capacity_total NULL (Phase 19, unlimited) skips the capacity re-check. Raises INVALID_QUANTITY/INVALID_TTL for malformed input, DEPARTURE_NOT_BOOKABLE if the departure/listing/agency isn''t live for sale, INSUFFICIENT_INVENTORY if a bounded departure is full. service_role only.';

revoke execute on function public.hold_inventory(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.hold_inventory(uuid, integer, integer) to service_role;

-- set_departure_capacity (migrations 6/11/19) is left exactly as-is — still
-- a valid way to give a departure a FINITE capacity if an agency or admin
-- ever needs one, just no longer called by any UI path.

-- ── 5. Departures become system-managed ─────────────────────────────────────

drop policy if exists "departures_staff_manage" on public.departures;

create policy "departures_staff_select"
  on public.departures for select
  using (public.has_agency_access(agency_id));

comment on table public.departures is
  'A scheduled occurrence of a listing. Phase 19: agencies no longer have any direct INSERT/UPDATE/DELETE grant here at all — departures_staff_select is read-only. The only way a departure comes into existence now is ensure_departure() below, called on demand when a traveler actually needs one for a date; closing a date is done via agency_blackout_periods/agency_close_date(), not by flipping departures.status directly. Admins retain full direct access (departures_admin_all, unchanged).';

create or replace function public.ensure_departure(p_listing_id uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id          uuid;
  v_default_start_time time;
  v_min_advance_hours  integer;
  v_cutoff             timestamptz;
  v_departure_id       uuid;
begin
  select agency_id, default_start_time, min_advance_hours
    into v_agency_id, v_default_start_time, v_min_advance_hours
    from public.listings
    where id = p_listing_id;

  if v_agency_id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- All date/time math in this migration is Asia/Kathmandu: a `date + time`
  -- is a naive timestamp with no zone attached; `at time zone 'Asia/
  -- Kathmandu'` on a naive timestamp means "interpret this wall-clock value
  -- as Kathmandu local time" and converts it to a real timestamptz. This is
  -- the one correct way to turn "this departure's calendar date, at its
  -- configured start time" into an absolute instant travelers' and
  -- agencies' own clocks (in any timezone) agree on.
  v_cutoff := ((p_date + v_default_start_time) at time zone 'Asia/Kathmandu')
              - (v_min_advance_hours || ' hours')::interval;

  insert into public.departures (listing_id, agency_id, departure_date, cutoff_at, status)
  values (p_listing_id, v_agency_id, p_date, v_cutoff, 'scheduled')
  on conflict (listing_id, departure_date) do nothing
  returning id into v_departure_id;

  if v_departure_id is null then
    select id into v_departure_id
    from public.departures
    where listing_id = p_listing_id and departure_date = p_date;
  end if;

  insert into public.inventory (departure_id, capacity_total)
  values (v_departure_id, null)
  on conflict (departure_id) do nothing;

  return v_departure_id;
end;
$$;

comment on function public.ensure_departure(uuid, date) is
  'Creates (or finds) the departure row + unlimited-capacity inventory row for a listing/date, lazily, on demand. Internal only — called by other SECURITY DEFINER functions (the booking-creation flow, Prompt 20), never directly: no role has an EXECUTE grant on this function at all, including service_role (same "truly internal" pattern as expire_stale_reservations). A SECURITY DEFINER caller owned by the same role reaches it regardless of grants, because the owner always has implicit EXECUTE on its own functions.';

revoke all on function public.ensure_departure(uuid, date) from public, anon, authenticated, service_role;

-- ── 6. Bookable-dates API ────────────────────────────────────────────────────
--
-- All date/time math below is Asia/Kathmandu, for the same reason as
-- ensure_departure() above: "is this date too soon to book" has to be
-- answered against the traveler's and agency's shared local clock (Nepal
-- Standard Time, UTC+05:45), never the database server's or a browser's own
-- timezone. p_now defaults to now() for real callers but can be frozen to an
-- exact instant for deterministic tests of the midnight/notice-period edge
-- (e.g. "it's 23:00 NPT and tomorrow 07:00 with 24h notice is too_soon").
-- ----------------------------------------------------------------------------

create or replace function public.get_bookable_dates(
  p_listing_id uuid,
  p_from       date,
  p_to         date,
  p_pax        integer default null,
  p_now        timestamptz default now()
)
returns table(day date, status text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_listing                 record;
  v_agency_bookings_paused  boolean;
  v_unavailable             boolean;
  v_paused                  boolean;
  v_invalid_pax             boolean;
  v_max_date                date;
  v_day                     date;
  v_status                  text;
  v_reason                  text;
  v_day_start               timestamptz;
  v_notice_deadline         timestamptz;
  v_blackout                boolean;
  v_departure_id            uuid;
  v_count                   integer;
begin
  if p_to - p_from > 92 then
    raise exception 'RANGE_TOO_LARGE: range cannot exceed 92 days' using errcode = 'P0001';
  end if;

  select l.agency_id, l.status, l.min_participants, l.max_participants,
         l.min_advance_hours, l.max_advance_days, l.default_start_time,
         l.operating_days, l.daily_booking_limit, l.bookings_paused
    into v_listing
    from public.listings l
    where l.id = p_listing_id;

  if v_listing is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select a.bookings_paused into v_agency_bookings_paused
  from public.agencies a
  where a.id = v_listing.agency_id;

  v_unavailable := v_listing.status <> 'published' or not public.is_agency_publicly_approved(v_listing.agency_id);
  v_paused := v_listing.bookings_paused or coalesce(v_agency_bookings_paused, false);
  v_invalid_pax := p_pax is not null and (p_pax < v_listing.min_participants or p_pax > v_listing.max_participants);
  v_max_date := (p_now at time zone 'Asia/Kathmandu')::date + v_listing.max_advance_days;

  v_day := p_from;
  while v_day <= p_to loop
    v_reason := null;

    if v_unavailable then
      v_status := 'unavailable';
      v_reason := 'This activity is not currently available for booking.';

    elsif v_paused then
      v_status := 'paused';
      v_reason := 'Bookings are temporarily paused.';

    else
      v_day_start := (v_day + v_listing.default_start_time) at time zone 'Asia/Kathmandu';
      v_notice_deadline := v_day_start - (v_listing.min_advance_hours || ' hours')::interval;

      if p_now > v_notice_deadline then
        v_status := 'too_soon';
        v_reason := 'Inside the minimum notice period for this activity.';

      elsif v_day > v_max_date then
        v_status := 'too_far';
        v_reason := 'Beyond how far in advance this activity can be booked.';

      elsif v_listing.operating_days is not null
            and not (extract(isodow from v_day)::smallint = any(v_listing.operating_days)) then
        v_status := 'closed_day';
        v_reason := 'Not a day this activity operates on.';

      else
        v_blackout := exists (
          select 1 from public.blackout_dates bd
          where bd.listing_id = p_listing_id and bd.blackout_date = v_day
        ) or exists (
          select 1 from public.agency_blackout_periods abp
          where abp.agency_id = v_listing.agency_id
            and v_day between abp.start_date and abp.end_date
            and (abp.listing_ids is null or p_listing_id = any(abp.listing_ids))
        );

        if v_blackout then
          v_status := 'blackout';
          v_reason := 'Blocked by a scheduled blackout.';

        elsif v_invalid_pax then
          v_status := 'invalid_pax';
          v_reason := 'Group size is outside this activity''s allowed range.';

        elsif v_listing.daily_booking_limit is not null then
          select d.id into v_departure_id
          from public.departures d
          where d.listing_id = p_listing_id and d.departure_date = v_day;

          if v_departure_id is null then
            v_count := 0;
          else
            select
              (select count(*) from public.bookings b
                where b.departure_id = v_departure_id
                  and b.booking_status in (
                    'pending_payment', 'payment_processing', 'awaiting_agency_confirmation',
                    'confirmed', 'in_progress'
                  ))
              +
              (select count(*) from public.inventory_reservations ir
                join public.inventory inv on inv.id = ir.inventory_id
                where inv.departure_id = v_departure_id
                  and ir.status = 'held' and ir.expires_at > p_now)
            into v_count;
          end if;

          if v_count >= v_listing.daily_booking_limit then
            v_status := 'full';
            v_reason := 'This date has reached its daily booking limit.';
          else
            v_status := 'open';
          end if;

        else
          v_status := 'open';
        end if;
      end if;
    end if;

    day := v_day;
    status := v_status;
    reason := v_reason;
    return next;

    v_day := v_day + 1;
  end loop;
end;
$$;

comment on function public.get_bookable_dates(uuid, date, date, integer, timestamptz) is
  'Public read API behind the traveler-facing date picker. status is exactly one of: unavailable, paused, too_soon, too_far, closed_day, blackout, invalid_pax, full, open — checked in that precedence order, so e.g. a blacked-out date always reports ''blackout'' even if it would also have been ''full''. p_now defaults to now() but can be frozen for deterministic tests of the notice-period edge. SECURITY DEFINER: reads bookings/inventory_reservations directly (neither has a public SELECT policy) to compute ''full'', but returns only the aggregated status, never raw rows.';

revoke all on function public.get_bookable_dates(uuid, date, date, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.get_bookable_dates(uuid, date, date, integer, timestamptz) to anon, authenticated;

create or replace function public.is_date_bookable(
  p_listing_id uuid,
  p_date       date,
  p_pax        integer default null,
  p_now        timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.get_bookable_dates(p_listing_id, p_date, p_date, p_pax, p_now);
$$;

comment on function public.is_date_bookable(uuid, date, integer, timestamptz) is
  'Single-day convenience wrapper around get_bookable_dates(), for reuse by the booking-creation flow (Prompt 20). Internal only, same "nobody, not even service_role, calls this directly" pattern as ensure_departure() — a SECURITY DEFINER caller reaches it via owner privilege regardless.';

revoke all on function public.is_date_bookable(uuid, date, integer, timestamptz) from public, anon, authenticated, service_role;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    every prior migration's own copy of this extension; migration 24's
--    version is the most recent before this one, re-created in full here).
--    ensure_departure/is_date_bookable are deliberately absent from this
--    allowlist: they have NO execute grant to anon or authenticated at all,
--    so they are not part of audit C1's exposure surface in the first
--    place, and the allowlist only needs to cover functions that are. ─────

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
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      'request_booking_cancellation', 'agency_set_trip_status',
      'respond_to_review', 'is_own_review',
      'replace_agency_document',
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency',
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster',
      'save_agency_draft', 'submit_agency_application',
      'delete_my_account',
      'admin_user_directory', 'admin_user_stats',
      'cron_health',
      -- Phase 19 additions: apply_blackout_preset/agency_close_date are
      -- plain manager-gated write RPCs (same shape as agency_set_trip_
      -- status above); get_bookable_dates is the deliberately-public read
      -- API this whole migration exists to build.
      'apply_blackout_preset', 'agency_close_date', 'get_bookable_dates'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
