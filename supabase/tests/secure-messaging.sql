-- Tests for audit C2 fix (supabase/migrations/20260917000007_secure_messaging.sql)
-- Run via: supabase test db supabase/tests/secure-messaging.sql
begin;
create extension if not exists pgtap;

select plan(10);

-- ── Fixtures ─────────────────────────────────────────────────────────────
-- Two real auth.users (traveler + a second, unrelated user "C" who is not a
-- participant in anything), an approved agency with one active accepted
-- staff member, and a published listing.

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c2-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c2-agency-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c2-outsider@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('c2a00000-0000-0000-0000-000000000001', 'C2 Test Agency', 'C2 Test Agency', 'c2-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('c2a00000-0000-0000-0000-000000000001', 'approved', now(), now());

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('c2a00000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('c2100000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001', 'c2-test-listing', 'C2 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: start_conversation() creates the conversation + participants,
--    and is idempotent on (traveler_id, agency_id, listing_id) ────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select public.start_conversation('c2a00000-0000-0000-0000-000000000001'::uuid, 'c2100000-0000-0000-0000-000000000001'::uuid) as conv_id \gset

select ok(:'conv_id' is not null, 'start_conversation() returns a conversation id');

select is(
  public.start_conversation('c2a00000-0000-0000-0000-000000000001'::uuid, 'c2100000-0000-0000-0000-000000000001'::uuid)::text,
  :'conv_id',
  'start_conversation() called again with the same (traveler, agency, listing) key returns the SAME id, not a duplicate'
);

select is(
  (select count(*)::int from public.conversation_participants where conversation_id = :'conv_id'::uuid),
  2,
  'exactly 2 participants were auto-created: the traveler and the one active accepted agency owner'
);

select is(
  (select participant_role from public.conversation_participants where conversation_id = :'conv_id'::uuid and user_id = 'c2000000-0000-0000-0000-000000000001'),
  'traveler',
  'the caller was added as participant_role traveler (not something client-chosen, e.g. support)'
);

reset role;

-- ── Group 2: the old open-write policies are gone — no role can INSERT into
--    conversations or conversation_participants directly anymore ─────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

-- Targets the real fixture conversation by its known id directly, rather
-- than selecting it via a subquery on public.conversations — user C can't
-- see that row through RLS either, so a subquery source would silently
-- return zero rows (a false pass: no exception because nothing was
-- attempted, not because the INSERT was denied).
select throws_ok(
  format($$ insert into public.conversation_participants (conversation_id, user_id, participant_role)
     values ('%s'::uuid, 'c2000000-0000-0000-0000-000000000003', 'agency') $$, :'conv_id'),
  '42501',
  null,
  'outsider (user C): direct INSERT into conversation_participants is RLS-denied (audit C2 — this was the hole)'
);

select throws_ok(
  $$ insert into public.conversations (agency_id) values ('c2a00000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'outsider: direct INSERT into conversations is RLS-denied (audit C2 — conversations_insert_traveler used to be with check (true))'
);

-- User C (not a participant) cannot see the conversation's messages.
select is(
  (select count(*)::int from public.messages where conversation_id = :'conv_id'::uuid),
  0,
  'outsider: sees zero rows on messages for a conversation they are not a participant of'
);

reset role;

-- ── Group 3: AGENCY_NOT_AVAILABLE for a non-approved agency ────────────────

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('c2a00000-0000-0000-0000-000000000002', 'C2 Unapproved Agency', 'C2 Unapproved Agency', 'c2-unapproved-agency', 'Pokhara', 'Kaski');
-- deliberately no agency_verification row -> is_agency_publicly_approved() is false

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.start_conversation('c2a00000-0000-0000-0000-000000000002'::uuid) $$,
  'P0001', 'AGENCY_NOT_AVAILABLE',
  'start_conversation() against a non-approved agency fails AGENCY_NOT_AVAILABLE'
);

reset role;

-- ── Group 4: message content length + rate limiting ────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  format($$ insert into public.messages (conversation_id, sender_id, content) values ('%s'::uuid, 'c2000000-0000-0000-0000-000000000001', '') $$, :'conv_id'),
  '23514', null,
  'an empty message is rejected by the content length check'
);

-- 30 messages should succeed, the 31st within the same 5-minute window fails
-- RATE_LIMITED.
insert into public.messages (conversation_id, sender_id, content)
select :'conv_id'::uuid, 'c2000000-0000-0000-0000-000000000001', 'msg ' || gs
from generate_series(1, 30) as gs;

select throws_ok(
  format($$ insert into public.messages (conversation_id, sender_id, content) values ('%s'::uuid, 'c2000000-0000-0000-0000-000000000001', 'one too many') $$, :'conv_id'),
  'P0001', 'RATE_LIMITED',
  'the 31st message from the same sender within 5 minutes is rejected RATE_LIMITED'
);

reset role;

select * from finish();
rollback;
