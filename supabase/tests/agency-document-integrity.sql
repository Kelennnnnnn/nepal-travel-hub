-- Tests for audit H4 fix (supabase/migrations/20260917000010_agency_document_integrity.sql)
-- Run via: supabase test db supabase/tests/agency-document-integrity.sql
begin;
create extension if not exists pgtap;

select plan(10);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('a4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4-manager@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a4a00000-0000-0000-0000-000000000001', 'H4 Test Agency', 'H4 Test Agency', 'h4-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.agency_verification (agency_id, status)
values ('a4a00000-0000-0000-0000-000000000001', 'draft');

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('a4a00000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'manager', now());

select set_config('request.jwt.claims', '', true);

-- ── Group 1: direct INSERT is denied outright — agency_documents_insert_own
--    is gone, and no other policy grants a manager INSERT at all. Even
--    innocuous, correctly-shaped values are refused; this isn't about what
--    values are supplied, there is simply no path in anymore. ────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.agency_documents (agency_id, document_type, storage_path, mime_type, size_bytes)
     values ('a4a00000-0000-0000-0000-000000000001', 'tourism_license', 'a4a00000-0000-0000-0000-000000000001/tourism_license-aaaaaaaa.pdf', 'application/pdf', 1000) $$,
  '42501', null,
  'manager: direct INSERT into agency_documents is RLS-denied — agency_documents_insert_own is gone'
);

reset role;

-- ── Group 2: replace_agency_document() — the only client path. The inserted
--    row goes through guard_agency_document_insert regardless: status/
--    reviewed_by are forced, storage_path/mime_type/size_bytes are
--    validated — proven here since the RPC itself never exposes those
--    columns to the caller in the first place. ─────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select public.replace_agency_document(
  'a4a00000-0000-0000-0000-000000000001'::uuid, 'pan_certificate',
  'a4a00000-0000-0000-0000-000000000001/pan_certificate-bbbbbbbb.pdf',
  'application/pdf', 2000
) as pan_doc_id \gset

select ok(:'pan_doc_id' is not null, 'replace_agency_document(): returns a new document id');
select is(
  (select status from public.agency_documents where id = :'pan_doc_id'::uuid),
  'pending',
  'replace_agency_document(): inserted row is status=pending (via the same guard trigger)'
);
select is(
  (select reviewed_by from public.agency_documents where id = :'pan_doc_id'::uuid),
  null,
  'replace_agency_document(): inserted row has no reviewer attribution'
);

select throws_ok(
  $$ select public.replace_agency_document(
       'a4a00000-0000-0000-0000-000000000001'::uuid, 'insurance',
       'a4a00000-0000-0000-0000-000000000001/insurance.exe',
       'application/x-msdownload', 1000
     ) $$,
  'P0001', 'INVALID_MIME_TYPE',
  'replace_agency_document(): a disallowed mime_type is rejected'
);

select throws_ok(
  $$ select public.replace_agency_document(
       'a4a00000-0000-0000-0000-000000000001'::uuid, 'insurance',
       'a4a00000-0000-0000-0000-000000000001/insurance.pdf',
       'application/pdf', 20000000
     ) $$,
  'P0001', 'FILE_TOO_LARGE',
  'replace_agency_document(): size_bytes over the 10MB bucket limit is rejected'
);

reset role;

-- ── Group 3: replacing supersedes, never deletes ───────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select public.replace_agency_document(
  'a4a00000-0000-0000-0000-000000000001'::uuid, 'pan_certificate',
  'a4a00000-0000-0000-0000-000000000001/pan_certificate-cccccccc.pdf',
  'application/pdf', 2000
) as pan_doc_id_2 \gset

reset role;

select is(
  (select superseded_at is not null from public.agency_documents where id = :'pan_doc_id'::uuid),
  true,
  'the previous pan_certificate row is superseded, not deleted'
);
select is(
  (select count(*)::int from public.agency_documents where agency_id = 'a4a00000-0000-0000-0000-000000000001' and document_type = 'pan_certificate'),
  2,
  'both pan_certificate rows still exist (old superseded + new current)'
);

-- ── Group 4: replacing is refused once the agency/document is no longer
--    editable ──────────────────────────────────────────────────────────────

-- guard_agency_verification_transition (migration 20260917000001) only
-- allows draft -> submitted -> approved, not a direct draft -> approved
-- jump — even for this admin-context fixture write.
update public.agency_verification set status = 'submitted' where agency_id = 'a4a00000-0000-0000-0000-000000000001';
update public.agency_verification set status = 'approved' where agency_id = 'a4a00000-0000-0000-0000-000000000001';
update public.agency_documents set status = 'approved' where id = :'pan_doc_id_2'::uuid;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.replace_agency_document(
       'a4a00000-0000-0000-0000-000000000001'::uuid, 'pan_certificate',
       'a4a00000-0000-0000-0000-000000000001/pan_certificate-dddddddd.pdf',
       'application/pdf', 2000
     ) $$,
  'P0001', 'DOCUMENT_NOT_REPLACEABLE',
  'replacing an approved document on an approved agency is refused'
);

reset role;

-- ── Group 5: agency_verification — no client INSERT path at all ───────────
-- A second agency with NO verification row yet, so the insert attempt below
-- is blocked by RLS specifically, not a unique-constraint collision on the
-- fixture agency's existing row.

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a4a00000-0000-0000-0000-000000000002', 'H4 Second Agency', 'H4 Second Agency', 'h4-second-agency', 'Pokhara', 'Kaski');
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('a4a00000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'owner', now());
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.agency_verification (agency_id, status) values ('a4a00000-0000-0000-0000-000000000002', 'draft') $$,
  '42501', null,
  'agency owner: direct INSERT into agency_verification is RLS-denied — agency_verification_insert_own is gone'
);

reset role;

select * from finish();
rollback;
