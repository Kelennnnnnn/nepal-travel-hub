-- Tests for the account-deletion rewrite
-- (supabase/migrations/20260917000014_account_deletion.sql)
-- Run via: supabase test db supabase/tests/account-deletion.sql
begin;
create extension if not exists pgtap;

select plan(15);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a8000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del-upcoming@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a8000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del-sole-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a8a00000-0000-0000-0000-000000000001', 'Del Test Agency', 'Del Test Agency', 'del-test-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status) values ('a8a00000-0000-0000-0000-000000000001', 'approved');
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('a8a00000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003', 'owner', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('a8100000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', 'del-listing', 'Del Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

-- Departure A: in the PAST (for the completed-booking traveler).
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a8200000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', current_date - 10, 'scheduled');
-- Departure B: in the FUTURE (for the upcoming-booking traveler).
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('a8200000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', current_date + 30, 'scheduled');

insert into public.inventory (id, departure_id, capacity_total) values
  ('a8300000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 10),
  ('a8300000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-000000000002', 10);
insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at, confirmed_at) values
  ('a8400000-0000-0000-0000-000000000001', 'a8300000-0000-0000-0000-000000000001', 1, 'confirmed', now() + interval '1 hour', now()),
  ('a8400000-0000-0000-0000-000000000002', 'a8300000-0000-0000-0000-000000000002', 1, 'confirmed', now() + interval '1 hour', now());

insert into public.booking_quotes (id, listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at, confirmation_mode, payment_requirement, amount_due_now, start_at, end_at, no_show_grace_minutes, fee_refund_rule)
values
  ('a8500000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 1, 500.00, 10.00, 50.00, 450.00, 'NPR', '{}'::jsonb, 'a8400000-0000-0000-0000-000000000001', 'consumed', now() + interval '1 hour', 'instant', 'fee_only', 50.00, now() + interval '30 days', now() + interval '31 days', 30, '{"free_cancel_hours": 24}'::jsonb),
  ('a8500000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000002', 'a8a00000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 1, 500.00, 10.00, 50.00, 450.00, 'NPR', '{}'::jsonb, 'a8400000-0000-0000-0000-000000000002', 'consumed', now() + interval '1 hour', 'instant', 'fee_only', 50.00, now() + interval '30 days', now() + interval '31 days', 30, '{"free_cancel_hours": 24}'::jsonb);

-- Booking A: COMPLETED, past departure — traveler 1 should be deletable.
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('a8600000-0000-0000-0000-000000000001', 'a8500000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 1, 'completed', 'paid');
-- Booking B: CONFIRMED, future departure — traveler 2 should be blocked.
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('a8600000-0000-0000-0000-000000000002', 'a8500000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000002', 'a8a00000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 1, 'confirmed', 'paid');

insert into public.booking_guests (id, booking_id, full_name, date_of_birth, passport_number_encrypted, contact_phone, contact_email, is_primary)
values ('a8700000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-000000000001', 'Real Guest Name', '1990-01-01', 'encrypted-passport-data', '+977-1-1111111', 'guest@test.com', true);

insert into public.reviews (id, listing_id, agency_id, booking_id, traveler_id, rating, title, comment, traveler_name)
values ('a8800000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8a00000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 5, 'Great trip', 'This was a genuinely wonderful experience, highly recommended for anyone.', 'Real Traveler Name');

insert into public.wishlists (user_id, listing_id) values ('a8000000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: traveler with a completed booking + review can delete ────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select lives_ok(
  $$ select public.delete_my_account() $$,
  'traveler with only a completed booking can delete their account'
);

reset role;

select is(
  (select count(*)::int from public.bookings where id = 'a8600000-0000-0000-0000-000000000001'),
  1,
  'the completed booking still exists'
);
select is(
  (select booking_status from public.bookings where id = 'a8600000-0000-0000-0000-000000000001'),
  'completed',
  'the booking status is untouched'
);
select is(
  (select count(*)::int from public.reviews where id = 'a8800000-0000-0000-0000-000000000001'),
  1,
  'the review still exists'
);
select is(
  (select traveler_name from public.reviews where id = 'a8800000-0000-0000-0000-000000000001'),
  'Former traveler',
  'the review author name is pseudonymized'
);
select is(
  (select rating from public.reviews where id = 'a8800000-0000-0000-0000-000000000001'),
  5,
  'the review rating is untouched'
);
select is(
  (select full_name from public.profiles where id = 'a8000000-0000-0000-0000-000000000001'),
  'Deleted user',
  'the profile full_name is scrubbed'
);
select is(
  (select deleted_at is not null from public.profiles where id = 'a8000000-0000-0000-0000-000000000001'),
  true,
  'profiles.deleted_at is set'
);
select is(
  (select count(*)::int from public.wishlists where user_id = 'a8000000-0000-0000-0000-000000000001'),
  0,
  'wishlists rows were deleted'
);
select is(
  (select full_name from public.booking_guests where id = 'a8700000-0000-0000-0000-000000000001'),
  'Deleted guest',
  'booking_guests PII on the deleted traveler''s booking is scrubbed'
);
select is(
  (select passport_number_encrypted from public.booking_guests where id = 'a8700000-0000-0000-0000-000000000001'),
  null,
  'booking_guests passport data is nulled'
);

-- ── Group 2: traveler with an upcoming confirmed booking is refused ───────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ select public.delete_my_account() $$,
  'P0001', 'ACTIVE_BOOKINGS',
  'traveler with an upcoming confirmed booking cannot delete their account'
);

reset role;

select is(
  (select deleted_at is null from public.profiles where id = 'a8000000-0000-0000-0000-000000000002'),
  true,
  'the refused traveler''s profile is untouched'
);

-- ── Group 3: sole agency owner is refused ──────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.delete_my_account() $$,
  'P0001', 'SOLE_AGENCY_OWNER',
  'the sole owner of an agency cannot delete their account'
);

reset role;

select is(
  (select removed_at is null from public.agency_users where agency_id = 'a8a00000-0000-0000-0000-000000000001' and user_id = 'a8000000-0000-0000-0000-000000000003'),
  true,
  'the refused owner''s agency_users row is untouched'
);

select * from finish();
rollback;
