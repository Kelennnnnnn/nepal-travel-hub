-- PROMPT 2-1: Add logo_url column to agency_applications
-- Run in Supabase SQL Editor.

ALTER TABLE public.agency_applications
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';

-- Storage bucket: agency-logos (public reads, authenticated writes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('agency-logos', 'agency-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Agencies can upload/replace their own logo
DROP POLICY IF EXISTS "agency_upload_own_logo" ON storage.objects;
CREATE POLICY "agency_upload_own_logo"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'agency-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "agency_update_own_logo" ON storage.objects;
CREATE POLICY "agency_update_own_logo"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'agency-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone can read logos (bucket is public, but explicit policy for clarity)
DROP POLICY IF EXISTS "public_read_agency_logos" ON storage.objects;
CREATE POLICY "public_read_agency_logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agency-logos');
