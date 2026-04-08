-- ============================================================
-- Reviews Table + RLS + Rating Recalculation Trigger
-- Run this in Supabase Dashboard → SQL Editor
-- Depends on: supabase_listings_migration.sql (listings)
--             supabase_bookings_migration.sql (bookings)
-- ============================================================


-- ============================================================
-- 1. TABLE: public.reviews
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  listing_id   UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  agency_id    UUID NOT NULL REFERENCES auth.users(id)      ON DELETE RESTRICT,
  traveler_id  UUID NOT NULL REFERENCES auth.users(id)      ON DELETE RESTRICT,
  booking_id   UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,

  -- One review per booking
  CONSTRAINT reviews_booking_id_key UNIQUE (booking_id),

  -- Review content
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title        TEXT    NOT NULL,
  comment      TEXT    NOT NULL,

  -- Denormalized traveler display name (snapshot at write time)
  traveler_name TEXT,

  -- Metadata
  verified      BOOLEAN  NOT NULL DEFAULT true,
  helpful_count INTEGER  NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reviews_listing_id  ON public.reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_reviews_traveler_id ON public.reviews(traveler_id);


-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- ── Public read ────────────────────────────────────────────

-- Anyone can read reviews for published listings
CREATE POLICY "public_select_reviews"
  ON public.reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = reviews.listing_id
        AND l.status = 'published'
    )
  );

-- ── Traveler INSERT ────────────────────────────────────────

-- Traveler can insert a review only if they have a completed
-- booking for that listing and haven't already reviewed it
CREATE POLICY "travelers_insert_review"
  ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = traveler_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id           = reviews.booking_id
        AND b.traveler_id  = auth.uid()
        AND b.listing_id   = reviews.listing_id
        AND b.status       = 'completed'
    )
  );

-- ── Traveler UPDATE (own review only) ─────────────────────

CREATE POLICY "travelers_update_own_review"
  ON public.reviews
  FOR UPDATE
  USING  (auth.uid() = traveler_id)
  WITH CHECK (auth.uid() = traveler_id);

-- ── Admin full access ──────────────────────────────────────

CREATE POLICY "admins_manage_all_reviews"
  ON public.reviews
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );


-- ============================================================
-- 5. FUNCTION + TRIGGER: recalculate listing rating
-- Runs after any INSERT / UPDATE / DELETE on reviews
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_listing_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_listing_id UUID;
BEGIN
  -- Resolve which listing was affected
  target_listing_id := COALESCE(NEW.listing_id, OLD.listing_id);

  UPDATE public.listings
  SET
    rating       = COALESCE(
                     (SELECT AVG(r.rating::numeric)
                      FROM public.reviews r
                      WHERE r.listing_id = target_listing_id),
                     0
                   ),
    review_count = (
                     SELECT COUNT(*)
                     FROM public.reviews r
                     WHERE r.listing_id = target_listing_id
                   )
  WHERE id = target_listing_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalculate_listing_rating ON public.reviews;
CREATE TRIGGER trg_recalculate_listing_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_listing_rating();
