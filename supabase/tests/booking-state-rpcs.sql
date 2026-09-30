-- Tests for audit H2 fix (supabase/migrations/20260917000008_booking_state_rpcs.sql)
-- Run via: supabase test db supabase/tests/booking-state-rpcs.sql
begin;
create extension if not exists pgtap;

select plan(13);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h2-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h2-manager@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h2-staff@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h2-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b2000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h2-traveler2@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('b2a00000-0000-0000-0000-000000000001', 'H2 Test Agency', 'H2 Test Agency', 'h2-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('b2a00000-0000-0000-0000-000000000001', 'approved', now(), now());

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'manager', now()),
  ('b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'staff', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('b2100000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'h2-test-listing', 'H2 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('b2200000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', current_date + 30, 'scheduled');

insert into public.inventory (id, departure_id, capacity_total)
values ('b2300000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 10);

insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at, confirmed_at)
values ('b2400000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', 2, 'confirmed', now() + interval '1 hour', now());

insert into public.booking_quotes (id, listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at)
values ('b2500000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 1000.00, 10.00, 100.00, 900.00, 'NPR', '{}'::jsonb, 'b2400000-0000-0000-0000-000000000001', 'consumed', now() + interval '1 hour');

-- Booking A: confirmed + paid — for cancellation and trip-status tests.
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('b2600000-0000-0000-0000-000000000001', 'b2500000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 'confirmed', 'paid');

-- Booking B: pending_payment + unpaid — for the NOT_CANCELLABLE case.
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('b2600000-0000-0000-0000-000000000002', 'b2500000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 'pending_payment', 'unpaid');

-- Booking C: payment_processing + unpaid — for the check-constraint test
-- (payment_processing -> confirmed IS a legal edge in guard_booking_status_
-- transition, isolating the check constraint as the thing that blocks it,
-- not the transition graph).
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('b2600000-0000-0000-0000-000000000003', 'b2500000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 'payment_processing', 'unpaid');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: no client role has bare UPDATE on bookings anymore ────────────

-- No UPDATE policy applies to this role at all anymore, so the row is
-- simply invisible to the UPDATE's USING clause — Postgres affects 0 rows
-- silently rather than raising (RLS only raises 42501 when a row IS
-- USING-visible but WITH CHECK then rejects the new values). Verified as
-- "0 rows / RLS error" per the prompt's own acceptance-check wording: check
-- the row is actually unchanged, not that an exception was thrown.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

update public.bookings set participant_count = 99 where id = 'b2600000-0000-0000-0000-000000000001';

reset role;

select is(
  (select participant_count from public.bookings where id = 'b2600000-0000-0000-0000-000000000001'),
  2,
  'traveler: direct UPDATE of their own booking (any column) affects 0 rows — bookings_traveler_request_cancel is gone'
);

-- ── Group 2: request_booking_cancellation() ────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select lives_ok(
  $$ select public.request_booking_cancellation('b2600000-0000-0000-0000-000000000001'::uuid, 'change of plans') $$,
  'traveler: request_booking_cancellation on a confirmed booking succeeds'
);

reset role;

select is(
  (select booking_status from public.bookings where id = 'b2600000-0000-0000-0000-000000000001'),
  'cancel_requested',
  'booking A is now cancel_requested (not cancelled — that is out of scope)'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.request_booking_cancellation('b2600000-0000-0000-0000-000000000002'::uuid, 'change of plans') $$,
  'P0001', 'NOT_CANCELLABLE',
  'traveler: request_booking_cancellation on a pending_payment booking fails NOT_CANCELLABLE'
);

reset role;

-- ── Group 3: agency_set_trip_status() ──────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.agency_set_trip_status('b2600000-0000-0000-0000-000000000002'::uuid, 'in_progress') $$,
  'P0001', 'INSUFFICIENT_PRIVILEGE',
  'agency staff (not manager+): agency_set_trip_status fails INSUFFICIENT_PRIVILEGE'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

-- Booking B is still pending_payment (cancellation only touched booking A),
-- so drive it to confirmed via direct fixture-style update isn't available
-- (no client UPDATE policy) — instead use booking B only for the earlier
-- NOT_CANCELLABLE check, and exercise the fulfillment path on booking A's
-- sibling: re-use booking A is now cancel_requested, so use a FRESH
-- confirmed+paid booking for the trip-status walk instead.
reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('b2600000-0000-0000-0000-000000000004', 'b2500000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'b2a00000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 'confirmed', 'paid');
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select lives_ok(
  $$ select public.agency_set_trip_status('b2600000-0000-0000-0000-000000000004'::uuid, 'in_progress') $$,
  'manager: agency_set_trip_status confirmed -> in_progress succeeds'
);
select lives_ok(
  $$ select public.agency_set_trip_status('b2600000-0000-0000-0000-000000000004'::uuid, 'completed') $$,
  'manager: agency_set_trip_status in_progress -> completed succeeds'
);

reset role;

select is(
  (select booking_status from public.bookings where id = 'b2600000-0000-0000-0000-000000000004'),
  'completed',
  'booking is now completed'
);
select isnt(
  (select completed_at from public.bookings where id = 'b2600000-0000-0000-0000-000000000004'),
  null,
  'completed_at was set by agency_set_trip_status'
);

-- ── Group 4: the payment-before-active check constraint holds regardless
--    of caller — tested directly as an unrestricted (superuser) writer to
--    isolate it from RLS/authorization entirely. ──────────────────────────

select throws_ok(
  $$ update public.bookings set booking_status = 'confirmed' where id = 'b2600000-0000-0000-0000-000000000003' $$,
  '23514', null,
  'even an unrestricted writer cannot set booking_status=confirmed while payment_status=unpaid (bookings_paid_before_active)'
);

-- ── Group 5: admin can still change fields the RPCs deliberately can''t;
--    a manager attempting the same via direct UPDATE is denied. ───────────

select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ update public.bookings set traveler_id = 'b2000000-0000-0000-0000-000000000005' where id = 'b2600000-0000-0000-0000-000000000002' $$,
  'admin: direct UPDATE reassigning traveler_id succeeds (bookings_admin_all + is_admin() exemption in guard_booking_immutable_fields)'
);

select is(
  (select traveler_id::text from public.bookings where id = 'b2600000-0000-0000-0000-000000000002'),
  'b2000000-0000-0000-0000-000000000005',
  'traveler_id was actually reassigned'
);

select set_config('request.jwt.claims', '', true);

-- Same "0 rows, not an exception" reasoning as Group 1 above.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

update public.bookings set booking_status = 'in_progress' where id = 'b2600000-0000-0000-0000-000000000002';

reset role;

select is(
  (select booking_status from public.bookings where id = 'b2600000-0000-0000-0000-000000000002'),
  'pending_payment',
  'manager: direct UPDATE (bypassing agency_set_trip_status) affects 0 rows — bookings_agency_update_own is gone'
);

select * from finish();
rollback;
