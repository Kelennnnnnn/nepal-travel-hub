-- Tests for supabase/migrations/20260917000024_cron_health.sql and
-- 20260917000025_ops_daily_health_alert.sql.
-- Run via: supabase test db supabase/tests/cron-health.sql
begin;
create extension if not exists pgtap;

select plan(11);

-- ── Group 1: grants ────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.cron_health()'::regprocedure, 'EXECUTE'),
  'anon: cron_health has no EXECUTE grant'
);
select ok(
  has_function_privilege('authenticated', 'public.cron_health()'::regprocedure, 'EXECUTE'),
  'authenticated: cron_health has an EXECUTE grant (internal check gates it)'
);
select ok(
  not has_function_privilege('anon', 'public.check_ops_daily_health()'::regprocedure, 'EXECUTE'),
  'anon: check_ops_daily_health has no EXECUTE grant'
);
select ok(
  not has_function_privilege('authenticated', 'public.check_ops_daily_health()'::regprocedure, 'EXECUTE'),
  'authenticated: check_ops_daily_health has no EXECUTE grant either (pg_cron-only, no client caller at all)'
);

-- ── Group 2: non-admin/non-support rejected, admin allowed ────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('f3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
       ('f3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select * from public.cron_health() $$,
  '42501', 'INSUFFICIENT_PRIVILEGE',
  'cron_health: a traveler is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ select * from public.cron_health() $$,
  'cron_health: an admin (aal2) can call it'
);

-- The 5 real scheduled jobs from earlier migrations should all show up.
select ok(
  (select count(*)::int from public.cron_health()) >= 5,
  'cron_health: returns at least the 5 jobs scheduled by earlier migrations'
);

-- A job with no run history yet reports is_healthy = false, not null —
-- pg_cron jobs in a just-reset local database have never actually fired.
select ok(
  (select count(*)::int from public.cron_health() where is_healthy is null) = 0,
  'cron_health: is_healthy is never null, even for a job with no run history'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ── Group 3: check_ops_daily_health() only fires when something is
--    actually wrong ──────────────────────────────────────────────────────

select is(
  (select count(*)::int from public.domain_events where event_type = 'OPS_DAILY_HEALTH'),
  0,
  'sanity: no OPS_DAILY_HEALTH event exists yet'
);

select public.check_ops_daily_health();

select is(
  (select count(*)::int from public.domain_events where event_type = 'OPS_DAILY_HEALTH'),
  0,
  'check_ops_daily_health(): a clean system (no failed jobs, no permanently-failed notifications) produces zero events'
);

-- Simulate a permanently-failed notification and re-run.
insert into public.domain_events (id, event_type, aggregate_type, aggregate_id, payload)
values ('f4000000-0000-0000-0000-000000000001', 'AGENCY_APPROVED', 'agency', gen_random_uuid(), '{}'::jsonb);
insert into public.notifications (domain_event_id, recipient_id, channel, status, attempts, idempotency_key)
values ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'email', 'failed', 5, 'cron-health-test-key');

select public.check_ops_daily_health();

select is(
  (select count(*)::int from public.domain_events where event_type = 'OPS_DAILY_HEALTH'),
  1,
  'check_ops_daily_health(): a permanently-failed notification (attempts>=5) triggers exactly one OPS_DAILY_HEALTH event'
);

select * from finish();
rollback;
