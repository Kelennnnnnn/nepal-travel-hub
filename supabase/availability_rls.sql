-- Run in Supabase Dashboard → SQL Editor

-- Enable RLS on availability table (idempotent)
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read availability for published listings
DROP POLICY IF EXISTS public_select_published_availability ON public.availability;
CREATE POLICY public_select_published_availability
  ON public.availability
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = availability.listing_id
        AND listings.status = 'published'
    )
  );

-- Allow agencies to manage their own listing's availability
DROP POLICY IF EXISTS agency_manage_own_availability ON public.availability;
CREATE POLICY agency_manage_own_availability
  ON public.availability
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = availability.listing_id
        AND listings.agency_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = availability.listing_id
        AND listings.agency_id = auth.uid()
    )
  );
