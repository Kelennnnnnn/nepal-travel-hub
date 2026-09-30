-- Tests for audit M1 fix (supabase/migrations/20260917000012_agency_invitations.sql)
-- Run via: supabase test db supabase/tests/agency-invitations.sql
begin;
create extension if not exists pgtap;

select plan(10);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a6000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-invitee@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a6000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-second-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a6000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-outsider@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a6a00000-0000-0000-0000-000000000001', 'M1 Test Agency', 'M1 Test Agency', 'm1-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.agency_verification (agency_id, status)
values ('a6a00000-0000-0000-0000-000000000001', 'approved');

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('a6a00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'owner', now()),
  ('a6a00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003', 'owner', now());

-- An invited-but-not-yet-accepted member — accepted_at is null.
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('a6a00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'staff', null);

select set_config('request.jwt.claims', '', true);

-- ── Group 1: an owner cannot directly INSERT agency_users for another
--    user — agency_users_manage_own_agency is gone. ────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  format($$ insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
     values ('a6a00000-0000-0000-0000-000000000001', '%s', 'owner', now()) $$, 'a6000000-0000-0000-0000-000000000004'),
  '42501', null,
  'owner: direct INSERT of agency_users for another user is RLS-denied — agency_users_manage_own_agency is gone'
);

reset role;

-- ── Group 2: an invited-but-not-accepted member has no access ─────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select is(
  public.has_agency_access('a6a00000-0000-0000-0000-000000000001'::uuid),
  false,
  'has_agency_access() is false for a member whose accepted_at is still null'
);

reset role;

-- ── Group 3: remove_agency_member / change_agency_member_role ─────────────

-- First, accept the pending invitee directly (simulating what the accept
-- action would do) so removal has a real, active member to act on.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
update public.agency_users set accepted_at = now() where agency_id = 'a6a00000-0000-0000-0000-000000000001' and user_id = 'a6000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select lives_ok(
  $$ select public.remove_agency_member('a6a00000-0000-0000-0000-000000000001'::uuid, 'a6000000-0000-0000-0000-000000000002'::uuid) $$,
  'owner: remove_agency_member succeeds for a real, active member'
);

reset role;

select is(
  (select removed_at is not null from public.agency_users where agency_id = 'a6a00000-0000-0000-0000-000000000001' and user_id = 'a6000000-0000-0000-0000-000000000002'),
  true,
  'removed member: removed_at is now set (soft-removed, not deleted)'
);

-- Removing the last owner is refused. Both owners are currently active;
-- remove one first (leaves exactly one), then try to remove that one too.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select public.remove_agency_member('a6a00000-0000-0000-0000-000000000001'::uuid, 'a6000000-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $$ select public.remove_agency_member('a6a00000-0000-0000-0000-000000000001'::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid) $$,
  'P0001', 'CANNOT_REMOVE_LAST_OWNER',
  'removing the last active owner is refused'
);

select throws_ok(
  $$ select public.change_agency_member_role('a6a00000-0000-0000-0000-000000000001'::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, 'staff') $$,
  'P0001', 'CANNOT_DEMOTE_LAST_OWNER',
  'demoting the last active owner away from owner is refused'
);

reset role;

-- ── Group 4: removed member loses access to agency conversations too ──────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

-- Re-add the removed member as an active staff member, put them in a
-- conversation for this agency, then remove them again and check the
-- conversation_participants row is gone too.
update public.agency_users set removed_at = null, accepted_at = now() where agency_id = 'a6a00000-0000-0000-0000-000000000001' and user_id = 'a6000000-0000-0000-0000-000000000002';

insert into public.conversations (id, agency_id, traveler_id)
values ('a6c00000-0000-0000-0000-000000000001', 'a6a00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000004');
insert into public.conversation_participants (conversation_id, user_id, participant_role)
values
  ('a6c00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000004', 'traveler'),
  ('a6c00000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'agency');

select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select public.remove_agency_member('a6a00000-0000-0000-0000-000000000001'::uuid, 'a6000000-0000-0000-0000-000000000002'::uuid);

reset role;

select is(
  (select count(*)::int from public.conversation_participants where conversation_id = 'a6c00000-0000-0000-0000-000000000001' and user_id = 'a6000000-0000-0000-0000-000000000002'),
  0,
  'removed member: dropped out of the agency''s conversation_participants immediately'
);
select is(
  (select count(*)::int from public.conversation_participants where conversation_id = 'a6c00000-0000-0000-0000-000000000001' and user_id = 'a6000000-0000-0000-0000-000000000004'),
  1,
  'the traveler''s own participant row in that conversation is untouched'
);

-- ── Group 5: agency_invitations RLS — no direct client write path ─────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.agency_invitations (agency_id, email, agency_role, token_hash, invited_by)
     values ('a6a00000-0000-0000-0000-000000000001', 'x@test.com', 'manager', 'deadbeef', 'a6000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'owner: direct INSERT into agency_invitations is RLS-denied — invite/accept/revoke all go through the edge function'
);

reset role;

-- ── Group 6: agency_users_one_active_owner_per_user ────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a6a00000-0000-0000-0000-000000000002', 'M1 Second Agency', 'M1 Second Agency', 'm1-second-agency', 'Pokhara', 'Kaski');
insert into public.agency_verification (agency_id, status) values ('a6a00000-0000-0000-0000-000000000002', 'draft');

select throws_ok(
  $$ insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
     values ('a6a00000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000001', 'owner', now()) $$,
  '23505', null,
  'a user already an active owner elsewhere cannot become a second active owner (unique partial index)'
);

select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
