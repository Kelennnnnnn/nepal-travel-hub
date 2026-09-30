-- Tests for audit H1 fix (supabase/migrations/20260917000006_fresh_role_lookup.sql)
-- Run via: supabase test db supabase/tests/fresh-role-lookup.sql
--
-- C3's own behaviour (admin-users' privilege ceiling, last-super-admin
-- guard, session revocation) is edge-function/HTTP-level, not something a
-- SQL test can exercise meaningfully — those checks were run directly
-- against the local edge runtime instead (see the prompt report).
begin;
create extension if not exists pgtap;

select plan(8);

-- ── Fixtures: three real auth.users rows, since current_platform_role()
--    now reads auth.users directly rather than a JWT claim — a fixture
--    needs a real row for auth.uid() to resolve against, not just a JWT.

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values (
  'c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'h1-stale-jwt@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''
);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token, banned_until)
values (
  'c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'h1-banned-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '',
  now() + interval '1 year'
);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values (
  'c1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'h1-real-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''
);

insert into public.audit_logs (actor_id, action, resource_type, resource_id)
values ('c1000000-0000-0000-0000-000000000003', 'probe', 'probe', 'probe');

-- ── Test 1-3: stale JWT vs. live auth.users row ────────────────────────────
-- The JWT claims role=admin/aal2, but auth.users.raw_app_meta_data says
-- traveler (simulating a role that was just revoked, whose old token
-- hasn't expired yet). current_platform_role()/is_admin() must reflect the
-- LIVE row, not the stale claim — this is the entire point of H1.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text,
  true
);

select is(
  public.current_platform_role(), 'traveler',
  'current_platform_role() reflects the live auth.users row, not the stale JWT app_metadata claim'
);
select is(
  public.is_admin(), false,
  'is_admin() is false for a stale-JWT-says-admin / live-row-says-traveler user'
);
reset role;

-- ── Test 4-6: banned user with a still-valid (unexpired) JWT ───────────────
-- The JWT claims role=admin/aal2 and hasn't expired; auth.users says admin
-- too — the ONLY thing that changed is banned_until. current_platform_role()
-- must return NULL, and an is_admin()-gated policy must deny.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text,
  true
);

select is(
  public.current_platform_role(), null,
  'current_platform_role() is NULL for a banned user, even with a matching, unexpired JWT claim'
);
-- NULL, not false: is_admin() is `current_platform_role() in (...) and
-- is_authenticated_aal2()` — with current_platform_role() NULL, SQL's
-- three-valued logic makes the whole expression NULL, not false. RLS
-- treats a NULL USING-clause result as deny, same as false (test 6 proves
-- that concretely), so this is correct, not a gap.
select is(
  public.is_admin(), null,
  'is_admin() is NULL (not TRUE) for a banned user — three-valued logic, RLS still denies'
);
select is(
  (select count(*)::int from public.audit_logs),
  0,
  'audit_logs_admin_select (is_admin()-gated) denies a banned admin: sees zero rows'
);
reset role;

-- ── Test 7-9: a genuinely active admin still works (no regression) ────────

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text,
  true
);

select is(
  public.current_platform_role(), 'admin',
  'current_platform_role() returns admin for a genuinely active admin'
);
select is(
  public.is_admin(), true,
  'is_admin() is true for a genuinely active, aal2 admin'
);
select is(
  (select count(*)::int from public.audit_logs),
  1,
  'audit_logs_admin_select (rewritten, wrapped) still lets a real admin see rows — no regression from the (select ...) wrapping'
);
reset role;

select * from finish();
rollback;
