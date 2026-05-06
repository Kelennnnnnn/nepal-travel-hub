-- ── Reviews table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  agency_id       UUID,
  traveler_id     UUID NOT NULL,
  traveler_name   TEXT,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  helpful_count   INTEGER NOT NULL DEFAULT 0,
  verified        BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
DROP POLICY IF EXISTS "reviews_public_read" ON reviews;
CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (true);

-- Authenticated travelers can insert their own review
DROP POLICY IF EXISTS "reviews_traveler_insert" ON reviews;
CREATE POLICY "reviews_traveler_insert" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = traveler_id);

-- ── RPC: increment helpful_count ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_review_helpful(review_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE reviews
  SET helpful_count = COALESCE(helpful_count, 0) + 1
  WHERE id = review_id;
$$;

CREATE OR REPLACE FUNCTION increment_helpful(review_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE reviews
  SET helpful_count = COALESCE(helpful_count, 0) + 1
  WHERE id = review_id;
$$;

-- Allow anyone (anon + authenticated) to call this
GRANT EXECUTE ON FUNCTION increment_review_helpful(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_helpful(UUID) TO anon, authenticated;
