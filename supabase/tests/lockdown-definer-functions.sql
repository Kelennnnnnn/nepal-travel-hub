-- Tests for audit C1 fix (supabase/migrations/20260917000005_lockdown_definer_functions.sql)
-- Run via: supabase test db supabase/tests/lockdown-definer-functions.sql
begin;
create extension if not exists pgtap;

select plan(20);

-- ── Fixtures (inserted as postgres/superuser — bypasses RLS, which is fine,
--    this is test setup, not the thing under test) ─────────────────────────

-- guard_listing_status_transition() (migration 20260917000002) only allows
-- a listing to be created directly as 'published' when is_admin() is true,
-- which reads the request.jwt.claims GUC — unset by default in this setup
-- step, so a fake admin JWT context is needed purely to seed the fixture.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a0000000-0000-0000-0000-000000000001', 'C1 Test Agency', 'C1 Test Agency', 'c1-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('a0000000-0000-0000-0000-000000000001', 'approved', now(), now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1-test-listing', 'C1 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

-- Clear the fake JWT context now that fixture setup is done — the actual
-- tests below set their own role/claims as needed.
select set_config('request.jwt.claims', '', true);

-- A genuinely bookable departure: scheduled, future, no cutoff.
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_date + 30, 'scheduled');
insert into public.inventory (departure_id, capacity_total)
values ('a0000000-0000-0000-0000-000000000003', 5);

-- A cancelled departure (otherwise identical) — for DEPARTURE_NOT_BOOKABLE.
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_date + 31, 'cancelled');
insert into public.inventory (departure_id, capacity_total)
values ('a0000000-0000-0000-0000-000000000004', 5);

-- A past departure (status scheduled, but the date has already passed) —
-- for the second DEPARTURE_NOT_BOOKABLE case.
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_date - 5, 'scheduled');
insert into public.inventory (departure_id, capacity_total)
values ('a0000000-0000-0000-0000-000000000005', 5);

-- ── Group 1: anon is blocked from every function in audit C1's step 1 list,
--    plus set_departure_capacity (step 4 — authenticated only) ─────────────

set local role anon;

select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 15) $$,
  '42501', null, 'anon: hold_inventory is permission denied'
);
select throws_ok(
  $$ select public.confirm_reservation(gen_random_uuid(), gen_random_uuid()) $$,
  '42501', null, 'anon: confirm_reservation is permission denied'
);
select throws_ok(
  $$ select public.release_reservation(gen_random_uuid(), 'released') $$,
  '42501', null, 'anon: release_reservation is permission denied'
);
select throws_ok(
  $$ select public.record_booking_event(gen_random_uuid(), 'x') $$,
  '42501', null, 'anon: record_booking_event is permission denied'
);
select throws_ok(
  $$ select public.record_audit_log(gen_random_uuid(), 'x', 'x', 'x') $$,
  '42501', null, 'anon: record_audit_log is permission denied'
);
select throws_ok(
  $$ select public.set_departure_capacity('a0000000-0000-0000-0000-000000000003'::uuid, 5) $$,
  '42501', null, 'anon: set_departure_capacity is permission denied'
);

reset role;

-- ── Group 2: authenticated (a signed-in traveler, no special role) is
--    blocked from the same audit C1 functions — these are service-role-only
--    regardless of being signed in ─────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 15) $$,
  '42501', null, 'authenticated traveler: hold_inventory is permission denied'
);
select throws_ok(
  $$ select public.confirm_reservation(gen_random_uuid(), gen_random_uuid()) $$,
  '42501', null, 'authenticated traveler: confirm_reservation is permission denied'
);
select throws_ok(
  $$ select public.release_reservation(gen_random_uuid(), 'released') $$,
  '42501', null, 'authenticated traveler: release_reservation is permission denied'
);
select throws_ok(
  $$ select public.record_audit_log(gen_random_uuid(), 'x', 'x', 'x') $$,
  '42501', null, 'authenticated traveler: record_audit_log is permission denied'
);
select throws_ok(
  $$ select public.record_booking_event(gen_random_uuid(), 'x') $$,
  '42501', null, 'authenticated traveler: record_booking_event is permission denied'
);

-- Sanity check: step 4 didn't accidentally lock authenticated out of the
-- RLS helper functions it genuinely needs.
select lives_ok(
  $$ select public.is_admin() $$,
  'authenticated traveler: is_admin() (an RLS helper) is still callable'
);

reset role;

-- ── Group 3: service_role — hold_inventory's hardened behaviour ───────────

set local role service_role;

select lives_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 15) $$,
  'service_role: valid hold on a bookable departure succeeds'
);

select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 100000) $$,
  'P0001', 'INVALID_TTL', 'service_role: ttl=100000 fails INVALID_TTL'
);
select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 0) $$,
  'P0001', 'INVALID_TTL', 'service_role: ttl=0 fails INVALID_TTL'
);

select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000004'::uuid, 1, 15) $$,
  'P0001', 'DEPARTURE_NOT_BOOKABLE', 'service_role: cancelled departure fails DEPARTURE_NOT_BOOKABLE'
);
select throws_ok(
  $$ select public.hold_inventory('a0000000-0000-0000-0000-000000000005'::uuid, 1, 15) $$,
  'P0001', 'DEPARTURE_NOT_BOOKABLE', 'service_role: past departure fails DEPARTURE_NOT_BOOKABLE'
);

-- ── Group 4: service_role — release_reservation's reason validation ───────

select throws_ok(
  $$ select public.release_reservation(gen_random_uuid(), 'not_a_real_reason') $$,
  'P0001', 'INVALID_REASON', 'service_role: bogus reason fails INVALID_REASON'
);

-- A fresh hold, then released with the new 'admin_release' reason value —
-- confirms the widened accept-list actually works, not just that bogus
-- values are rejected.
select public.hold_inventory('a0000000-0000-0000-0000-000000000003'::uuid, 1, 15) as fresh_reservation_id \gset
select lives_ok(
  format($$ select public.release_reservation('%s'::uuid, 'admin_release') $$, :'fresh_reservation_id'),
  'service_role: admin_release is now an accepted reason'
);

-- ── Group 5: the CI guard itself ───────────────────────────────────────────

select is(
  (select count(*)::int from public.audit_definer_exposure()),
  0,
  'audit_definer_exposure() returns zero rows'
);

reset role;

select * from finish();
rollback;
