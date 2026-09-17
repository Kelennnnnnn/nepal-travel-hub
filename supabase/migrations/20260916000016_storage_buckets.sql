-- ============================================================================
-- Into Nepal — migration 16 of N: Storage buckets
--
-- target §31/§32. Every bucket this system needs is defined here, in one
-- tracked migration — fixing AUDIT_REPORT.md OPS-03, which found the old
-- system's most sensitive bucket (agency-docs, holding KYC/business
-- documents) was never captured in any migration at all, making its actual
-- live policy unverifiable and unreproducible. All five buckets below follow
-- the same folder-scoping pattern the old system got right for avatars/
-- logos (storage.foldername(name))[1] = auth.uid()::text), generalized to
-- agency-owned buckets via has_agency_access(). MIME/size limits are set at
-- the bucket level (file_size_limit/allowed_mime_types), which Supabase
-- Storage enforces server-side — never trusting file.type from the browser
-- alone (target §31).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('agency-documents', 'agency-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('listing-images', 'listing-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('message-attachments', 'message-attachments', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- avatars/message-attachments/agency-documents are private (public=false —
-- read requires a signed URL or an authorized session, never a guessable
-- public path, per target §25's "Do not allow arbitrary file access through
-- predictable storage URLs"). listing-images/review-photos are public (they
-- are marketing-facing content by design).
-- (Note: COMMENT ON TABLE storage.buckets itself is not used here — that
-- table is owned by the supabase_storage_admin role, not the migration
-- runner, and attempting it fails with "must be owner of table buckets".
-- Caught by actually running this migration against the local instance.)

-- ── avatars: user-owned, path = <user_id>/... ───────────────────────────────

drop policy if exists "avatars_owner_all" on storage.objects;
create policy "avatars_owner_all"
  on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_admin_select" on storage.objects;
create policy "avatars_admin_select"
  on storage.objects for select
  using (bucket_id = 'avatars' and public.is_admin());

-- ── agency-documents: agency-owned, path = <agency_id>/... ──────────────────
-- Fixes AUDIT_REPORT.md OPS-03: now tracked, explicit, reviewable policy —
-- staff of the owning agency can upload/read their own docs; only admins can
-- mark them approved/rejected (that happens on the agency_documents TABLE
-- row, not via a storage policy — storage access here is purely "can this
-- person see/upload the file," not "is this document approved").

drop policy if exists "agency_documents_bucket_staff" on storage.objects;
create policy "agency_documents_bucket_staff"
  on storage.objects for all
  using (bucket_id = 'agency-documents' and public.has_agency_access((storage.foldername(name))[1]::uuid, 'manager'))
  with check (bucket_id = 'agency-documents' and public.has_agency_access((storage.foldername(name))[1]::uuid, 'manager'));

drop policy if exists "agency_documents_bucket_admin" on storage.objects;
create policy "agency_documents_bucket_admin"
  on storage.objects for select
  using (bucket_id = 'agency-documents' and public.is_admin());

-- ── listing-images: agency-owned, path = <agency_id>/<listing_id>/... ───────
-- Fixes AUDIT_REPORT.md FE-05: the old system's listing-images bucket had NO
-- per-agency path namespacing at all (a flat listings/<uuid>.ext root shared
-- by every agency), meaning Storage RLS couldn't scope write access by
-- owner using the standard folder pattern. Here the path is namespaced by
-- agency_id from the start.

drop policy if exists "listing_images_bucket_public_select" on storage.objects;
create policy "listing_images_bucket_public_select"
  on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "listing_images_bucket_staff_write" on storage.objects;
create policy "listing_images_bucket_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'listing-images' and public.has_agency_access((storage.foldername(name))[1]::uuid, 'manager'));

drop policy if exists "listing_images_bucket_staff_delete" on storage.objects;
create policy "listing_images_bucket_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'listing-images' and public.has_agency_access((storage.foldername(name))[1]::uuid, 'manager'));

-- ── review-photos: traveler-owned, path = <traveler_id>/<review_id>/... ─────

drop policy if exists "review_photos_bucket_public_select" on storage.objects;
create policy "review_photos_bucket_public_select"
  on storage.objects for select
  using (bucket_id = 'review-photos');

drop policy if exists "review_photos_bucket_owner_write" on storage.objects;
create policy "review_photos_bucket_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── message-attachments: participant-owned, path = <conversation_id>/... ───
-- Access requires being a participant in the conversation the path's first
-- segment names — not just "any authenticated user," and not a public/
-- predictable path (target §25).

drop policy if exists "message_attachments_bucket_participant" on storage.objects;
create policy "message_attachments_bucket_participant"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = (storage.foldername(name))[1]::uuid and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_attachments_bucket_participant_write" on storage.objects;
create policy "message_attachments_bucket_participant_write"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = (storage.foldername(name))[1]::uuid and cp.user_id = auth.uid()
    )
  );

-- NOTE on malware scanning (target §25: "malware scanning strategy"):
-- Supabase Storage does not provide built-in malware scanning. This
-- migration establishes correct MIME/size/authorization controls, which is
-- the database-layer responsibility; actual virus/malware scanning requires
-- either a third-party scanning API called from an upload-triggered edge
-- function, or a storage webhook pipeline — this is an application-layer
-- integration decision for Phase 25 (Messaging) / Phase 28 (Storage
-- architecture), explicitly flagged here rather than silently assumed to be
-- handled.
