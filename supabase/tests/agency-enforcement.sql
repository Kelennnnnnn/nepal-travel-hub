-- Tests for audit H5, H6, H7 fix (supabase/migrations/20260917000011_agency_enforcement.sql)
-- Run via: supabase test db supabase/tests/agency-enforcement.sql
begin;
create extension if not exists pgtap;

select plan(18);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h5-manager-a@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h5-manager-b@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h5-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

-- Agency A: will be suspended. Agency B: stays approved throughout, used
-- only as the H7 cross-agency target.
insert into public.agencies (id, legal_name, display_name, slug, city, district, payout_account_reference)
values
  ('a5a00000-0000-0000-0000-000000000001', 'H5 Agency A', 'H5 Agency A', 'h5-agency-a', 'Kathmandu', 'Kathmandu', 'original-payout-ref'),
  ('a5a00000-0000-0000-0000-000000000002', 'H5 Agency B', 'H5 Agency B', 'h5-agency-b', 'Pokhara', 'Kaski', 'b-payout-ref');

insert into public.agency_verification (agency_id, status)
values
  ('a5a00000-0000-0000-0000-000000000001', 'approved'),
  ('a5a00000-0000-0000-0000-000000000002', 'approved');

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('a5a00000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'manager', now()),
  ('a5a00000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'manager', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values
  ('a5100000-0000-0000-0000-000000000001', 'a5a00000-0000-0000-0000-000000000001', 'h5-listing-a', 'H5 Listing A', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published'),
  ('a5100000-0000-0000-0000-000000000002', 'a5a00000-0000-0000-0000-000000000002', 'h5-listing-b', 'H5 Listing B', 'Another test listing with a long enough description for the schema check constraint here too.', 'Trekking', 'Pokhara', '5 days', 5, 400, 10, 'Easy', 'published');

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 'a5a00000-0000-0000-0000-000000000001', current_date + 30, 'scheduled');

insert into public.inventory (id, departure_id, capacity_total)
values ('a5300000-0000-0000-0000-000000000001', 'a5200000-0000-0000-0000-000000000001', 10);

select set_config('request.jwt.claims', '', true);

-- ── Group 1 (H6): agencies_staff_update_own — protected fields pinned ──────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

update public.agencies set payout_account_reference = 'x', legal_name = 'Hijacked Name', slug = 'hijacked-slug' where id = 'a5a00000-0000-0000-0000-000000000001';

reset role;

select is(
  (select payout_account_reference from public.agencies where id = 'a5a00000-0000-0000-0000-000000000001'),
  'original-payout-ref',
  'manager: payout_account_reference is pinned to OLD, not client-writable'
);
select is(
  (select legal_name from public.agencies where id = 'a5a00000-0000-0000-0000-000000000001'),
  'H5 Agency A',
  'manager: legal_name is pinned to OLD'
);
select is(
  (select slug::text from public.agencies where id = 'a5a00000-0000-0000-0000-000000000001'),
  'h5-agency-a',
  'manager: slug is pinned to OLD'
);

-- ── Group 2 (H7): departures.agency_id is always server-derived from the
--    listing, never the client-supplied value ─────────────────────────────

-- As admin (bypasses has_agency_access entirely via departures_admin_all),
-- prove the trigger itself rewrites agency_id — isolates "the row ends up
-- with agency_id = B" from the separate RLS-denial question below.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000002', 'a5a00000-0000-0000-0000-000000000001', current_date + 31, 'scheduled');
select set_config('request.jwt.claims', '', true);

select is(
  (select agency_id::text from public.departures where id = 'a5200000-0000-0000-0000-000000000002'),
  'a5a00000-0000-0000-0000-000000000002',
  'sync_departure_agency: agency_id is always the LISTING''s real agency (B), regardless of the client-supplied value (A)'
);

-- As manager of A, attempting the same insert for B's listing is denied
-- outright — by the time WITH CHECK evaluates, the trigger has already
-- rewritten agency_id to B, and mA is not a manager of B.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, status)
     values ('a5100000-0000-0000-0000-000000000002', 'a5a00000-0000-0000-0000-000000000001', current_date + 32, 'scheduled') $$,
  '42501', null,
  'agency A''s manager inserting a departure for agency B''s listing is denied — the post-trigger row belongs to B, which mA has no access to'
);

reset role;

-- ── Group 3 (H5c): admin_suspend_agency / admin_reinstate_agency ──────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ select public.admin_suspend_agency('a5a00000-0000-0000-0000-000000000001'::uuid, 'test suspension') $$,
  'admin: admin_suspend_agency succeeds'
);

select throws_ok(
  $$ select public.admin_suspend_agency('a5a00000-0000-0000-0000-000000000001'::uuid, 'second call') $$,
  'P0001', 'ALREADY_SUSPENDED',
  'admin: a second suspend call on an already-suspended agency is rejected'
);

reset role;

select is(
  (select status from public.agency_verification where agency_id = 'a5a00000-0000-0000-0000-000000000001'),
  'suspended',
  'agency A is now suspended'
);
select is(
  (select status from public.listings where id = 'a5100000-0000-0000-0000-000000000001'),
  'paused',
  'agency A''s published listing was auto-paused by admin_suspend_agency'
);
select is(
  (select count(*)::int from public.audit_logs where resource_id = 'a5a00000-0000-0000-0000-000000000001' and action = 'agency_suspend'),
  1,
  'exactly one audit_logs row for the suspend action, despite two calls'
);
select is(
  (select count(*)::int from public.domain_events where aggregate_id = 'a5a00000-0000-0000-0000-000000000001' and event_type = 'AGENCY_SUSPENDED'),
  1,
  'exactly one domain_events row for the suspend action'
);

-- ── Group 4 (H5a/H5d): suspended agency — paused->published blocked,
--    creating a departure blocked, but SELECT of own data still works ─────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ update public.listings set status = 'published' where id = 'a5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'AGENCY_NOT_APPROVED',
  'suspended agency manager: paused -> published is blocked (self-service bypass closed)'
);

select throws_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, status)
     values ('a5100000-0000-0000-0000-000000000001', 'a5a00000-0000-0000-0000-000000000001', current_date + 33, 'scheduled') $$,
  '42501', null,
  'suspended agency manager: creating a new departure is denied (agency_is_active fails)'
);

select is(
  (select count(*)::int from public.listings where id = 'a5100000-0000-0000-0000-000000000001'),
  1,
  'suspended agency manager: can still SELECT their own listing'
);

reset role;
-- auth.uid()/is_admin() read the request.jwt.claims GUC directly,
-- independent of the Postgres role — `reset role` alone leaves Group 4's
-- manager claims (and, transitively, whatever admin claims are cached from
-- earlier groups) in place for the rest of the transaction. Clear it
-- explicitly so the "anon" checks below are actually anonymous, not a
-- leftover privileged identity under a different role name.
select set_config('request.jwt.claims', '', true);

-- ── Group 5 (H5b): anonymous cannot see a suspended agency's listings/
--    departures/inventory (previously published and publicly visible) ─────

set local role anon;

select is(
  (select count(*)::int from public.listings where id = 'a5100000-0000-0000-0000-000000000001'),
  0,
  'anonymous: cannot see a suspended agency''s (formerly published) listing'
);
select is(
  (select count(*)::int from public.departures where id = 'a5200000-0000-0000-0000-000000000001'),
  0,
  'anonymous: cannot see a suspended agency''s departure'
);
select is(
  (select count(*)::int from public.inventory where id = 'a5300000-0000-0000-0000-000000000001'),
  0,
  'anonymous: cannot see a suspended agency''s inventory'
);

reset role;

-- ── Group 6: deleting a departure with a held reservation is blocked ──────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at)
values ('a5400000-0000-0000-0000-000000000001', 'a5300000-0000-0000-0000-000000000001', 1, 'held', now() + interval '15 minutes');

select throws_ok(
  $$ delete from public.departures where id = 'a5200000-0000-0000-0000-000000000001' $$,
  'P0001', 'DEPARTURE_HAS_RESERVATIONS',
  'deleting a departure with a held reservation is blocked, even for an unrestricted writer'
);

select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
