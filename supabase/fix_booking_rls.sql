-- PROMPT 0-2: Tighten RLS on bookings — travelers can ONLY cancel, not confirm/pay
-- Run this in Supabase SQL editor.

-- Drop the overly permissive traveler update policy (if it exists)
DROP POLICY IF EXISTS "travelers_update_own_bookings" ON public.bookings;

-- Travelers can only cancel their own pending/confirmed bookings
CREATE POLICY "travelers_cancel_own_bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    auth.uid() = traveler_id
    AND status IN ('pending_payment', 'confirmed')
  )
  WITH CHECK (
    auth.uid() = traveler_id
    AND status = 'cancelled'
  );

-- Agencies can update status of bookings for their listings
DROP POLICY IF EXISTS "agencies_update_own_bookings" ON public.bookings;
CREATE POLICY "agencies_update_own_bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    auth.uid() = agency_id
  )
  WITH CHECK (
    auth.uid() = agency_id
    AND status IN ('confirmed', 'completed', 'cancelled')
  );
