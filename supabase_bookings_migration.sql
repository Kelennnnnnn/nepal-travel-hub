-- ============================================================
-- Bookings Table + RLS + Availability Triggers + Realtime
-- Run this in Supabase Dashboard → SQL Editor
-- Depends on: supabase_migration.sql (update_updated_at_column)
--             supabase_listings_migration.sql (listings, availability)
-- ============================================================


-- ============================================================
-- 1. TABLE: public.bookings
-- Stores all traveler bookings against agency listings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable booking reference (e.g. BK-A1B2C3D4)
  booking_ref TEXT UNIQUE NOT NULL
    DEFAULT 'BK-' || upper(substring(gen_random_uuid()::text, 1, 8)),

  -- References
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  agency_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  traveler_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  availability_id UUID REFERENCES public.availability(id) ON DELETE SET NULL,

  -- Trip details
  trip_date DATE NOT NULL,
  guests INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),

  -- Pricing
  price_per_person NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,

  -- Commission (platform takes 12-15%)
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  commission_amount NUMERIC(10,2) GENERATED ALWAYS AS (
    total_amount * commission_rate / 100
  ) STORED,
  net_payout NUMERIC(10,2) GENERATED ALWAYS AS (
    total_amount - (total_amount * commission_rate / 100)
  ) STORED,

  -- Booking lifecycle
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'confirmed', 'completed', 'cancelled')),

  -- Payment tracking
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  payment_intent_id TEXT,

  -- Traveler contact info (snapshot at booking time)
  traveler_name TEXT,
  traveler_email TEXT,
  traveler_phone TEXT,

  -- Additional info
  special_requests TEXT DEFAULT '',
  cancellation_reason TEXT DEFAULT '',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 2. INDEXES for bookings
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_listing_id   ON public.bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_agency_id    ON public.bookings(agency_id);
CREATE INDEX IF NOT EXISTS idx_bookings_traveler_id  ON public.bookings(traveler_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status       ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_date    ON public.bookings(trip_date);


-- ============================================================
-- 3. AUTO-UPDATE updated_at TRIGGER
-- Reuses the function from supabase_migration.sql
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON public.bookings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RLS POLICIES for bookings
-- ============================================================

-- ── Traveler policies ──────────────────────────────────────

-- Travelers can view their own bookings
CREATE POLICY "travelers_select_own_bookings"
  ON public.bookings
  FOR SELECT
  USING (auth.uid() = traveler_id);

-- Travelers can create bookings (must set themselves as traveler_id)
CREATE POLICY "travelers_insert_own_bookings"
  ON public.bookings
  FOR INSERT
  WITH CHECK (auth.uid() = traveler_id);

-- Travelers can update their own bookings (e.g. cancel)
-- Cannot modify completed bookings
CREATE POLICY "travelers_update_own_bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    auth.uid() = traveler_id
    AND status != 'completed'
  );

-- ── Agency policies ────────────────────────────────────────

-- Agencies can view bookings for their listings
CREATE POLICY "agencies_select_own_bookings"
  ON public.bookings
  FOR SELECT
  USING (auth.uid() = agency_id);

-- Agencies can update booking status (confirm / complete)
CREATE POLICY "agencies_update_own_bookings"
  ON public.bookings
  FOR UPDATE
  USING (auth.uid() = agency_id);

-- ── Admin policies ─────────────────────────────────────────

-- Admins can view all bookings
CREATE POLICY "admins_select_all_bookings"
  ON public.bookings
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Admins can update all bookings
CREATE POLICY "admins_update_all_bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );


-- ============================================================
-- 6. FUNCTION + TRIGGERS: Manage availability spots
-- Automatically decrement/increment spots_remaining when
-- bookings are created or cancelled
-- ============================================================

-- Function: decrement spots when a booking is inserted
CREATE OR REPLACE FUNCTION public.on_booking_insert_decrement_spots()
RETURNS TRIGGER AS $$
BEGIN
  -- Only decrement if the booking is not cancelled and has an availability_id
  IF NEW.status != 'cancelled' AND NEW.availability_id IS NOT NULL THEN
    UPDATE public.availability
    SET spots_remaining = GREATEST(spots_remaining - NEW.guests, 0)
    WHERE id = NEW.availability_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: restore spots when a booking is cancelled
CREATE OR REPLACE FUNCTION public.on_booking_cancel_restore_spots()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changes TO 'cancelled' and there is an availability_id
  IF OLD.status != 'cancelled'
    AND NEW.status = 'cancelled'
    AND NEW.availability_id IS NOT NULL
  THEN
    UPDATE public.availability
    SET spots_remaining = LEAST(spots_remaining + OLD.guests, spots_total)
    WHERE id = NEW.availability_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: after inserting a booking, decrement availability
DROP TRIGGER IF EXISTS trg_booking_insert_decrement ON public.bookings;
CREATE TRIGGER trg_booking_insert_decrement
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.on_booking_insert_decrement_spots();

-- Trigger: after updating a booking to cancelled, restore availability
DROP TRIGGER IF EXISTS trg_booking_cancel_restore ON public.bookings;
CREATE TRIGGER trg_booking_cancel_restore
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.on_booking_cancel_restore_spots();


-- ============================================================
-- 7. ENABLE REALTIME for bookings
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
