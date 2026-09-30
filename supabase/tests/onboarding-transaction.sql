-- Tests for the onboarding race/partial-write fix
-- (supabase/migrations/20260917000013_onboarding_transaction.sql)
-- Run via: supabase test db supabase/tests/onboarding-transaction.sql
--
-- True concurrent-request races can't be exercised from a single pgTAP
-- transaction (everything here runs sequentially on one connection) — the
-- "5 concurrent save_draft calls" acceptance check is covered separately
-- by scripts/onboarding-race-probe.ts, which fires real concurrent HTTP
-- requests via Promise.all against the local stack. This file covers
-- everything else: atomic create, field validation, status guards,
-- document requirements.
begin;
create extension if not exists pgtap;

select plan(15);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-applicant@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: save_agency_draft — field length validation ──────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.save_agency_draft('{"companyName": "A"}'::jsonb) $$,
  'P0001', 'INVALID_COMPANY_NAME',
  'a 1-character company name (below the 2-char minimum) is rejected'
);

select throws_ok(
  format($$ select public.save_agency_draft(jsonb_build_object('companyName', 'Valid Co', 'description', repeat('x', 5001))) $$),
  'P0001', 'INVALID_DESCRIPTION',
  'a description over 5000 characters is rejected'
);

-- ── Group 2: save_agency_draft — atomic create ─────────────────────────────

select public.save_agency_draft('{"companyName": "Onboarding Test Agency", "city": "Kathmandu"}'::jsonb) as agency_id \gset

select ok(:'agency_id' is not null, 'save_agency_draft() returns a new agency id');

reset role;

select is(
  (select count(*)::int from public.agencies where id = :'agency_id'::uuid),
  1,
  'exactly one agencies row was created'
);
select is(
  (select count(*)::int from public.agency_users where agency_id = :'agency_id'::uuid and agency_role = 'owner' and accepted_at is not null),
  1,
  'exactly one accepted owner row was created'
);
select is(
  (select count(*)::int from public.agency_verification where agency_id = :'agency_id'::uuid and status = 'draft'),
  1,
  'exactly one draft verification row was created'
);

-- ── Group 3: save_agency_draft — calling again updates in place (idempotent
--    on the caller, not a second agency) ──────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select public.save_agency_draft('{"companyName": "Onboarding Test Agency Renamed", "city": "Pokhara"}'::jsonb) as agency_id_2 \gset

reset role;

select is(
  :'agency_id_2'::uuid,
  :'agency_id'::uuid,
  'calling save_agency_draft again returns the SAME agency id, not a new one'
);
select is(
  (select count(*)::int from public.agencies),
  1,
  'still exactly one agencies row total after the second call'
);
select is(
  (select city from public.agencies where id = :'agency_id'::uuid),
  'Pokhara',
  'the second call''s field values were actually applied'
);

-- ── Group 4: submit_agency_application — missing documents, then success,
--    then CANNOT_EDIT_IN_STATUS / CANNOT_SUBMIT_IN_STATUS once submitted ──

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.submit_agency_application() $$,
  'P0001', 'MISSING_REQUIRED_DOCUMENTS',
  'submit fails MISSING_REQUIRED_DOCUMENTS with no documents uploaded yet'
);

reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agency_documents (agency_id, document_type, storage_path, mime_type, size_bytes, status)
values
  (:'agency_id'::uuid, 'tourism_license', :'agency_id'::text || '/tourism_license-aaaaaaaa.pdf', 'application/pdf', 1000, 'pending'),
  (:'agency_id'::uuid, 'pan_certificate', :'agency_id'::text || '/pan_certificate-bbbbbbbb.pdf', 'application/pdf', 1000, 'pending');
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select lives_ok(
  $$ select public.submit_agency_application() $$,
  'submit succeeds once both required documents exist as pending'
);

select throws_ok(
  $$ select public.save_agency_draft('{"companyName": "Trying To Edit While Submitted"}'::jsonb) $$,
  'P0001', 'CANNOT_EDIT_IN_STATUS',
  'editing the agency while status is submitted is refused'
);

select throws_ok(
  $$ select public.submit_agency_application() $$,
  'P0001', 'CANNOT_SUBMIT_IN_STATUS',
  'submitting again while already submitted is refused'
);

reset role;

select is(
  (select status from public.agency_verification where agency_id = :'agency_id'::uuid),
  'submitted',
  'agency_verification.status is submitted'
);
select is(
  (select count(*)::int from public.domain_events where aggregate_id = :'agency_id'::uuid and event_type = 'AGENCY_APPLICATION_SUBMITTED'),
  1,
  'exactly one AGENCY_APPLICATION_SUBMITTED domain event was recorded'
);

select * from finish();
rollback;
