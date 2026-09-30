-- Platform-wide audit of every query against `listings` (public search,
-- agency dashboard/profile, admin agencies/listings/dashboard pages, and
-- every SQL function that touches the table) — a follow-up to migration
-- 20260917000020_indexes.sql, which added indexes from a fixed list
-- without checking each one against the query patterns actually run
-- against this table. Two of that migration's indexes turned out to be
-- weaker than they could be once checked against every real call site;
-- this migration supersedes them (not edited in place — dropped and
-- replaced here) rather than leaving dead weight next to a better index.
-- No other table had a comparable gap — every other query site found
-- (listed in full in the audit) is already covered by an existing index
-- or is a single-row PK lookup.
-- ============================================================================

-- ── 1. idx_listings_published_created → idx_listings_created_at ──────────
--
-- idx_listings_published_created (created_at desc) WHERE status='published'
-- turned out to be fully redundant: every query it could serve is already
-- served at least as well by the pre-existing idx_listings_status_created
-- (status, created_at desc) — confirmed by EXPLAIN, the planner never
-- chose the partial index over the composite one. Meanwhile
-- listingsStore.fetchAllListings() (src/pages/admin/Listings.tsx — the
-- admin's own "every listing, any status" management view) has NO status
-- filter at all and sorts by created_at across every status, which
-- NEITHER of the status-scoped indexes can serve. That was a real,
-- previously undiscovered gap — replacing the redundant partial index
-- with an unconditional one turns dead weight into a real fix instead of
-- just removing it.

drop index if exists public.idx_listings_published_created;

create index if not exists idx_listings_created_at
  on public.listings (created_at desc);

comment on index public.idx_listings_created_at is
  'Backs listingsStore.fetchAllListings() (admin "all listings" page, src/pages/admin/Listings.tsx) — the one listings query with no status filter at all. Supersedes idx_listings_published_created (migration 20260917000020), which was redundant with idx_listings_status_created for every status-scoped query.';

-- ── 2. idx_listings_agency_status → idx_listings_agency_status_created ───
--
-- idx_listings_agency_status (agency_id, status) covers the admin
-- per-agency published-count query (src/pages/admin/Agencies.tsx
-- loadAgencyDetail — .eq(agency_id).eq(status).head-count) but NOT
-- AgencyProfile.tsx's public "this agency's published listings, newest
-- first" page, which filters the exact same two columns AND sorts by
-- created_at — the 2-column index can narrow the scan but still needs a
-- separate Sort step for that. Extending to 3 columns lets both query
-- shapes run as a single index scan with no separate sort, while still
-- covering the plain agency_id-only dashboard query (listingsStore.
-- fetchMyListings, no status filter) on its leading column exactly as
-- well as the 2-column version did.

drop index if exists public.idx_listings_agency_status;

create index if not exists idx_listings_agency_status_created
  on public.listings (agency_id, status, created_at desc);

comment on index public.idx_listings_agency_status_created is
  'Serves three call sites off one index: AgencyProfile.tsx (agency_id + status='' published'' + ORDER BY created_at, all three columns), src/pages/admin/Agencies.tsx''s per-agency published-count (agency_id + status, leading two columns), and listingsStore.fetchMyListings (agency_id only, leading column). Supersedes idx_listings_agency_status (migration 20260917000020).';

-- ── 3. idx_listings_description_trgm — the public search bar
--    (usePublishedListings, src/lib/queries.ts) ILIKE-searches title,
--    description, AND location together (`.or(...)`) — title and
--    location already had trigram GIN indexes (migration
--    20260916000004_catalog.sql); description was the one left out. ─────

create index if not exists idx_listings_description_trgm
  on public.listings using gin (description gin_trgm_ops);

comment on index public.idx_listings_description_trgm is
  'Backs the description.ilike.%term% arm of usePublishedListings()''s search .or(...) clause (src/lib/queries.ts) — title/location already had this via idx_listings_title_trgm/idx_listings_location_trgm; description was missed.';

-- Every other listings query site found in the audit is already covered:
-- useListing()/useSubmitReview() (id = PK lookup), Wishlist.tsx (id IN (...)
-- against the PK), ActivityDetail.tsx's related-listings (status/category,
-- LIMIT 3, no ORDER BY — cheap regardless of which existing index is
-- picked), admin/Dashboard.tsx's published-count (status alone, served by
-- any of the status-leading indexes), and every SQL function that touches
-- listings (hold_inventory, start_conversation, sync_departure_agency,
-- set_departure_capacity — all single-row `id = ...` PK lookups).
