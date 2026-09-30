-- Fixes audit H4
--
-- agency_documents_insert_own only checked has_agency_access(agency_id,
-- 'manager') — nothing constrained status/reviewed_by/reviewed_at/
-- rejection_reason, so a manager could INSERT a row already marked
-- status='approved', reviewed_by=<any admin's uuid>, self-certifying their
-- own KYC document. The storage policy agency_documents_bucket_staff was
-- FOR ALL (insert+select+update+delete), and the client already uploads
-- with upsert:true — so even after a document WAS legitimately reviewed
-- and approved (on the table row), the agency could silently overwrite or
-- delete the underlying file at the same storage path, with the table row
-- none the wiser. agency_verification_insert_own accepted status
-- 'submitted' directly (bypassing the actual submit flow's validation in
-- the agency-application edge function) and never constrained reviewed_by,
-- which record_agency_status_change's trigger records as "who actioned
-- it" — a client could attribute a status change to an admin who never
-- touched it. agencyStore.ts's uploadDocument() tried to `delete()` the
-- prior row of the same document_type before inserting a new one, but no
-- delete policy has ever existed for agency_documents — the delete
-- silently affected 0 rows (Postgres doesn't error on a policy-filtered-to-
-- zero-rows DELETE), so old rows piled up forever, orphaned.
-- ============================================================================

-- ── 1. guard_agency_document_insert: closes the "insert already-approved,
--    already-attributed" hole. Applies to every insert (including via
--    replace_agency_document below, which is a plain non-admin caller as
--    far as this trigger is concerned — the RPC's OWN manager+ check is a
--    separate, prior authorization gate; this trigger is the data-
--    integrity backstop regardless of which path reached the table). ─────

create or replace function public.guard_agency_document_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
begin
  if not (v_is_service_role or public.is_admin()) then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;

    if (storage.foldername(new.storage_path))[1] is distinct from new.agency_id::text then
      raise exception 'INVALID_STORAGE_PATH' using errcode = 'P0001';
    end if;
  end if;

  -- Mirrors the agency-documents bucket's own file_size_limit/
  -- allowed_mime_types (migration 20260916000016) as a second, DB-level
  -- enforcement point — the bucket only constrains what Storage itself
  -- accepts, not what a client can claim in the agency_documents ROW
  -- (mime_type/size_bytes here are just text/bigint columns the client
  -- sets directly, disconnected from whatever Storage actually stored).
  if new.mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'INVALID_MIME_TYPE' using errcode = 'P0001';
  end if;
  if new.size_bytes > 10485760 then
    raise exception 'FILE_TOO_LARGE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_agency_document_insert() is
  'Audit H4. Non-admin/non-service_role inserts are always status=pending with no reviewer attribution, regardless of client-supplied values, and must upload to their own agency''s storage folder. mime_type/size_bytes are checked for every insert, admin included — these mirror the storage bucket''s own limits at the table-row level.';

drop trigger if exists guard_agency_document_insert on public.agency_documents;
create trigger guard_agency_document_insert
  before insert on public.agency_documents
  for each row execute function public.guard_agency_document_insert();

-- ── 2. superseded_at + replace_agency_document(): the only client path to
--    creating an agency_documents row. Old rows are marked superseded, not
--    deleted or overwritten in place — this is what actually fixes
--    agencyStore.ts's silent-no-op delete, by removing the need for a
--    delete at all. ───────────────────────────────────────────────────────

alter table public.agency_documents
  add column superseded_at timestamptz;

comment on column public.agency_documents.superseded_at is
  'Set by replace_agency_document() when a newer document of the same type is uploaded. The document row and its underlying storage object are both kept (never deleted) — this is the audit trail of what was actually submitted and reviewed, not just what''s current.';

create or replace function public.replace_agency_document(
  p_agency_id uuid,
  p_document_type text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verification_status text;
  v_current_doc public.agency_documents;
  v_new_id uuid;
begin
  if not public.has_agency_access(p_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = 'P0001';
  end if;

  select status into v_verification_status
  from public.agency_verification where agency_id = p_agency_id;
  if v_verification_status is null then
    raise exception 'AGENCY_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_current_doc
  from public.agency_documents
  where agency_id = p_agency_id and document_type = p_document_type and superseded_at is null
  order by created_at desc
  limit 1;

  if v_current_doc.id is not null then
    -- Replacing an existing document is only allowed while the agency's
    -- whole application is still editable (draft/more_info_required/
    -- rejected), OR the specific document itself was rejected/expired —
    -- an approved document on an approved (or mid-review) agency cannot be
    -- silently swapped out from under a reviewer.
    if v_verification_status not in ('draft', 'more_info_required', 'rejected')
       and v_current_doc.status not in ('rejected', 'expired')
    then
      raise exception 'DOCUMENT_NOT_REPLACEABLE' using errcode = 'P0001';
    end if;

    update public.agency_documents set superseded_at = now() where id = v_current_doc.id;
  end if;

  insert into public.agency_documents (agency_id, document_type, storage_path, mime_type, size_bytes)
  values (p_agency_id, p_document_type, p_storage_path, p_mime_type, p_size_bytes)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.replace_agency_document(uuid, text, text, text, bigint) is
  'Audit H4. The only client-reachable way to create an agency_documents row — manager+ of the agency, and only while the document/application is actually still editable. The inserted row still goes through guard_agency_document_insert (status forced to pending, storage path checked, mime/size validated) — this function''s own checks are about WHEN a replacement is allowed, not a substitute for that trigger.';

revoke execute on function public.replace_agency_document(uuid, text, text, text, bigint) from public, anon;
grant  execute on function public.replace_agency_document(uuid, text, text, text, bigint) to authenticated;

drop policy if exists "agency_documents_insert_own" on public.agency_documents;

-- ── 3. Storage policies for bucket 'agency-documents': split the old FOR
--    ALL grant into insert-only (manager+) and select (any active member),
--    with no update/delete path for any non-admin/non-service role at all —
--    an uploaded document, once it exists, can never be overwritten in
--    place or removed by the agency; only superseded via a NEW upload
--    through replace_agency_document. ──────────────────────────────────────

drop policy if exists "agency_documents_bucket_staff" on storage.objects;

create policy "agency_documents_bucket_staff_insert"
  on storage.objects for insert
  with check (bucket_id = 'agency-documents' and public.has_agency_access((storage.foldername(name))[1]::uuid, 'manager'));

create policy "agency_documents_bucket_staff_select"
  on storage.objects for select
  using (bucket_id = 'agency-documents' and public.has_agency_access((storage.foldername(name))[1]::uuid));

-- agency_documents_bucket_admin (select, migration 20260916000016) is
-- untouched — admins could always read; that policy already covers it.

-- ── 4. agency_verification_insert_own: the agency-application edge
--    function (service_role) is the only creator of this table's rows —
--    no client path should exist at all. ────────────────────────────────

drop policy if exists "agency_verification_insert_own" on public.agency_verification;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    the C2/H2/H3 migrations' own copies of this same extension). ────────

create or replace function public.audit_definer_exposure()
returns table(function_name text, arguments text, executable_by text[])
language sql
stable
as $$
  select
    p.proname::text,
    pg_get_function_identity_arguments(p.oid),
    array_remove(array[
      case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
      case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end
    ], null)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef                                   -- SECURITY DEFINER only
    and p.prorettype <> 'trigger'::regtype              -- trigger functions are never PostgREST RPC-callable, regardless of grants — excluded so this guard stays focused on audit C1's actual exposure surface (anon/authenticated hitting /rest/v1/rpc/<fn>), not flagged as noise requiring its own allowlist entries
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      -- audit C2 additions
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      -- audit H2 additions
      'request_booking_cancellation', 'agency_set_trip_status',
      -- audit H3 additions
      'respond_to_review', 'is_own_review',
      -- audit H4 addition: authenticated-only, manager+-gated internally,
      -- re-derives agency_verification/document status from live tables
      'replace_agency_document'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
