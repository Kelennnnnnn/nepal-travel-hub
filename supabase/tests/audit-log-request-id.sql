-- Tests for supabase/migrations/20260917000023_audit_log_request_id.sql —
-- p_request_id threads through to audit_logs.request_id for
-- admin_suspend_agency(), admin_reinstate_agency(), and delete_my_account().
-- Run via: supabase test db supabase/tests/audit-log-request-id.sql
begin;
create extension if not exists pgtap;

select plan(7);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f2-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('f2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f2-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('f2a00000-0000-0000-0000-000000000001', 'F2 Test Agency', 'F2 Test Agency', 'f2-test-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('f2a00000-0000-0000-0000-000000000001', 'approved', now(), now());

-- ── Group 1: admin_suspend_agency() / admin_reinstate_agency() ───────────

select public.admin_suspend_agency('f2a00000-0000-0000-0000-000000000001', 'test reason', 'req-suspend-abc');

select is(
  (select request_id from public.audit_logs where action = 'agency_suspend' and resource_id = 'f2a00000-0000-0000-0000-000000000001'),
  'req-suspend-abc',
  'admin_suspend_agency() writes its p_request_id into audit_logs.request_id'
);

select public.admin_reinstate_agency('f2a00000-0000-0000-0000-000000000001', 'req-reinstate-xyz');

select is(
  (select request_id from public.audit_logs where action = 'agency_reinstate' and resource_id = 'f2a00000-0000-0000-0000-000000000001'),
  'req-reinstate-xyz',
  'admin_reinstate_agency() writes its p_request_id into audit_logs.request_id'
);

-- Backward compatibility: calling with no p_request_id at all still works
-- (existing callers, and the fact that these are genuinely the only
-- versions of these functions now — see Group 3).
select lives_ok(
  $$ select public.admin_suspend_agency('f2a00000-0000-0000-0000-000000000001', 'again') $$,
  'admin_suspend_agency() can still be called without p_request_id (uses its default)'
);

select set_config('request.jwt.claims', '', true);

-- ── Group 2: delete_my_account() ──────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select public.delete_my_account('req-delete-123');

reset role;

select is(
  (select request_id from public.audit_logs where action = 'account_deleted' and resource_id = 'f2000000-0000-0000-0000-000000000002'),
  'req-delete-123',
  'delete_my_account() writes its p_request_id into audit_logs.request_id'
);

-- ── Group 3: exactly one signature exists for each — the old, fewer-arg
--    signature was dropped (not left ambiguously coexisting with the new
--    default-having one, which would break every existing zero/fewer-arg
--    call site — see this migration's own header comment for how that
--    was actually discovered). ────────────────────────────────────────

select is(
  (select count(*)::int from pg_proc where proname = 'admin_suspend_agency'),
  1,
  'exactly one admin_suspend_agency overload exists'
);
select is(
  (select count(*)::int from pg_proc where proname = 'admin_reinstate_agency'),
  1,
  'exactly one admin_reinstate_agency overload exists'
);
select is(
  (select count(*)::int from pg_proc where proname = 'delete_my_account'),
  1,
  'exactly one delete_my_account overload exists'
);

select * from finish();
rollback;
