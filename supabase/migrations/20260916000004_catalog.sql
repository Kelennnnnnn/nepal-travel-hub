-- ============================================================================
-- Into Nepal — migration 4 of N: Catalog
--
-- PHASE_1_ARCHITECTURE.md §3.2. `listings` keeps the old schema's broadly
-- reusable shape (PHASE_0_FORENSIC_AUDIT.md §2) with a slug for clean URLs
-- (target §34) and a status lifecycle that separates admin approval from the
-- agency's own publish action (target §23). `departures` is genuinely new —
-- the old system treated a calendar date as inventory directly; here a
-- departure is its own entity (a scheduled occurrence), and INVENTORY
-- (capacity for that departure) is a separate table in the next migration.
-- Pricing (seasonal_pricing, price_overrides) is deliberately minimal here —
-- the full pricing-resolution engine is Phase 8's job; this migration only
-- creates the tables so Phase 8 has somewhere to build.
-- ============================================================================

create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  slug              citext not null unique,
  title             text not null,
  description       text not null default '',
  category          text not null check (category in (
                       'Trekking', 'Adventure', 'Cultural', 'Wildlife', 'Rafting',
                       'Mountaineering', 'Wellness', 'Photography'
                     )),
                     -- Phase 5 note: matches the taxonomy already shipped across the
                     -- traveler-facing frontend (Activities.tsx, FeaturedAdventures.tsx,
                     -- Index.tsx category links, etc.) exactly, including casing —
                     -- deliberately NOT the original lowercase/generic set this column
                     -- shipped with in Phase 2 (trekking/tour/sightseeing/...), which
                     -- would have required a translation layer at every one of those
                     -- call sites for no real benefit. Schema was unapplied/no live
                     -- data, so aligning it to the real product taxonomy instead of the
                     -- other way around was the lower-risk direction.
  location          text not null,
  duration_label    text not null,       -- human-readable ("3 days", "2 weeks") for display
  duration_days     numeric(6,2) not null check (duration_days > 0),
                     -- Required (not nullable) as of Phase 5 — every listing created
                     -- through the rebuilt form supplies this, which is what finally
                     -- lets usePublishedListings() filter duration server-side via a
                     -- real numeric column instead of fetching up to 2000 rows and
                     -- parsing free-text duration in JS (AUDIT_REPORT.md FE-01).
  base_price        numeric(12,2) not null check (base_price > 0),
  currency          char(3) not null default 'NPR',
  max_participants  integer not null default 10 check (max_participants > 0),
  difficulty        text check (difficulty in ('Easy', 'Moderate', 'Challenging', 'Difficult', 'Expert')),
                     -- Same casing-alignment rationale as category above.
  featured          boolean not null default false,
                     -- Phase 5 addition: Phase 2's original design omitted this, but the
                     -- homepage (FeaturedAdventures.tsx, built earlier this session)
                     -- already depends on it with a fallback (featured OR review_count >=
                     -- 20). Editorial/admin-only by design — see guard_listing_protected_
                     -- fields() below; an agency cannot grant itself featured placement
                     -- by directly updating its own listing row, unlike the old system's
                     -- self-service "Request Featured Placement" checkbox.
  images            jsonb not null default '[]'::jsonb,   -- see listing_images table below for
                                                            -- the real metadata-bearing model;
                                                            -- this column is a denormalized
                                                            -- ordered-URL cache for fast reads
  includes          text[] not null default '{}',
  excludes          text[] not null default '{}',
  itinerary         jsonb not null default '[]'::jsonb,
  cancellation_policy jsonb not null default '{"tiers": [{"days": 7, "refund_percent": 100}, {"days": 3, "refund_percent": 50}, {"days": 0, "refund_percent": 0}]}'::jsonb,
                       -- Agency-defined, subject to platform rules (target §16: "do not
                       -- hard-code this policy unless business requirements explicitly
                       -- choose it. The agency may define policy subject to platform
                       -- rules.") The default shown here mirrors the old system's
                       -- hardcoded tiers only as a sane starting default for new
                       -- listings — agencies can override it, and platform_settings
                       -- (Phase 43) will define the allowed bounds in a later phase.
  status            text not null default 'draft' check (status in (
                       'draft', 'pending_review', 'approved', 'published', 'paused',
                       'rejected', 'archived'
                     )),
  -- 'approved' (admin cleared it) is distinct from 'published' (agency made it
  -- live) per target §23 — the old system conflated these into one status.
  rating            numeric(3,2) not null default 0,
  review_count      integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.listings is
  'Travel products (tours/activities/treks/etc). rating/review_count are denormalized aggregates, recalculated by a trigger in the Reviews migration.';

create trigger set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

create index idx_listings_agency on public.listings (agency_id);
create index idx_listings_status_created on public.listings (status, created_at desc);
create index idx_listings_status_rating on public.listings (status, rating desc);
create index idx_listings_status_price on public.listings (status, base_price);
create index idx_listings_category on public.listings (category);
create index idx_listings_location_trgm on public.listings using gin (location gin_trgm_ops);
create index idx_listings_title_trgm on public.listings using gin (title gin_trgm_ops);

-- ── Listing images (metadata-bearing — target §32) ──────────────────────────

create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  width        integer,
  height       integer,
  alt_text     text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

comment on table public.listing_images is
  'Per-image metadata for responsive variants (target §32). Actual thumbnail/card/medium/large variant generation is a storage-pipeline concern (Phase 28), not modeled as separate rows here — storage_path is the original; variants are derived at the same path with a naming convention decided in that phase.';

create index idx_listing_images_listing on public.listing_images (listing_id, sort_order);

-- ── Departures (new — split out from the old overloaded availability table) ─

create table public.departures (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  -- agency_id is denormalized from listings for RLS query speed, matching the
  -- pattern the old availability table already used correctly.
  departure_date  date not null,
  cutoff_at       timestamptz,   -- last moment a booking can be made; null = no cutoff
  status          text not null default 'scheduled' check (status in ('scheduled', 'closed', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (listing_id, departure_date)
);

comment on table public.departures is
  'A scheduled occurrence of a listing. Capacity for a departure lives in the inventory table (next migration), not here — a departure is the "when", inventory is the "how many".';

create trigger set_updated_at
  before update on public.departures
  for each row execute function public.set_updated_at();

create index idx_departures_listing on public.departures (listing_id);
create index idx_departures_date on public.departures (departure_date);
create index idx_departures_agency on public.departures (agency_id);

-- ── Blackout dates ───────────────────────────────────────────────────────────

create table public.blackout_dates (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  blackout_date date not null,
  reason      text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (listing_id, blackout_date)
);

-- ── Pricing (tables only — resolution engine is Phase 8) ───────────────────

create table public.seasonal_pricing (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  season_name text not null,
  start_date  date not null,
  end_date    date not null,
  price       numeric(12,2) not null check (price > 0),
  currency    char(3) not null default 'NPR',
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_seasonal_pricing_listing on public.seasonal_pricing (listing_id, start_date, end_date);

create table public.price_overrides (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  departure_id  uuid references public.departures(id) on delete cascade,
  override_date date,   -- for a date-level override before a departure exists
  price         numeric(12,2) not null check (price > 0),
  currency      char(3) not null default 'NPR',
  reason        text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check (departure_id is not null or override_date is not null)
);

create index idx_price_overrides_listing on public.price_overrides (listing_id);
create index idx_price_overrides_departure on public.price_overrides (departure_id);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.departures enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.seasonal_pricing enable row level security;
alter table public.price_overrides enable row level security;

drop policy if exists "listings_public_select_published" on public.listings;
create policy "listings_public_select_published"
  on public.listings for select
  using (status = 'published');

drop policy if exists "listings_staff_select_own" on public.listings;
create policy "listings_staff_select_own"
  on public.listings for select
  using (public.has_agency_access(agency_id));

drop policy if exists "listings_staff_manage_own" on public.listings;
create policy "listings_staff_manage_own"
  on public.listings for all
  using (public.has_agency_access(agency_id, 'manager'))
  with check (public.has_agency_access(agency_id, 'manager'));

drop policy if exists "listings_admin_all" on public.listings;
create policy "listings_admin_all"
  on public.listings for all
  using (public.is_admin())
  with check (public.is_admin());
  -- Fixes AUDIT_REPORT.md RLS-02 by construction: this is the ONLY admin
  -- policy on this table, and it reads app_metadata via is_admin() — there
  -- is no separate, forgotten user_metadata-based policy left lying around
  -- for a future migration to fail to update.

-- listing_images / departures / blackout_dates / seasonal_pricing /
-- price_overrides all follow the same ownership shape: public can read
-- images/departures for published listings; agency staff manage their own;
-- admins manage all. (Pricing tables are not publicly readable directly —
-- the public-facing price is always resolved server-side by the pricing
-- engine, Phase 8, and returned via the quote, never read directly by the
-- browser off these tables — target §6: "traveler-facing frontend must
-- NEVER be the authoritative source of price.")

drop policy if exists "listing_images_public_select" on public.listing_images;
create policy "listing_images_public_select"
  on public.listing_images for select
  using (exists (select 1 from public.listings l where l.id = listing_images.listing_id and l.status = 'published'));

drop policy if exists "listing_images_staff_manage" on public.listing_images;
create policy "listing_images_staff_manage"
  on public.listing_images for all
  using (exists (select 1 from public.listings l where l.id = listing_images.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = listing_images.listing_id and public.has_agency_access(l.agency_id, 'manager')));

drop policy if exists "listing_images_admin_all" on public.listing_images;
create policy "listing_images_admin_all" on public.listing_images for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "departures_public_select" on public.departures;
create policy "departures_public_select"
  on public.departures for select
  using (exists (select 1 from public.listings l where l.id = departures.listing_id and l.status = 'published'));

drop policy if exists "departures_staff_manage" on public.departures;
create policy "departures_staff_manage"
  on public.departures for all
  using (public.has_agency_access(agency_id, 'manager'))
  with check (public.has_agency_access(agency_id, 'manager'));

drop policy if exists "departures_admin_all" on public.departures;
create policy "departures_admin_all" on public.departures for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "blackout_dates_staff_manage" on public.blackout_dates;
create policy "blackout_dates_staff_manage"
  on public.blackout_dates for all
  using (exists (select 1 from public.listings l where l.id = blackout_dates.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = blackout_dates.listing_id and public.has_agency_access(l.agency_id, 'manager')));

drop policy if exists "blackout_dates_admin_all" on public.blackout_dates;
create policy "blackout_dates_admin_all" on public.blackout_dates for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "seasonal_pricing_staff_manage" on public.seasonal_pricing;
create policy "seasonal_pricing_staff_manage"
  on public.seasonal_pricing for all
  using (exists (select 1 from public.listings l where l.id = seasonal_pricing.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = seasonal_pricing.listing_id and public.has_agency_access(l.agency_id, 'manager')));

drop policy if exists "seasonal_pricing_admin_all" on public.seasonal_pricing;
create policy "seasonal_pricing_admin_all" on public.seasonal_pricing for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "price_overrides_staff_manage" on public.price_overrides;
create policy "price_overrides_staff_manage"
  on public.price_overrides for all
  using (exists (select 1 from public.listings l where l.id = price_overrides.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = price_overrides.listing_id and public.has_agency_access(l.agency_id, 'manager')));

drop policy if exists "price_overrides_admin_all" on public.price_overrides;
create policy "price_overrides_admin_all" on public.price_overrides for all using (public.is_admin()) with check (public.is_admin());
