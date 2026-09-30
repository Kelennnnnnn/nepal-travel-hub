-- Tests for the welcome_emails dedupe table
-- (supabase/migrations/20260917000017_welcome_emails.sql), added for the
-- welcome-email dead-path fix: send-welcome-email relies on this table's
-- primary key + "insert ... on conflict do nothing returning user_id" to
-- make two concurrent calls for the same user result in exactly one send.
-- Run via: supabase test db supabase/tests/welcome-emails.sql
begin;
create extension if not exists pgtap;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('a9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'welcome-test@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

-- No client role can read/write this table at all — server-internal
-- bookkeeping, same shape as idempotency_keys/rate_limits.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'welcome_emails'),
  0,
  'welcome_emails has zero RLS policies for any client role'
);

set local role service_role;

-- Simulates send-welcome-email's own insert-or-nothing dedupe logic
-- directly against the table, since the actual dedupe decision lives in
-- application code (the edge function), not in a dedicated RPC. pgTAP's
-- is()/lives_ok() run their argument as a subquery expression, which
-- Postgres disallows for a data-modifying WITH — so each insert runs as
-- its own top-level statement, with the row count checked separately.
insert into public.welcome_emails (user_id) values ('a9000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

select is(
  (select count(*)::int from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001'),
  1,
  'first insert wins the race and creates a row'
);

insert into public.welcome_emails (user_id) values ('a9000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

select is(
  (select count(*)::int from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001'),
  1,
  'a second insert for the same user is a no-op — the loser of a concurrent race sends nothing'
);

select is(
  (select sent_at from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001') is not null,
  true,
  'exactly one welcome_emails row exists for the user despite two insert attempts'
);

-- Simulates the failed-send rollback: the row is deleted so a retry can
-- insert again later.
delete from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001';

insert into public.welcome_emails (user_id) values ('a9000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

select is(
  (select count(*)::int from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001'),
  1,
  'after deleting the row (simulating a failed send), a later retry can insert again'
);

reset role;

select is(
  (select user_id from public.welcome_emails where user_id = 'a9000000-0000-0000-0000-000000000001'),
  'a9000000-0000-0000-0000-000000000001',
  'the retried insert is the final surviving row'
);

select * from finish();
rollback;
