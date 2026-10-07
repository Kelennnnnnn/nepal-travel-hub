-- ============================================================================
-- Into Nepal — Prompt 24: remove hardcoded business data from the frontend
-- and admin panel, make it admin-managed.
--
-- Three new catalog/config tables (categories, destinations, site_content),
-- platform_settings extended with a real type/bounds/sensitivity system so
-- "who can change what" and "what values are even legal" are enforced in
-- the database (not just the admin UI), and every Prompt 20-22 function that
-- used a literal fee/window/count is re-created here reading that value from
-- platform_settings instead. Changing a setting only ever affects NEW holds/
-- quotes from this point on — every existing booking_quotes row already
-- froze its own snapshot (fee_refund_rule, platform_fee_percent, etc.) at
-- creation time, which is the whole reason those snapshot columns exist in
-- the first place (Prompt 20's own design).
-- ============================================================================

-- ── 1. platform_settings: real types, bounds, and sensitivity ──────────────

alter table public.platform_settings
  add column value_type  text,
  add column min_value   numeric,
  add column max_value   numeric,
  add column sensitivity text not null default 'normal';

-- Backfill every existing row's type/bounds before the type column becomes
-- required — matches this schema's established "temporary default, drop
-- immediately after backfilling" convention for a column going from
-- nothing to NOT NULL on a live (if empty-of-real-data) table.
update public.platform_settings set value_type = 'number',  min_value = 5,   max_value = 30  where key = 'inventory_hold_ttl_minutes';
update public.platform_settings set value_type = 'json'                                      where key = 'supported_currencies';
update public.platform_settings set value_type = 'boolean'                                    where key = 'maintenance_mode';
update public.platform_settings set value_type = 'string'                                     where key = 'platform_name';
update public.platform_settings set value_type = 'string'                                     where key = 'support_email';
update public.platform_settings set value_type = 'number',  min_value = 5,   max_value = 30, sensitivity = 'financial' where key = 'reservation_fee_percent';
update public.platform_settings set value_type = 'number',  min_value = 1,   max_value = 720, sensitivity = 'financial' where key = 'fee_free_cancel_hours_day';
update public.platform_settings set value_type = 'number',  min_value = 1,   max_value = 720, sensitivity = 'financial' where key = 'fee_free_cancel_hours_multiday';

alter table public.platform_settings alter column value_type set not null;
alter table public.platform_settings
  add constraint chk_platform_settings_value_type check (value_type in ('number', 'boolean', 'string', 'json')),
  add constraint chk_platform_settings_sensitivity check (sensitivity in ('normal', 'financial'));

comment on column public.platform_settings.value_type is
  'What JSON type `value` must be — checked by guard_platform_settings_value() below on every write, so a typo (e.g. a string where a number is expected) fails loudly instead of silently breaking whatever reads it.';
comment on column public.platform_settings.min_value is 'Inclusive lower bound, numbers only. NULL = unbounded below.';
comment on column public.platform_settings.max_value is 'Inclusive upper bound, numbers only. NULL = unbounded above.';
comment on column public.platform_settings.sensitivity is
  '''financial'' keys (the reservation fee percentage and every cancellation/no-show window that changes what a traveler is owed) require is_super_admin() to change — see the re-created platform_settings_admin_write policy below. ''normal'' keys only require is_admin().';

-- New keys this phase introduces. Seeded with the exact defaults the
-- Prompt 20-22 functions already hardcoded, so flipping them over to read
-- from here (below) is a pure refactor, not a behavior change, for anyone
-- who never touches the admin Settings page.
insert into public.platform_settings (key, value, description, value_type, min_value, max_value, sensitivity) values
  ('agency_confirm_window_hours',   '24'::jsonb,  'How long an agency_confirm listing''s agency has to accept or decline a booking after the reservation fee is paid, before it times out.', 'number', 1, 720, 'normal'),
  ('agency_confirm_reminder_hours', '12'::jsonb,  'How many hours before the agency_confirm_window deadline the one reminder notification fires.', 'number', 1, 720, 'normal'),
  ('no_show_dispute_hours',         '48'::jsonb,  'How long a traveler has to dispute a no-show (either direction) after it''s marked.', 'number', 1, 720, 'financial'),
  ('auto_complete_after_hours',     '24'::jsonb,  'How long after a trip''s scheduled end it auto-completes (making it reviewable) if nothing disputes it first.', 'number', 1, 720, 'normal'),
  ('max_holds_per_traveler',        '3'::jsonb,   'Per-traveler cap on simultaneous unpaid holds, across every listing — abuse/inventory-squatting guard.', 'number', 1, 20, 'normal'),
  ('support_phone',                 'null'::jsonb, 'Support phone number shown on Contact/FAQ — null until a real number is set; the frontend hides the phone line entirely rather than showing a placeholder.', 'string', null, null, 'normal'),
  ('legal_email',                   '"legal@intonepal.com"'::jsonb, 'Contact address shown on the Terms of Service page.', 'string', null, null, 'normal'),
  ('privacy_email',                 '"privacy@intonepal.com"'::jsonb, 'Contact address shown on the Privacy Policy page.', 'string', null, null, 'normal'),
  ('site_url',                      '"https://intonepal.com"'::jsonb, 'Canonical site URL — mirrors supabase/functions/_shared/branding.ts''s SITE_URL constant for the frontend''s own use (SEO tags, absolute links).', 'string', null, null, 'normal')
on conflict (key) do nothing;

-- ── 1b. get_setting_numeric() — the one place SQL business logic reads a
--    numeric platform_settings value, so every call site in this migration
--    (and every future one) looks the same and can''t typo a key name past
--    a missing-row check. Internal only, same "truly internal" pattern as
--    resolve_unit_price()/is_date_bookable() — no grant to any role. ───────

create or replace function public.get_setting_numeric(p_key text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (value::text)::numeric from public.platform_settings where key = p_key;
$$;

comment on function public.get_setting_numeric(text) is
  'Reads a numeric platform_settings value by key. Raises nothing special for a missing key — callers get SQL NULL, same as any other missing-row select, and every call site below already has a coalesce() fallback matching the pre-Prompt-24 hardcoded default for exactly that reason (a setting row deleted out from under a live function should degrade to the old default, not crash bookings). Internal only, no grants.';

revoke all on function public.get_setting_numeric(text) from public, anon, authenticated, service_role;

-- ── 1c. Re-created write policy: financial keys need is_super_admin() ───────

drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write"
  on public.platform_settings for update
  using (case when sensitivity = 'financial' then public.is_super_admin() else public.is_admin() end)
  with check (case when sensitivity = 'financial' then public.is_super_admin() else public.is_admin() end);

-- ── 1d. Validation trigger: type + bounds, on every write ──────────────────

create or replace function public.guard_platform_settings_value()
returns trigger
language plpgsql
as $$
declare
  v_numeric numeric;
begin
  if new.value_type = 'number' and jsonb_typeof(new.value) <> 'number' then
    raise exception 'INVALID_SETTING_VALUE: % must be a number', new.key using errcode = 'P0001';
  elsif new.value_type = 'boolean' and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'INVALID_SETTING_VALUE: % must be a boolean', new.key using errcode = 'P0001';
  elsif new.value_type = 'string' and jsonb_typeof(new.value) not in ('string', 'null') then
    raise exception 'INVALID_SETTING_VALUE: % must be a string', new.key using errcode = 'P0001';
  end if;

  if new.value_type = 'number' then
    v_numeric := (new.value::text)::numeric;
    if new.min_value is not null and v_numeric < new.min_value then
      raise exception 'INVALID_SETTING_VALUE: % must be >= %', new.key, new.min_value using errcode = 'P0001';
    end if;
    if new.max_value is not null and v_numeric > new.max_value then
      raise exception 'INVALID_SETTING_VALUE: % must be <= %', new.key, new.max_value using errcode = 'P0001';
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

comment on function public.guard_platform_settings_value() is
  'Validates value_type/min_value/max_value on every UPDATE of a platform_settings row (defense in depth underneath the admin UI''s own input validation — this is what actually makes "value 50 for reservation_fee_percent is rejected" true regardless of caller) and sets updated_by = auth.uid() unconditionally, so a client can never spoof who made a change.';

drop trigger if exists guard_platform_settings_value on public.platform_settings;
create trigger guard_platform_settings_value
  before update on public.platform_settings
  for each row execute function public.guard_platform_settings_value();

-- ── 2. categories ────────────────────────────────────────────────────────

create table public.categories (
  -- plain text, not citext: must match listings.category's exact type for
  -- the FK below (listings.category is already an exact-match enum-style
  -- value, e.g. 'Trekking' — never needed case-insensitivity).
  slug                      text primary key,
  name                      text not null,
  description               text not null default '',
  icon                      text not null default '🌍',
  sort_order                integer not null default 0,
  active                    boolean not null default true,
  is_multi_day_default      boolean not null default false,
  default_confirmation_mode text not null default 'instant' check (default_confirmation_mode in ('instant', 'agency_confirm')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.categories is
  'Replaces listings.category''s old hardcoded CHECK constraint (Prompt 24) — admin-managed via the Catalog pages. Deactivating a category (active=false) hides it from the listing-creation form and traveler filters but never touches existing listings already in it (their category FK still resolves fine; the row is just excluded from "active categories" queries, never deleted).';

create trigger set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

insert into public.categories (slug, name, icon, sort_order, is_multi_day_default, default_confirmation_mode) values
  ('Trekking',       'Trekking',       '🥾', 1, true,  'agency_confirm'),
  ('Adventure',      'Adventure',      '🪂', 2, false, 'instant'),
  ('Cultural',       'Cultural',       '🏛️', 3, false, 'instant'),
  ('Wildlife',       'Wildlife',       '🐘', 4, false, 'instant'),
  ('Rafting',        'Rafting',        '🚣', 5, false, 'instant'),
  ('Mountaineering', 'Mountaineering', '🏔️', 6, true,  'agency_confirm'),
  ('Wellness',       'Wellness',       '🧘', 7, false, 'instant'),
  ('Photography',    'Photography',   '📷', 8, false, 'instant')
on conflict (slug) do nothing;

alter table public.categories enable row level security;

-- Everyone may see every category row, even inactive ones — an inactive
-- category still needs to render correctly on the EXISTING listings that
-- reference it (hiding the row itself would just show "unknown category"
-- on those listings instead). "Active-only" filtering for the create-
-- listing form and traveler filters is the frontend's job, not an RLS one.
create policy "categories_public_select"
  on public.categories for select
  using (true);

create policy "categories_admin_write"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2b. listings.category: CHECK constraint -> FK to categories ────────────

alter table public.listings drop constraint listings_category_check;
alter table public.listings
  add constraint listings_category_fkey foreign key (category) references public.categories(slug);

-- ── 2c. guard_listing_rules(): confirmation_mode default now reads
--    categories.default_confirmation_mode instead of a hardcoded category
--    name list. Re-created in full (only this one branch''s body changes). ──

create or replace function public.guard_listing_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_default text;
begin
  if tg_op = 'INSERT' and new.confirmation_mode is null then
    select default_confirmation_mode into v_category_default from public.categories where slug = new.category;
    if new.duration_days > 1 or coalesce(v_category_default, 'instant') = 'agency_confirm' then
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
  'Fills confirmation_mode (INSERT only, now from categories.default_confirmation_mode rather than a hardcoded category-name list — Prompt 24) and min_advance_hours (INSERT/UPDATE) defaults when null, and enforces the two role-conditional booking-rule invariants a CHECK constraint cannot express.';

-- This function was declared SECURITY INVOKER before Prompt 24 (it had no
-- "security definer" line) — it needs one now because it reads
-- public.categories, a table the agency role writing the listing has no
-- direct SELECT grant on otherwise. Re-stated explicitly rather than relied
-- on implicitly, same reasoning as every other such change in this schema.
-- Re-apply search_path/owner-privilege-dependent trigger unchanged.
drop trigger if exists guard_listing_rules on public.listings;
create trigger guard_listing_rules
  before insert or update on public.listings
  for each row execute function public.guard_listing_rules();

-- ── 3. destinations ──────────────────────────────────────────────────────
-- Schema only — the actual province/district/destination rows are a
-- reviewed data file (supabase/seed/destinations.sql, wired into
-- supabase/config.toml''s db.seed.sql_paths for local `supabase db reset`;
-- production needs one manual `psql $DATABASE_URL -f supabase/seed/
-- destinations.sql` run after the first `supabase db push` — see README).

create table public.destinations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  district   text,
  province   text,
  region     text,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, district)
);

comment on table public.destinations is
  'Admin-managed destination list (Nepal''s 7 provinces + 77 districts, plus common named trekking/touring regions) — seeded from supabase/seed/destinations.sql, a reviewed data file, never invented at runtime. listings.destination_id (below) is nullable and additive: the existing free-text listings.location column is untouched and remains what actually renders on a listing.';

create trigger set_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

create index idx_destinations_active on public.destinations (active, sort_order);

alter table public.destinations enable row level security;

create policy "destinations_public_select"
  on public.destinations for select
  using (true);

create policy "destinations_admin_write"
  on public.destinations for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.listings add column destination_id uuid references public.destinations(id);

comment on column public.listings.destination_id is
  'Nullable, additive (Prompt 24) — links a listing to the admin-managed destinations list for filtering, without disturbing the existing free-text location column every listing already has and still displays.';

-- ── 4. site_content ──────────────────────────────────────────────────────

create table public.site_content (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

comment on table public.site_content is
  'Admin-editable marketing copy for the handful of pieces marketing will actually change post-launch (home_hero, community_impact, contact_page) — everything else stays static JSX by design, per this migration''s own instruction not to move UI text that nobody is going to edit through an admin form.';

create trigger set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

insert into public.site_content (key, value) values
  ('home_hero', '{"heading": "Epic, Responsible Adventures in the High Himalayas", "subheading": "Join small, expert-led expeditions and authentic cultural treks crafted exclusively by verified local Nepali agencies."}'::jsonb),
  ('community_impact', '{"heading": "Adventure Tourism That Truly Honors the Mountain Communities", "body": "Traditional international trekking booking channels often strip up to 50% of your booking fee in overseas agency margins. Into Nepal directly links conscientious global adventurers with licensed, locally-owned trekking agencies."}'::jsonb),
  ('contact_page', '{"intro": "Have a question or need help planning your trip? We''re here for you."}'::jsonb)
on conflict (key) do nothing;

alter table public.site_content enable row level security;

create policy "site_content_public_select"
  on public.site_content for select
  using (true);

create policy "site_content_admin_write"
  on public.site_content for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. admin_audit_entity_types() — replaces the hardcoded ENTITY_TYPES
--    array in src/pages/admin/AuditLog.tsx (which still listed "payout",
--    a resource type that stopped being written the moment the old
--    payment model was removed). ─────────────────────────────────────────

create or replace function public.admin_audit_entity_types()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct resource_type order by resource_type), array[]::text[])
  from public.audit_logs;
$$;

comment on function public.admin_audit_entity_types() is
  'Every resource_type value that has ever actually been written to audit_logs, for the AuditLog admin filter dropdown — always reflects reality, never a hand-maintained list that drifts (e.g. still listing "payout" after that feature was removed). admin only.';

revoke all on function public.admin_audit_entity_types() from public, anon;
grant execute on function public.admin_audit_entity_types() to authenticated;

-- ============================================================================
-- 6. Re-create every Prompt 20-22 function that hardcoded a fee/window/count
--    literal this phase moved into platform_settings. Each coalesce()
--    fallback matches that literal exactly, so a deleted settings row
--    degrades to the pre-Prompt-24 behavior instead of breaking bookings.
-- ============================================================================

-- ── 6a. create_booking_hold(): the 3-hold-per-traveler cap ─────────────────

create or replace function public.create_booking_hold(
  p_listing_id     uuid,
  p_date           date,
  p_pax            integer,
  p_primary_guest  jsonb
)
returns table(
  booking_id         uuid,
  booking_ref        text,
  hold_expires_at    timestamptz,
  product_value      numeric,
  platform_fee       numeric,
  agency_balance     numeric,
  amount_due_now     numeric,
  currency           text,
  confirmation_mode  text,
  payment_requirement text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                uuid;
  v_role                text;
  v_full_name           text;
  v_email               text;
  v_phone               text;
  v_listing             public.listings;
  v_status              text;
  v_existing_id         uuid;
  v_existing_ref        text;
  v_existing_quote_id   uuid;
  v_existing_expires    timestamptz;
  v_existing_reservation uuid;
  v_hold_count          integer;
  v_max_holds           integer;
  v_departure_id        uuid;
  v_ttl_minutes         integer;
  v_reservation_id      uuid;
  v_unit_price          numeric;
  v_product_value       numeric;
  v_fee_percent         numeric;
  v_platform_fee        numeric;
  v_agency_balance      numeric;
  v_amount_due_now      numeric;
  v_quote_id            uuid;
  v_expires_at          timestamptz;
  v_start_at            timestamptz;
  v_end_at              timestamptz;
  v_free_cancel_hours   integer;
  v_fee_refund_rule     jsonb;
  v_balance_method      text;
  v_booking_id          uuid;
  v_booking_ref         text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_role := coalesce(public.current_platform_role(), 'traveler');
  if v_role <> 'traveler' then
    raise exception 'ROLE_CANNOT_BOOK' using errcode = 'P0001';
  end if;

  v_full_name := p_primary_guest ->> 'full_name';
  v_email := p_primary_guest ->> 'contact_email';
  v_phone := p_primary_guest ->> 'contact_phone';

  if v_full_name is null or char_length(v_full_name) < 2 or char_length(v_full_name) > 100 then
    raise exception 'INVALID_GUEST: full_name must be 2-100 characters' using errcode = 'P0001';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_GUEST: contact_email is not a valid email address' using errcode = 'P0001';
  end if;
  if v_phone is null or v_phone !~ '^[0-9+()\-[:space:]]{7,20}$' then
    raise exception 'INVALID_GUEST: contact_phone is not a valid phone number' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text || p_date::text)::bigint);

  v_status := public.is_date_bookable(p_listing_id, p_date, p_pax);
  if v_status <> 'open' then
    raise exception 'DATE_NOT_BOOKABLE' using errcode = 'P0001', detail = v_status;
  end if;

  select b.id, b.booking_ref, b.quote_id
    into v_existing_id, v_existing_ref, v_existing_quote_id
  from public.bookings b
  join public.departures d on d.id = b.departure_id
  where b.traveler_id = v_uid and b.listing_id = p_listing_id and d.departure_date = p_date
    and b.booking_status = 'pending_payment'
  for update of b
  limit 1;

  if v_existing_id is not null then
    select q.expires_at into v_existing_expires from public.booking_quotes q where q.id = v_existing_quote_id;

    if v_existing_expires > now() then
      return query
      select b.id, b.booking_ref, q.expires_at, q.product_value, q.platform_fee, q.agency_balance,
             q.amount_due_now, q.currency::text, q.confirmation_mode, q.payment_requirement
      from public.bookings b join public.booking_quotes q on q.id = b.quote_id
      where b.id = v_existing_id;
      return;
    end if;

    select inventory_reservation_id into v_existing_reservation from public.booking_quotes where id = v_existing_quote_id;
    perform public.release_reservation(v_existing_reservation, 'expired');
    update public.booking_quotes set status = 'expired' where id = v_existing_quote_id;
    update public.bookings set booking_status = 'expired' where id = v_existing_id;
    perform public.record_booking_event(v_existing_id, 'HOLD_EXPIRED', '{}'::jsonb);
  end if;

  if exists (
    select 1 from public.bookings b
    join public.departures d on d.id = b.departure_id
    where b.traveler_id = v_uid and b.listing_id = p_listing_id and d.departure_date = p_date
      and b.booking_status in ('payment_processing', 'awaiting_agency_confirmation', 'confirmed', 'in_progress')
  ) then
    raise exception 'ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  select count(*) into v_hold_count
  from public.bookings b
  join public.booking_quotes q on q.id = b.quote_id
  where b.traveler_id = v_uid and b.booking_status = 'pending_payment' and q.expires_at > now();

  v_max_holds := coalesce(public.get_setting_numeric('max_holds_per_traveler'), 3)::integer;
  if v_hold_count >= v_max_holds then
    raise exception 'TOO_MANY_HOLDS' using errcode = 'P0001';
  end if;

  v_departure_id := public.ensure_departure(p_listing_id, p_date);

  v_ttl_minutes := coalesce(public.get_setting_numeric('inventory_hold_ttl_minutes'), 15)::integer;
  v_ttl_minutes := greatest(5, least(30, v_ttl_minutes));

  v_reservation_id := public.hold_inventory(v_departure_id, p_pax, v_ttl_minutes);
  select expires_at into v_expires_at from public.inventory_reservations where id = v_reservation_id;

  v_unit_price := public.resolve_unit_price(p_listing_id, p_date);
  v_product_value := v_unit_price * p_pax;

  v_fee_percent := coalesce(public.get_setting_numeric('reservation_fee_percent'), 15);
  v_platform_fee := round(v_product_value * v_fee_percent / 100, 2);
  v_agency_balance := v_product_value - v_platform_fee;
  v_amount_due_now := case when v_listing.payment_requirement = 'full_online' then v_product_value else v_platform_fee end;

  v_start_at := (p_date + v_listing.default_start_time) at time zone 'Asia/Kathmandu';
  v_end_at := v_start_at + (ceil(v_listing.duration_days)::int || ' days')::interval;

  v_free_cancel_hours := coalesce(
    public.get_setting_numeric(case when v_listing.duration_days <= 1 then 'fee_free_cancel_hours_day' else 'fee_free_cancel_hours_multiday' end)::integer,
    case when v_listing.duration_days <= 1 then 24 else 168 end
  );
  v_fee_refund_rule := jsonb_build_object('free_cancel_hours', v_free_cancel_hours);

  insert into public.booking_quotes (
    listing_id, departure_id, agency_id, traveler_id, participant_count,
    product_value, platform_fee_percent, platform_fee, agency_balance, currency,
    cancellation_policy_snapshot, inventory_reservation_id, status, expires_at,
    confirmation_mode, payment_requirement, amount_due_now, start_at, end_at,
    no_show_grace_minutes, fee_refund_rule
  ) values (
    p_listing_id, v_departure_id, v_listing.agency_id, v_uid, p_pax,
    v_product_value, v_fee_percent, v_platform_fee, v_agency_balance, v_listing.currency,
    v_listing.cancellation_policy, v_reservation_id, 'active', v_expires_at,
    v_listing.confirmation_mode, v_listing.payment_requirement, v_amount_due_now, v_start_at, v_end_at,
    v_listing.no_show_grace_minutes, v_fee_refund_rule
  ) returning id into v_quote_id;

  insert into public.quote_items (quote_id, item_type, description, unit_price, quantity, line_total)
  values (v_quote_id, 'base_product', v_listing.title, v_unit_price, p_pax, v_product_value);

  v_balance_method := case when v_listing.payment_requirement = 'full_online' then 'into_nepal_platform' else null end;

  insert into public.bookings as bk (
    quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count,
    booking_status, payment_status, balance_method
  ) values (
    v_quote_id, p_listing_id, v_departure_id, v_listing.agency_id, v_uid, p_pax,
    'pending_payment', 'unpaid', v_balance_method
  ) returning bk.id, bk.booking_ref into v_booking_id, v_booking_ref;

  update public.inventory_reservations set booking_id = v_booking_id where id = v_reservation_id;

  insert into public.booking_guests (booking_id, full_name, contact_email, contact_phone, is_primary)
  values (v_booking_id, v_full_name, v_email, v_phone, true);

  perform public.record_booking_event(v_booking_id, 'HOLD_CREATED', jsonb_build_object('departure_date', p_date, 'participant_count', p_pax));

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_HOLD_CREATED', 'booking', v_booking_id, jsonb_build_object('listing_id', p_listing_id, 'departure_date', p_date));

  return query
  select v_booking_id, v_booking_ref, v_expires_at, v_product_value, v_platform_fee, v_agency_balance,
         v_amount_due_now, v_listing.currency::text, v_listing.confirmation_mode, v_listing.payment_requirement;
end;
$$;

comment on function public.create_booking_hold(uuid, date, integer, jsonb) is
  'One transaction: validates the caller is a traveler and the date is genuinely open, serializes per listing+date via an advisory lock, deduplicates the caller''s own in-flight hold, enforces the (now admin-configurable, platform_settings.max_holds_per_traveler) per-traveler hold cap, creates the departure on demand, reserves capacity, freezes a price snapshot using the CURRENT reservation_fee_percent/free-cancel-hours settings, and leaves the booking at pending_payment. Prompt 24: every settings read here only affects bookings created from this point forward — existing bookings keep whatever their own booking_quotes row already snapshotted.';

revoke all on function public.create_booking_hold(uuid, date, integer, jsonb) from public, anon;
grant execute on function public.create_booking_hold(uuid, date, integer, jsonb) to authenticated;

-- ── 6b. mark_reservation_fee_paid(): agency_confirm_window_hours + reuse
--    inventory_hold_ttl_minutes for the late-payment re-hold TTL instead of
--    a separate hardcoded 30. ─────────────────────────────────────────────

create or replace function public.mark_reservation_fee_paid(
  p_booking_id   uuid,
  p_provider     text,
  p_provider_ref text,
  p_amount       numeric,
  p_currency     text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_event_id  uuid;
  v_booking             public.bookings;
  v_quote               public.booking_quotes;
  v_departure_date      date;
  v_date_status         text;
  v_new_reservation_id  uuid;
  v_hold_expired        boolean;
  v_result_status       text;
  v_rehold_ttl          integer;
  v_confirm_window      integer;
begin
  select id into v_existing_event_id from public.payment_events
  where provider = p_provider and provider_ref = p_provider_ref;

  if v_existing_event_id is not null then
    select booking_status into v_result_status from public.bookings where id = p_booking_id;
    return v_result_status;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.booking_status not in ('pending_payment', 'payment_processing', 'expired') then
    raise exception 'BOOKING_NOT_PAYABLE' using errcode = 'P0001', detail = v_booking.booking_status;
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if p_amount <> v_quote.amount_due_now or p_currency <> v_quote.currency then
    insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
    values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());
    return v_booking.booking_status;
  end if;

  insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
  values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());

  if v_booking.payment_status = 'unpaid' then
    update public.bookings set payment_status = 'pending' where id = p_booking_id;
  end if;
  update public.bookings set payment_status = 'processing' where id = p_booking_id and payment_status = 'pending';
  update public.bookings set payment_status = 'paid' where id = p_booking_id and payment_status = 'processing';

  select d.departure_date into v_departure_date from public.departures d where d.id = v_booking.departure_id;
  v_hold_expired := v_booking.booking_status = 'expired' or v_quote.status = 'expired' or v_quote.expires_at < now();

  if v_hold_expired then
    v_date_status := public.is_date_bookable(v_booking.listing_id, v_departure_date, v_booking.participant_count);

    if v_date_status = 'open' then
      v_rehold_ttl := greatest(5, least(30, coalesce(public.get_setting_numeric('inventory_hold_ttl_minutes'), 30)::integer));
      v_new_reservation_id := public.hold_inventory(v_booking.departure_id, v_booking.participant_count, v_rehold_ttl);
      update public.inventory_reservations set booking_id = p_booking_id where id = v_new_reservation_id;
      update public.booking_quotes
        set inventory_reservation_id = v_new_reservation_id, status = 'active', expires_at = now() + (v_rehold_ttl || ' minutes')::interval
        where id = v_booking.quote_id;
      v_quote.inventory_reservation_id := v_new_reservation_id;

      if v_booking.booking_status <> 'payment_processing' then
        update public.bookings set booking_status = 'payment_processing' where id = p_booking_id;
      end if;
    else
      perform public.cancel_booking_internal(p_booking_id, 'system', 'paid_after_expiry', 100, 100);
      perform public.record_booking_event(p_booking_id, 'RESERVATION_FEE_PAID', jsonb_build_object('provider', p_provider, 'amount', p_amount, 'currency', p_currency));
      return 'cancelled';
    end if;
  else
    if v_booking.booking_status = 'pending_payment' then
      update public.bookings set booking_status = 'payment_processing' where id = p_booking_id;
    end if;
  end if;

  perform public.confirm_reservation(v_quote.inventory_reservation_id, p_booking_id);
  update public.booking_quotes set status = 'consumed' where id = v_booking.quote_id and status = 'active';

  if v_quote.confirmation_mode = 'instant' then
    update public.bookings set booking_status = 'confirmed' where id = p_booking_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_CONFIRMED', 'booking', p_booking_id, '{}'::jsonb);
    v_result_status := 'confirmed';
  else
    v_confirm_window := coalesce(public.get_setting_numeric('agency_confirm_window_hours'), 24)::integer;
    update public.bookings
    set booking_status = 'awaiting_agency_confirmation', agency_confirm_deadline = now() + (v_confirm_window || ' hours')::interval
    where id = p_booking_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AWAITING_AGENCY', 'booking', p_booking_id, '{}'::jsonb);
    v_result_status := 'awaiting_agency_confirmation';
  end if;

  perform public.record_booking_event(
    p_booking_id, 'RESERVATION_FEE_PAID',
    jsonb_build_object('provider', p_provider, 'amount', p_amount, 'currency', p_currency)
  );

  return v_result_status;
end;
$$;

comment on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) is
  'Called only by the payments-phase webhook after signature verification. Never expose to clients. Idempotent on (p_provider, p_provider_ref). agency_confirm_deadline and the late-payment re-hold TTL now read platform_settings (Prompt 24) instead of hardcoded 24h/30min.';

revoke all on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) to service_role;

-- ── 6c. expire_agency_confirmations(): agency_confirm_reminder_hours ──────

create or replace function public.expire_agency_confirmations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
  v_reminder_hours integer;
begin
  v_reminder_hours := coalesce(public.get_setting_numeric('agency_confirm_reminder_hours'), 12)::integer;

  for v_row in
    select id from public.bookings
    where booking_status = 'awaiting_agency_confirmation'
      and agency_reminder_sent_at is null
      and agency_confirm_deadline > now()
      and agency_confirm_deadline - now() <= (v_reminder_hours || ' hours')::interval
    for update skip locked
  loop
    update public.bookings set agency_reminder_sent_at = now() where id = v_row.id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AGENCY_REMINDER', 'booking', v_row.id, '{}'::jsonb);
  end loop;

  for v_row in
    select id, agency_id, quote_id from public.bookings
    where booking_status = 'awaiting_agency_confirmation' and agency_confirm_deadline < now()
    for update skip locked
  loop
    perform public.cancel_booking_internal(v_row.id, 'system', 'agency_no_response', 100, 100);
    insert into public.agency_strikes (agency_id, booking_id, kind) values (v_row.agency_id, v_row.id, 'no_response');
    insert into public.agency_penalties (agency_id, booking_id, kind, amount)
    select v_row.agency_id, v_row.id, 'no_response', q.platform_fee from public.booking_quotes q where q.id = v_row.quote_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AGENCY_TIMEOUT', 'booking', v_row.id, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_agency_confirmations() is
  'pg_cron, every 5 minutes. The reminder lead time now reads platform_settings.agency_confirm_reminder_hours (Prompt 24) instead of a hardcoded 12. Timeouts cancel with a full fee+balance refund, record an agency_strikes row and an agency_penalties row, and emit BOOKING_AGENCY_TIMEOUT.';

revoke all on function public.expire_agency_confirmations() from public, anon, authenticated, service_role;

-- ── 6d. agency_mark_no_show() / traveler_report_agency_no_show():
--    no_show_dispute_hours (both the 48h dispute-deadline SET and the 48h
--    report-window CHECK are the same configured number). ─────────────────

create or replace function public.agency_mark_no_show(p_booking_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
  v_dispute_hours integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_booking.agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if v_booking.booking_status not in ('confirmed', 'in_progress') then
    raise exception 'NOT_MARKABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if now() < v_quote.start_at + (v_quote.no_show_grace_minutes || ' minutes')::interval then
    raise exception 'GRACE_PERIOD_NOT_ELAPSED' using errcode = 'P0001';
  end if;
  if now() > v_quote.end_at + interval '24 hours' then
    raise exception 'NO_SHOW_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  v_dispute_hours := coalesce(public.get_setting_numeric('no_show_dispute_hours'), 48)::integer;

  update public.bookings
  set booking_status = 'no_show', no_show_dispute_deadline = now() + (v_dispute_hours || ' hours')::interval
  where id = p_booking_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_NO_SHOW', 'booking', p_booking_id, jsonb_build_object('note', p_note));
  perform public.record_booking_event(p_booking_id, 'MARKED_NO_SHOW', jsonb_build_object('note', left(coalesce(p_note, ''), 1000)));
end;
$$;

comment on function public.agency_mark_no_show(uuid, text) is
  'Manager+ only, only between start_at+grace and end_at+24h. Creates NO refund_records at all, by design. Opens a dispute window of platform_settings.no_show_dispute_hours (Prompt 24; was a hardcoded 48h) — no_show_dispute_deadline.';

revoke all on function public.agency_mark_no_show(uuid, text) from public, anon;
grant execute on function public.agency_mark_no_show(uuid, text) to authenticated;

create or replace function public.traveler_report_agency_no_show(p_booking_id uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
  v_dispute_id uuid;
  v_dispute_hours integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.booking_status not in ('confirmed', 'in_progress') then
    raise exception 'NOT_DISPUTABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;
  if now() < v_quote.start_at + (v_quote.no_show_grace_minutes || ' minutes')::interval then
    raise exception 'GRACE_PERIOD_NOT_ELAPSED' using errcode = 'P0001';
  end if;

  v_dispute_hours := coalesce(public.get_setting_numeric('no_show_dispute_hours'), 48)::integer;
  if now() > v_quote.end_at + (v_dispute_hours || ' hours')::interval then
    raise exception 'REPORT_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if p_statement is null or char_length(p_statement) < 20 or char_length(p_statement) > 2000 then
    raise exception 'INVALID_STATEMENT: must be 20-2000 characters' using errcode = 'P0001';
  end if;

  update public.bookings set booking_status = 'disputed' where id = p_booking_id;

  insert into public.booking_disputes (booking_id, opened_by, kind, statement)
  values (p_booking_id, auth.uid(), 'agency_no_show', p_statement)
  returning id into v_dispute_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_DISPUTE_OPENED', 'booking', p_booking_id, jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'agency_no_show'));
  perform public.record_booking_event(p_booking_id, 'DISPUTE_OPENED', jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'agency_no_show'));
end;
$$;

comment on function public.traveler_report_agency_no_show(uuid, text) is
  'The traveler-initiated mirror of agency_mark_no_show(): "the AGENCY never showed up." Own booking, only from confirmed/in_progress, only between start_at+grace and end_at+platform_settings.no_show_dispute_hours (Prompt 24; was a hardcoded 48h).';

revoke all on function public.traveler_report_agency_no_show(uuid, text) from public, anon;
grant execute on function public.traveler_report_agency_no_show(uuid, text) to authenticated;

-- ── 6e. complete_finished_bookings(): auto_complete_after_hours ───────────

create or replace function public.complete_finished_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
  v_after_hours integer;
begin
  v_after_hours := coalesce(public.get_setting_numeric('auto_complete_after_hours'), 24)::integer;

  for v_row in
    select b.id from public.bookings b
    join public.booking_quotes q on q.id = b.quote_id
    where b.booking_status in ('confirmed', 'in_progress')
      and q.end_at + (v_after_hours || ' hours')::interval < now()
      and not exists (select 1 from public.booking_disputes bd where bd.booking_id = b.id and bd.status = 'open')
    for update of b skip locked
  loop
    update public.bookings set booking_status = 'completed', completed_at = now() where id = v_row.id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_COMPLETED', 'booking', v_row.id, '{}'::jsonb);
    perform public.record_booking_event(v_row.id, 'AUTO_COMPLETED', '{}'::jsonb);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.complete_finished_bookings() is
  'pg_cron, every 15 minutes. The auto-complete lead time now reads platform_settings.auto_complete_after_hours (Prompt 24; was a hardcoded 24h). confirmed/in_progress bookings past it, with no open dispute, become completed. A no_show booking is never touched here.';

revoke all on function public.complete_finished_bookings() from public, anon, authenticated, service_role;

-- ── 7. Extend audit C1's exposure-guard allowlist ──────────────────────────

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
      'apply_blackout_preset', 'agency_close_date', 'get_bookable_dates',
      'create_booking_hold', 'release_booking_hold', 'get_booking_hold_status',
      'agency_respond_to_booking', 'respond_via_token', 'booking_summary_for_token',
      'suggest_alternatives',
      'compute_traveler_cancellation', 'traveler_cancel_booking', 'agency_cancel_booking',
      'traveler_reschedule', 'traveler_choose_refund',
      'agency_mark_no_show', 'traveler_dispute_no_show', 'traveler_report_agency_no_show',
      'admin_resolve_dispute', 'booking_policy_summary', 'listing_policy_preview',
      'admin_booking_timeline',
      -- Phase 24 addition: re-derives privilege from audit_logs' own content,
      -- not a client-supplied list.
      'admin_audit_entity_types'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
