-- ============================================================
-- Listings & Availability Tables + RLS + Realtime
-- Run this in Supabase Dashboard → SQL Editor
-- Depends on: supabase_migration.sql (for update_updated_at_column function)
-- ============================================================


-- ============================================================
-- 1. TABLE: public.listings
-- Stores all agency travel packages / activities
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The agency that owns this listing
  agency_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core listing details
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL
    CHECK (category IN (
      'Trekking', 'Adventure', 'Cultural', 'Wildlife',
      'Rafting', 'Mountaineering', 'Wellness', 'Photography'
    )),
  location TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  duration TEXT NOT NULL,
  max_participants INTEGER DEFAULT 10,
  difficulty TEXT
    CHECK (difficulty IN ('Easy', 'Moderate', 'Challenging', 'Difficult', 'Expert')),

  -- Media & details arrays
  images TEXT[] DEFAULT '{}',
  includes TEXT[] DEFAULT '{}',
  excludes TEXT[] DEFAULT '{}',
  itinerary JSONB DEFAULT '[]',

  -- Listing lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'published', 'paused', 'rejected')),
  featured BOOLEAN DEFAULT false,

  -- Aggregated review data (denormalized for fast reads)
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 2. INDEXES for listings
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_listings_agency_id  ON public.listings(agency_id);
CREATE INDEX IF NOT EXISTS idx_listings_status     ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_category   ON public.listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_location   ON public.listings(location);


-- ============================================================
-- 3. AUTO-UPDATE updated_at TRIGGER for listings
-- Reuses the function created in supabase_migration.sql
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON public.listings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY on listings
-- ============================================================

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RLS POLICIES for listings
-- ============================================================

-- Agencies can read their own listings (any status)
CREATE POLICY "agencies_select_own_listings"
  ON public.listings
  FOR SELECT
  USING (auth.uid() = agency_id);

-- Agencies can create listings under their own id
CREATE POLICY "agencies_insert_own_listings"
  ON public.listings
  FOR INSERT
  WITH CHECK (auth.uid() = agency_id);

-- Agencies can update their own listings
CREATE POLICY "agencies_update_own_listings"
  ON public.listings
  FOR UPDATE
  USING (auth.uid() = agency_id);

-- Agencies can delete their own listings
CREATE POLICY "agencies_delete_own_listings"
  ON public.listings
  FOR DELETE
  USING (auth.uid() = agency_id);

-- Anyone (anon + authenticated) can view published listings
CREATE POLICY "public_select_published_listings"
  ON public.listings
  FOR SELECT
  USING (status = 'published');

-- Admins can read ALL listings regardless of status
CREATE POLICY "admins_select_all_listings"
  ON public.listings
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Admins can update ALL listings (e.g. feature, reject, approve)
CREATE POLICY "admins_update_all_listings"
  ON public.listings
  FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );


-- ============================================================
-- 6. TABLE: public.availability
-- Per-date availability slots for each listing
-- ============================================================

CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Availability details
  date DATE NOT NULL,
  spots_total INTEGER NOT NULL DEFAULT 10,
  spots_remaining INTEGER NOT NULL DEFAULT 10,
  price_override NUMERIC(10,2),     -- Optional per-date price override
  blocked BOOLEAN DEFAULT false,     -- Agency can block a date entirely

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Each listing can only have one entry per date
  UNIQUE(listing_id, date)
);


-- ============================================================
-- 7. INDEXES for availability
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_availability_listing_id ON public.availability(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_date       ON public.availability(date);


-- ============================================================
-- 8. ENABLE ROW LEVEL SECURITY on availability
-- ============================================================

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 9. RLS POLICIES for availability
-- ============================================================

-- Agencies can read their own availability
CREATE POLICY "agencies_select_own_availability"
  ON public.availability
  FOR SELECT
  USING (auth.uid() = agency_id);

-- Agencies can create availability for their own listings
CREATE POLICY "agencies_insert_own_availability"
  ON public.availability
  FOR INSERT
  WITH CHECK (auth.uid() = agency_id);

-- Agencies can update their own availability
CREATE POLICY "agencies_update_own_availability"
  ON public.availability
  FOR UPDATE
  USING (auth.uid() = agency_id);

-- Agencies can delete their own availability
CREATE POLICY "agencies_delete_own_availability"
  ON public.availability
  FOR DELETE
  USING (auth.uid() = agency_id);

-- Public can view availability for published listings only
CREATE POLICY "public_select_published_availability"
  ON public.availability
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = availability.listing_id
        AND listings.status = 'published'
    )
  );


-- ============================================================
-- 10. ENABLE REALTIME for both tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.availability;
