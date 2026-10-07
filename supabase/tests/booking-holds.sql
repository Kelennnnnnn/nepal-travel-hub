-- Acceptance tests for hold -> quote -> booking creation
-- (supabase/migrations/20260919000001_booking_holds.sql). Concurrency
-- checks (10 concurrent holds against daily_booking_limit=3; 50 concurrent
-- holds on an unlimited listing) cannot be expressed in a single pgTAP
-- connection and were verified manually against a local instance instead
-- (see the session notes) — this file covers everything else.
-- Run via: supabase test db supabase/tests/booking-holds.sql
begin;
create extension if not exists pgtap;

select plan(21);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bh-traveler1@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bh-traveler2@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bh-agency@test.com',    '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bh-admin@test.com',     '{"role": "admin"}'::jsonb,    '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('c1a00000-0000-0000-0000-000000000001', 'Booking Holds Agency', 'Booking Holds Agency', 'bh-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('c1a00000-0000-0000-0000-000000000001', 'approved', now(), now());

-- fee_only, unlimited, duration_days=1 -> product_value 10,000 / fee 1,500 (15%) / balance 8,500.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('c1100000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001', 'bh-fee-only', 'Booking Holds Fee Only', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');

-- full_online, same price.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, payment_requirement, difficulty, status)
values ('c1100000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', 'bh-full-online', 'Booking Holds Full Online', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'full_online', 'Easy', 'published');

select set_config('request.jwt.claims', '', true);

-- ── 1. Role checks ───────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  $$ select public.create_booking_hold('c1100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1, jsonb_build_object('full_name', 'X', 'contact_email', 'x@test.com', 'contact_phone', '+9779800000')) $$,
  'P0001', 'ROLE_CANNOT_BOOK',
  'agency account cannot create a booking hold'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  $$ select public.create_booking_hold('c1100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1, jsonb_build_object('full_name', 'X', 'contact_email', 'x@test.com', 'contact_phone', '+9779800000')) $$,
  'P0001', 'ROLE_CANNOT_BOOK',
  'admin account cannot create a booking hold'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.create_booking_hold(uuid, date, integer, jsonb)', 'EXECUTE'),
  'anon has no EXECUTE grant on create_booking_hold at all'
);

-- ── 2. Guest validation ──────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  $$ select public.create_booking_hold('c1100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1, jsonb_build_object('full_name', 'X', 'contact_email', 'not-an-email', 'contact_phone', '+9779800000')) $$,
  'P0001', null,
  'invalid contact_email is rejected'
);

-- ── 3. Successful hold + quote amounts (fee_only) ───────────────────────

select booking_id, product_value, platform_fee, agency_balance, amount_due_now, currency, confirmation_mode, payment_requirement
  into temp t1
  from public.create_booking_hold(
    'c1100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
    jsonb_build_object('full_name', 'Fee Only Traveler', 'contact_email', 'feeonly@test.com', 'contact_phone', '+9779800000')
  );

select is((select product_value from t1), 10000.00, 'product_value is 10,000');
select is((select platform_fee from t1), 1500.00, 'platform_fee is 1,500.00 (15%)');
select is((select agency_balance from t1), 8500.00, 'agency_balance is 8,500.00');
select is((select amount_due_now from t1), 1500.00, 'amount_due_now equals the fee for fee_only');
select is((select confirmation_mode from t1), 'instant', 'confirmation_mode snapshot is instant for this 1-day Cultural listing');

select is(
  (select booking_status from public.bookings where id = (select booking_id from t1)),
  'pending_payment',
  'the booking lands at pending_payment'
);

-- ── 4. full_online amount_due_now ────────────────────────────────────────

select booking_id, amount_due_now into temp t2 from public.create_booking_hold(
  'c1100000-0000-0000-0000-000000000002'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'Full Online Traveler', 'contact_email', 'fullonline@test.com', 'contact_phone', '+9779800000')
);
select is((select amount_due_now from t2), 10000.00, 'amount_due_now equals product_value for full_online');

select is(
  (select balance_method from public.bookings where id = (select booking_id from t2)),
  'into_nepal_platform',
  'full_online booking has balance_method into_nepal_platform'
);

-- ── 5. Idempotency: same traveler, same listing+date -> same booking ────

select booking_id into temp t3a from public.create_booking_hold(
  'c1100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 1,
  jsonb_build_object('full_name', 'Repeat Traveler', 'contact_email', 'repeat@test.com', 'contact_phone', '+9779800000')
);
select booking_id into temp t3b from public.create_booking_hold(
  'c1100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 1,
  jsonb_build_object('full_name', 'Repeat Traveler', 'contact_email', 'repeat@test.com', 'contact_phone', '+9779800000')
);
select is((select booking_id from t3a), (select booking_id from t3b), 'calling create_booking_hold twice for the same listing+date returns the same booking id');
select is(
  (select count(*)::int from public.bookings where traveler_id = 'c1000000-0000-0000-0000-000000000001' and listing_id = 'c1100000-0000-0000-0000-000000000001' and departure_id = (select departure_id from public.bookings where id = (select booking_id from t3a)) and booking_status = 'pending_payment'),
  1,
  'only one pending_payment row exists for that listing+date despite the repeat call'
);

reset role;

-- ── 6. Snapshot immutability ─────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
update public.listings set base_price = 999999, min_advance_hours = 400 where id = 'c1100000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);

select is(
  (select product_value from public.booking_quotes where id = (select quote_id from public.bookings where id = (select booking_id from t1))),
  10000.00,
  'the quote''s product_value is unchanged after the listing''s base_price changes'
);

-- ── 7. Hold expiry sweep ──────────────────────────────────────────────────

select quote_id, departure_id into temp t4 from public.bookings where id = (select booking_id from t1);
select inventory_reservation_id into temp t4b from public.booking_quotes where id = (select quote_id from t4);

update public.booking_quotes set expires_at = now() - interval '1 minute' where id = (select quote_id from t4);
update public.inventory_reservations set expires_at = now() - interval '1 minute' where id = (select inventory_reservation_id from t4b);

select public.expire_stale_booking_holds();

select is((select status from public.inventory_reservations where id = (select inventory_reservation_id from t4b)), 'expired', 'the reservation is expired by the sweep');
select is((select status from public.booking_quotes where id = (select quote_id from t4)), 'expired', 'the quote is expired by the sweep');
select is((select booking_status from public.bookings where id = (select booking_id from t1)), 'expired', 'the booking is expired by the sweep');

-- ── 8. release_booking_hold ───────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id into temp t5 from public.create_booking_hold(
  'c1100000-0000-0000-0000-000000000001'::uuid, current_date + 20, 1,
  jsonb_build_object('full_name', 'Release Traveler', 'contact_email', 'release@test.com', 'contact_phone', '+9779800000')
);
select lives_ok(
  $$ select public.release_booking_hold((select booking_id from t5)) $$,
  'the traveler can release their own pending_payment hold'
);
reset role;

select is((select booking_status from public.bookings where id = (select booking_id from t5)), 'cancelled', 'released booking is cancelled');
select is((select cancelled_by from public.bookings where id = (select booking_id from t5)), 'traveler', 'cancelled_by is traveler');

select * from finish();
rollback;
