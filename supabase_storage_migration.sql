-- ============================================================
-- Agency Docs Storage Bucket
-- Run this in Supabase Dashboard → Storage → New Bucket
-- ============================================================
--
-- Create the bucket manually in the Supabase Dashboard:
--   Name:              agency-docs
--   Public:            false  (private — files require signed URLs)
--   File size limit:   5242880  (5 MB)
--   Allowed MIME types: image/jpeg, image/png, application/pdf
--
-- Then run the RLS policies below in SQL Editor.
-- ============================================================

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Agency owners can upload docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agency-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read/replace their own files
CREATE POLICY "Agency owners can update their docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'agency-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow admins (service role) to read all files for review
-- Signed URLs are generated server-side via the service role key,
-- so no additional SELECT policy is needed for the anon/authenticated role.
-- If you want admins to read via the client, add:
--
-- CREATE POLICY "Admins can read all docs"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'agency-docs');
