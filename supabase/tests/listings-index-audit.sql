-- Tests for supabase/migrations/20260917000022_listings_index_audit.sql —
-- the platform-wide audit of every query against `listings`, which
-- superseded two indexes from 20260917000020_indexes.sql and added one
-- new one (description search).
-- Run via: supabase test db supabase/tests/listings-index-audit.sql
begin;
create extension if not exists pgtap;

select plan(8);

-- ── The two superseded indexes are actually gone, not just duplicated ────

select ok(
  not exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_published_created'),
  'idx_listings_published_created no longer exists (superseded)'
);
select ok(
  not exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_agency_status'),
  'idx_listings_agency_status no longer exists (superseded)'
);

-- ── Their replacements exist, with the expected columns ──────────────────

select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_created_at'),
  'idx_listings_created_at exists'
);
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_created_at'),
  'CREATE INDEX idx_listings_created_at ON public.listings USING btree (created_at DESC)',
  'idx_listings_created_at is unconditional (no WHERE status=...) — covers listingsStore.fetchAllListings(), which has no status filter at all'
);

select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_agency_status_created'),
  'idx_listings_agency_status_created exists'
);
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_agency_status_created'),
  'CREATE INDEX idx_listings_agency_status_created ON public.listings USING btree (agency_id, status, created_at DESC)',
  'idx_listings_agency_status_created carries all three columns AgencyProfile.tsx''s query needs (agency_id, status, ORDER BY created_at)'
);

-- ── The new description search index ──────────────────────────────────────

select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_description_trgm'),
  'idx_listings_description_trgm exists'
);
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_description_trgm'),
  'CREATE INDEX idx_listings_description_trgm ON public.listings USING gin (description gin_trgm_ops)',
  'idx_listings_description_trgm is a trigram GIN index, matching idx_listings_title_trgm/idx_listings_location_trgm'
);

select * from finish();
rollback;
