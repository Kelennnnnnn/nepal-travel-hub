-- Tests for supabase/migrations/20260917000021_admin_user_directory.sql:
-- profiles.email sync, admin_user_directory(), and admin_user_stats() —
-- the replacement for admin-users/index.ts "list" action's old
-- listUsers({perPage:1000}) + in-memory filter/aggregate.
-- Run via: supabase test db supabase/tests/admin-user-directory.sql
begin;
create extension if not exists pgtap;

select plan(29);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice.traveler@test.com', '{"role": "traveler"}'::jsonb, '{"full_name": "Alice Traveler"}'::jsonb, false, now() - interval '5 days', now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob.agency@test.com', '{"role": "agency"}'::jsonb, '{"full_name": "Bob Agency"}'::jsonb, false, now() - interval '4 days', now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol.admin@test.com', '{"role": "admin"}'::jsonb, '{"full_name": "Carol Admin"}'::jsonb, false, now() - interval '3 days', now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave.support@test.com', '{"role": "support"}'::jsonb, '{"full_name": "Dave Support"}'::jsonb, false, now() - interval '2 days', now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erin.finance@test.com', '{"role": "finance"}'::jsonb, '{"full_name": "Erin Finance"}'::jsonb, false, now() - interval '1 day', now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank.suspended@test.com', '{"role": "traveler"}'::jsonb, '{"full_name": "Frank Suspended"}'::jsonb, false, now(), now(), '', '', '', ''),
  ('f1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grace.noprofile@test.com', '{"role": "traveler"}'::jsonb, '{"full_name": "Grace NoProfile"}'::jsonb, false, now(), now(), '', '', '', '');

update auth.users set banned_until = now() + interval '1000 days' where id = 'f1000000-0000-0000-0000-000000000006';

-- Simulates an account that predates the handle_new_user() trigger ever
-- existing — admin_user_directory() must still surface it (LEFT JOIN).
delete from public.profiles where id = 'f1000000-0000-0000-0000-000000000007';

-- ── Group 1: profiles.email is kept in sync ────────────────────────────────

select is(
  (select email from public.profiles where id = 'f1000000-0000-0000-0000-000000000001'),
  'alice.traveler@test.com',
  'handle_new_user() populates profiles.email on insert'
);

update auth.users set email = 'alice.new-email@test.com' where id = 'f1000000-0000-0000-0000-000000000001';

select is(
  (select email from public.profiles where id = 'f1000000-0000-0000-0000-000000000001'),
  'alice.new-email@test.com',
  'sync_profile_email() keeps profiles.email current when auth.users.email changes'
);

-- ── Group 2: grants — authenticated can call (function does its own
--    internal check), anon cannot at all ─────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.admin_user_directory(text,text,int,int)'::regprocedure, 'EXECUTE'),
  'anon: admin_user_directory has no EXECUTE grant'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_user_directory(text,text,int,int)'::regprocedure, 'EXECUTE'),
  'authenticated: admin_user_directory has an EXECUTE grant (internal check gates it)'
);
select ok(
  not has_function_privilege('anon', 'public.admin_user_stats()'::regprocedure, 'EXECUTE'),
  'anon: admin_user_stats has no EXECUTE grant'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_user_stats()'::regprocedure, 'EXECUTE'),
  'authenticated: admin_user_stats has an EXECUTE grant (internal check gates it)'
);

-- ── Group 3: a non-admin, non-support caller is rejected ──────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select * from public.admin_user_directory() $$,
  '42501', 'INSUFFICIENT_PRIVILEGE',
  'admin_user_directory: a traveler is rejected'
);
select throws_ok(
  $$ select * from public.admin_user_stats() $$,
  '42501', 'INSUFFICIENT_PRIVILEGE',
  'admin_user_stats: a traveler is rejected'
);

reset role;

-- ── Group 4: an admin (aal2) can call both, and support can too ───────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ select * from public.admin_user_directory() $$,
  'admin_user_directory: an admin (aal2) can call it'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'support'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ select * from public.admin_user_stats() $$,
  'admin_user_stats: support (aal2) can call it'
);

reset role;

-- ── Group 5: search, role filter, pagination, and the LEFT JOIN case,
--    all as the admin fixture ─────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select is(
  (select count(*)::int from public.admin_user_directory(p_search := 'Bob Agency')),
  1,
  'admin_user_directory: full_name search matches exactly one user'
);
select is(
  (select id from public.admin_user_directory(p_search := 'Bob Agency') limit 1),
  'f1000000-0000-0000-0000-000000000002'::uuid,
  'admin_user_directory: full_name search returns the right user'
);

select is(
  (select count(*)::int from public.admin_user_directory(p_search := 'erin.finance')),
  1,
  'admin_user_directory: email substring search matches exactly one user'
);

select is(
  (select count(*)::int from public.admin_user_directory(p_role := 'agency')),
  1,
  'admin_user_directory: role filter matches exactly one user'
);

select is(
  (select count(*)::int from public.admin_user_directory(p_search := 'Grace')),
  1,
  'admin_user_directory: a user with no profiles row still appears (LEFT JOIN) — matched via auth.users.email search'
);
select is(
  (select full_name from public.admin_user_directory(p_search := 'Grace NoProfile') limit 1),
  null,
  'admin_user_directory: full_name is null for a user with no profiles row, not an error'
);

-- Full unfiltered set is our 7 fixture users (nothing else was inserted in
-- this transaction before this point).
select is(
  (select total_count from public.admin_user_directory(p_limit := 2, p_offset := 0) limit 1),
  7::bigint,
  'admin_user_directory: total_count reflects the full matching set, not just this page'
);
select is(
  (select count(*)::int from public.admin_user_directory(p_limit := 2, p_offset := 0)),
  2,
  'admin_user_directory: p_limit actually limits the returned page to 2 rows'
);
select is(
  (select count(*)::int from public.admin_user_directory(p_limit := 2, p_offset := 6)),
  1,
  'admin_user_directory: the last page (offset 6 of 7) returns exactly 1 row'
);

select throws_ok(
  $$ select * from public.admin_user_directory(p_limit := 0) $$,
  'P0001', 'INVALID_LIMIT: p_limit must be between 1 and 200',
  'admin_user_directory: p_limit=0 is rejected'
);
select throws_ok(
  $$ select * from public.admin_user_directory(p_limit := 500) $$,
  'P0001', 'INVALID_LIMIT: p_limit must be between 1 and 200',
  'admin_user_directory: p_limit=500 is rejected'
);
select throws_ok(
  $$ select * from public.admin_user_directory(p_offset := -1) $$,
  'P0001', 'INVALID_OFFSET: p_offset cannot be negative',
  'admin_user_directory: a negative p_offset is rejected'
);

-- ── Group 6: admin_user_stats() aggregate correctness ──────────────────────

select is((select total from public.admin_user_stats()), 7::bigint, 'admin_user_stats: total is 7');
select is((select travelers from public.admin_user_stats()), 3::bigint, 'admin_user_stats: travelers is 3 (alice, frank, grace)');
select is((select agencies from public.admin_user_stats()), 1::bigint, 'admin_user_stats: agencies is 1 (bob)');
select is((select admins from public.admin_user_stats()), 1::bigint, 'admin_user_stats: admins is 1 (carol)');
select is((select support from public.admin_user_stats()), 1::bigint, 'admin_user_stats: support is 1 (dave)');
select is((select finance from public.admin_user_stats()), 1::bigint, 'admin_user_stats: finance is 1 (erin)');
select is((select suspended from public.admin_user_stats()), 1::bigint, 'admin_user_stats: suspended is 1 (frank)');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
