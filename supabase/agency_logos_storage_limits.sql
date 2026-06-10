-- Pen-test finding: the agency-logos bucket was created with no
-- file_size_limit / allowed_mime_types (unlike user-avatars), so any
-- authenticated agency can PUT an arbitrarily large file of any MIME type
-- (e.g. .html/.svg with embedded <script>) directly to the public bucket via
-- the Storage REST API, bypassing the upload form entirely — stored XSS
-- served from your own storage origin, plus unbounded storage cost.
--
-- Align with the already-correct user-avatars bucket configuration.

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'agency-logos';
