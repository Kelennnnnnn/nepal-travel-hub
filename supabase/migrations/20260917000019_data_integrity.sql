-- Adds the data-integrity rules identified as missing from the catalog/
-- pricing/inventory schema: single-currency enforcement, overlapping
-- seasonal price ranges, duplicate/backdated price overrides, capacity set
-- above what a listing can actually hold, departures created in the past
-- or landing on a blackout date (and vice versa), unbounded listing text/
-- array fields, malformed cancellation policies, and a platform_fee that
-- doesn't actually match platform_fee_percent. None of these change any
-- existing data semantics — every new rule is additive validation that the
-- current, correctly-behaving write paths already satisfy.
-- ============================================================================

-- ── 1. Currency: NPR-only, everywhere a currency column exists in the
--    pricing tier (target: platform_settings.supported_currencies is
--    '["NPR"]' — these checks make the schema itself enforce what that
--    setting currently says, rather than leaving it as an unenforced
--    convention). Widen (drop these four constraints, or change them to an
--    IN-list read from platform_settings) when multi-currency ships. ──────

alter table public.listings
  add constraint chk_listings_currency_npr check (currency = 'NPR');
alter table public.seasonal_pricing
  add constraint chk_seasonal_pricing_currency_npr check (currency = 'NPR');
alter table public.price_overrides
  add constraint chk_price_overrides_currency_npr check (currency = 'NPR');
alter table public.booking_quotes
  add constraint chk_booking_quotes_currency_npr check (currency = 'NPR');

-- ── 2. Seasonal pricing: two date ranges for the SAME listing must never
--    overlap — nothing previously stopped an agency from defining two
--    conflicting seasonal prices for overlapping dates, leaving whichever
--    row the pricing engine happened to pick first as the "real" price. ──

create extension if not exists btree_gist;

alter table public.seasonal_pricing
  add constraint excl_seasonal_pricing_no_overlap
  exclude using gist (listing_id with =, daterange(start_date, end_date, '[]') with &&);

comment on constraint excl_seasonal_pricing_no_overlap on public.seasonal_pricing is
  'No two seasonal_pricing rows for the same listing may cover an overlapping (inclusive) date range. Requires btree_gist for the uuid equality operator class inside a GiST index.';

-- ── 3. Price overrides: at most one override per departure, and at most
--    one per (listing, date) — previously nothing stopped two conflicting
--    overrides from existing for the same departure/date, leaving pricing
--    resolution to pick arbitrarily between them. override_date must be
--    today or later for a non-admin — a backdated override could otherwise
--    be used to retroactively justify a price after the fact. ────────────

create unique index idx_price_overrides_unique_departure
  on public.price_overrides (departure_id)
  where departure_id is not null;

create unique index idx_price_overrides_unique_listing_date
  on public.price_overrides (listing_id, override_date)
  where override_date is not null;

create or replace function public.guard_price_override_date()
returns trigger
language plpgsql
as $$
begin
  -- current_user (NOT session_user, which never changes even after `SET
  -- ROLE`/`SET LOCAL ROLE` — it always reflects the original login role)
  -- exemption matches the reasoning documented on guard_departure_past_
  -- date() below — direct superuser writes (test fixtures, migrations/
  -- seeds) and service_role (edge functions acting on an admin's behalf)
  -- are trusted contexts, not a live non-admin write.
  if new.override_date is not null
     and new.override_date < current_date
     and current_user not in ('postgres', 'service_role')
     and not public.is_admin() then
    raise exception 'OVERRIDE_DATE_IN_PAST: override_date must be today or later' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.guard_price_override_date() is
  'Non-admins cannot insert a price_overrides row with a past override_date. Admins (and trusted service contexts) may, e.g. for corrections/backfill.';

drop trigger if exists guard_price_override_date on public.price_overrides;
create trigger guard_price_override_date
  before insert on public.price_overrides
  for each row execute function public.guard_price_override_date();

-- ── 5. Departures: departure_date cannot be created in the past by a
--    non-admin (a plain CHECK can't express "unless is_admin()" — that's a
--    role-conditional business rule, not a pure value constraint, so it
--    needs a trigger). cutoff_at, on the other hand, is a pure function of
--    two columns on the same row and needs no role logic at all — a plain
--    CHECK constraint is enough. ───────────────────────────────────────

create or replace function public.guard_departure_past_date()
returns trigger
language plpgsql
as $$
begin
  -- Fixture/migration writes run as the postgres superuser with no JWT
  -- claims at all (see supabase/tests/lockdown-definer-functions.sql's own
  -- "Fixtures inserted as postgres/superuser — bypasses RLS, which is
  -- fine, this is test setup" comment, which deliberately seeds a
  -- past-dated departure) — is_admin() alone would reject that, since it
  -- reads JWT claims that are empty in that context. service_role (edge
  -- functions) is equally trusted. current_user (not session_user, which
  -- never changes even after `SET ROLE`/`SET LOCAL ROLE`) is what actually
  -- reflects the effective role for the current statement — a real
  -- non-admin app write always goes through PostgREST as the
  -- `authenticated` role, which this correctly still restricts.
  if new.departure_date < current_date
     and current_user not in ('postgres', 'service_role')
     and not public.is_admin() then
    raise exception 'DEPARTURE_DATE_IN_PAST: departure_date cannot be in the past' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.guard_departure_past_date() is
  'Non-admins cannot create a departure dated before today. Admins/service_role/direct superuser writes (test fixtures, backfill) are exempt.';

drop trigger if exists guard_departure_past_date on public.departures;
create trigger guard_departure_past_date
  before insert on public.departures
  for each row execute function public.guard_departure_past_date();

alter table public.departures
  add constraint chk_departures_cutoff_after_departure
  check (cutoff_at is null or cutoff_at <= (departure_date + 1)::timestamptz);

comment on constraint chk_departures_cutoff_after_departure on public.departures is
  'A booking cutoff cannot fall after the day following its own departure date — a later cutoff would let someone book a trip that has effectively already happened.';

-- ── 6. Blackout dates vs. departures — mutually exclusive: a listing
--    cannot have a scheduled departure on a date that is also blacked out
--    for it, in either direction. A cancelled departure doesn't count as
--    "occupying" its date for this purpose — it's no longer a real,
--    bookable occurrence, so a blackout may still be added over it. ──────

create or replace function public.guard_departure_blackout_conflict()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'departures' then
    if exists (
      select 1 from public.blackout_dates b
      where b.listing_id = new.listing_id and b.blackout_date = new.departure_date
    ) then
      raise exception 'DEPARTURE_ON_BLACKOUT_DATE: % is a blackout date for this listing', new.departure_date
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'blackout_dates' then
    if exists (
      select 1 from public.departures d
      where d.listing_id = new.listing_id
        and d.departure_date = new.blackout_date
        and d.status <> 'cancelled'
    ) then
      raise exception 'BLACKOUT_CONFLICTS_WITH_DEPARTURE: a scheduled departure already exists on %', new.blackout_date
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_departure_blackout_conflict() is
  'Shared by triggers on both departures and blackout_dates (tg_table_name branches). Neither table may gain a row that conflicts with the other for the same listing/date. Applies to admins too — this is a data-integrity invariant, not a permission check.';

drop trigger if exists guard_departure_blackout_conflict on public.departures;
create trigger guard_departure_blackout_conflict
  before insert or update of listing_id, departure_date on public.departures
  for each row execute function public.guard_departure_blackout_conflict();

drop trigger if exists guard_departure_blackout_conflict on public.blackout_dates;
create trigger guard_departure_blackout_conflict
  before insert or update of listing_id, blackout_date on public.blackout_dates
  for each row execute function public.guard_departure_blackout_conflict();

-- ── 7. Listings text/array limits — previously unbounded, so a single
--    listing row could carry an arbitrarily large title/description/
--    includes list, or a non-array value in images/itinerary that every
--    frontend consumer already assumes is an array. ──────────────────────

alter table public.listings
  add constraint chk_listings_title_length check (char_length(title) between 5 and 150),
  add constraint chk_listings_description_length check (char_length(description) <= 20000),
  add constraint chk_listings_location_length check (char_length(location) <= 150),
  add constraint chk_listings_duration_label_length check (char_length(duration_label) <= 50),
  add constraint chk_listings_includes_max_items check (coalesce(array_length(includes, 1), 0) <= 50),
  add constraint chk_listings_excludes_max_items check (coalesce(array_length(excludes, 1), 0) <= 50),
  add constraint chk_listings_images_is_array check (jsonb_typeof(images) = 'array'),
  add constraint chk_listings_itinerary_is_array check (jsonb_typeof(itinerary) = 'array');

-- ── 8. cancellation_policy shape validation — must be
--    {"tiers": [{"days": int >= 0, "refund_percent": 0..100}, ...]},
--    strictly descending by days, at most 10 tiers. This can't be a CHECK
--    constraint (needs to iterate the array), so it's a trigger. Applies
--    unconditionally, including to admins — a malformed policy is wrong
--    regardless of who wrote it. ───────────────────────────────────────

create or replace function public.guard_cancellation_policy()
returns trigger
language plpgsql
as $$
declare
  v_tiers jsonb;
  v_tier jsonb;
  v_prev_days numeric := null;
  v_days numeric;
  v_refund_percent numeric;
  v_count int := 0;
begin
  if jsonb_typeof(new.cancellation_policy) is distinct from 'object' then
    raise exception 'INVALID_CANCELLATION_POLICY: must be a JSON object' using errcode = 'P0001';
  end if;

  v_tiers := new.cancellation_policy -> 'tiers';
  if v_tiers is null or jsonb_typeof(v_tiers) is distinct from 'array' then
    raise exception 'INVALID_CANCELLATION_POLICY: "tiers" must be an array' using errcode = 'P0001';
  end if;

  if jsonb_array_length(v_tiers) > 10 then
    raise exception 'INVALID_CANCELLATION_POLICY: at most 10 tiers are allowed' using errcode = 'P0001';
  end if;

  for v_tier in select * from jsonb_array_elements(v_tiers) loop
    v_count := v_count + 1;

    if jsonb_typeof(v_tier) is distinct from 'object'
       or jsonb_typeof(v_tier -> 'days') is distinct from 'number'
       or jsonb_typeof(v_tier -> 'refund_percent') is distinct from 'number' then
      raise exception 'INVALID_CANCELLATION_POLICY: tier % must be an object with numeric "days" and "refund_percent"', v_count
        using errcode = 'P0001';
    end if;

    v_days := (v_tier ->> 'days')::numeric;
    v_refund_percent := (v_tier ->> 'refund_percent')::numeric;

    if v_days <> trunc(v_days) or v_days < 0 then
      raise exception 'INVALID_CANCELLATION_POLICY: tier % "days" must be a non-negative integer', v_count
        using errcode = 'P0001';
    end if;

    if v_refund_percent < 0 or v_refund_percent > 100 then
      raise exception 'INVALID_CANCELLATION_POLICY: tier % "refund_percent" must be between 0 and 100', v_count
        using errcode = 'P0001';
    end if;

    if v_prev_days is not null and v_days >= v_prev_days then
      raise exception 'INVALID_CANCELLATION_POLICY: tier "days" values must be strictly descending (tier % is not less than the previous tier)', v_count
        using errcode = 'P0001';
    end if;
    v_prev_days := v_days;
  end loop;

  return new;
end;
$$;

comment on function public.guard_cancellation_policy() is
  'Validates listings.cancellation_policy on every insert/update: an object with a "tiers" array (max 10) of {days: non-negative integer, refund_percent: 0-100}, days strictly descending. Raises a clear INVALID_CANCELLATION_POLICY error naming which tier failed, rather than a raw JSON operator error.';

drop trigger if exists guard_cancellation_policy on public.listings;
create trigger guard_cancellation_policy
  before insert or update of cancellation_policy on public.listings
  for each row execute function public.guard_cancellation_policy();

-- ── 4. Capacity vs. listing max — set_departure_capacity() (migrations 3
--    and 11) never checked the new total against the listing's own
--    max_participants, so an agency could set a departure's capacity to
--    far more seats than the listing itself claims to support. Also
--    refuses to touch capacity on a departure that's cancelled or already
--    in the past — there's never a legitimate reason to resize either
--    (unconditional — no is_admin() exception, unlike the max_participants
--    check below). Re-created in full since only the body changes. ──────

create or replace function public.set_departure_capacity(p_departure_id uuid, p_capacity_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_listing_id uuid;
  v_status text;
  v_departure_date date;
  v_max_participants integer;
  v_reserved integer;
begin
  select agency_id, listing_id, status, departure_date
    into v_agency_id, v_listing_id, v_status, v_departure_date
    from public.departures where id = p_departure_id;
  if v_agency_id is null then
    raise exception 'DEPARTURE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE: not a manager of this departure''s agency' using errcode = '42501';
  end if;

  if not public.agency_is_active(v_agency_id) then
    raise exception 'AGENCY_SUSPENDED' using errcode = 'P0001';
  end if;

  if v_status = 'cancelled' or v_departure_date < current_date then
    raise exception 'DEPARTURE_NOT_MODIFIABLE: cannot set capacity on a cancelled or past departure' using errcode = 'P0001';
  end if;

  if p_capacity_total < 0 then
    raise exception 'INVALID_CAPACITY: capacity_total cannot be negative' using errcode = 'P0001';
  end if;

  select max_participants into v_max_participants from public.listings where id = v_listing_id;
  if p_capacity_total > v_max_participants and not public.is_admin() then
    raise exception 'CAPACITY_ABOVE_LISTING_MAX: capacity_total (%) exceeds this listing''s max_participants (%)', p_capacity_total, v_max_participants
      using errcode = 'P0001';
  end if;

  select coalesce(capacity_held, 0) + coalesce(capacity_confirmed, 0) into v_reserved
  from public.inventory where departure_id = p_departure_id;

  if v_reserved is not null and p_capacity_total < v_reserved then
    -- Friendlier than letting the table's own CHECK constraint
    -- (capacity_held + capacity_confirmed <= capacity_total) raise a raw
    -- constraint-violation error — same underlying invariant, clearer cause.
    raise exception 'CAPACITY_BELOW_RESERVED: % spots are already held or confirmed, cannot set capacity below that', v_reserved
      using errcode = 'P0001';
  end if;

  insert into public.inventory (departure_id, capacity_total)
  values (p_departure_id, p_capacity_total)
  on conflict (departure_id) do update
    set capacity_total = excluded.capacity_total, version = public.inventory.version + 1;
end;
$$;

comment on function public.set_departure_capacity(uuid, integer) is
  'The only way to set or change a departure''s bookable capacity outside the reservation flow (hold_inventory/confirm_reservation/release_reservation, migration 5). Lazily creates the inventory row on first call. Refuses to reduce capacity below what is already held+confirmed, to touch a cancelled or past departure at all, or (unless is_admin()) to set capacity above the listing''s own max_participants.';

-- ── 9. Fee arithmetic (schema only — quote creation logic is Phase 8/
--    payments work, out of scope here) and the platform_settings key
--    create-quote will need to read platform_fee_percent from. ──────────

alter table public.booking_quotes
  add constraint chk_booking_quotes_fee_matches_percent
  check (platform_fee = round(product_value * platform_fee_percent / 100, 2));

insert into public.platform_settings (key, value, description) values
  ('reservation_fee_percent', '15'::jsonb, 'Percentage of product_value charged as the platform''s reservation fee. create-quote (payments phase, not yet built) must read this value at quote-creation time rather than hard-coding a percentage — this row exists so that function has something correct to read from day one.')
on conflict (key) do nothing;
