-- Tests for the data-integrity rules added in
-- supabase/migrations/20260917000019_data_integrity.sql.
-- Run via: supabase test db supabase/tests/data-integrity.sql
begin;
create extension if not exists pgtap;

select plan(46);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('e5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e5-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('e5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e5-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('e5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e5-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('e5a00000-0000-0000-0000-000000000001', 'E5 Test Agency', 'E5 Test Agency', 'e5-test-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('e5a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('e5a00000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'owner', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', 'e5-test-listing', 'E5 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

select set_config('request.jwt.claims', '', true);

-- Claims helpers reused throughout — the manager (owner-level access) and
-- the admin fixture users above.
-- manager: json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))
-- admin:   json_build_object('sub', 'e5000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')

-- ── Group 1: currency — NPR-only on all four pricing-tier tables ──────────

select throws_ok(
  $$ update public.listings set currency = 'USD' where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'listings: currency other than NPR is rejected'
);

select lives_ok(
  $$ update public.listings set currency = 'NPR' where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'listings: currency = NPR is accepted'
);

select throws_ok(
  $$ insert into public.seasonal_pricing (listing_id, season_name, start_date, end_date, price, currency)
     values ('e5100000-0000-0000-0000-000000000001', 'Bad', current_date, current_date + 5, 100, 'USD') $$,
  '23514', null,
  'seasonal_pricing: currency other than NPR is rejected'
);

select throws_ok(
  $$ insert into public.price_overrides (listing_id, override_date, price, currency)
     values ('e5100000-0000-0000-0000-000000000001', current_date, 100, 'USD') $$,
  '23514', null,
  'price_overrides: currency other than NPR is rejected'
);

-- ── Group 2: seasonal pricing overlap exclusion ───────────────────────────

select lives_ok(
  $$ insert into public.seasonal_pricing (id, listing_id, season_name, start_date, end_date, price)
     values ('e5200000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Peak', '2027-03-01', '2027-03-31', 800) $$,
  'seasonal_pricing: first season for a listing is accepted'
);

select throws_ok(
  $$ insert into public.seasonal_pricing (listing_id, season_name, start_date, end_date, price)
     values ('e5100000-0000-0000-0000-000000000001', 'Overlapping', '2027-03-15', '2027-04-10', 900) $$,
  '23P01', null,
  'seasonal_pricing: an overlapping date range for the SAME listing is rejected (exclusion violation)'
);

select lives_ok(
  $$ insert into public.seasonal_pricing (listing_id, season_name, start_date, end_date, price)
     values ('e5100000-0000-0000-0000-000000000001', 'Adjacent', '2027-04-01', '2027-04-30', 700) $$,
  'seasonal_pricing: a non-overlapping (adjacent) date range for the same listing is accepted'
);

-- ── Group 3: price_overrides uniqueness + override_date rule ──────────────

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('e5300000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 30, 'scheduled');

select lives_ok(
  $$ insert into public.price_overrides (id, listing_id, departure_id, price)
     values ('e5400000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 600) $$,
  'price_overrides: first override for a departure is accepted'
);

select throws_ok(
  $$ insert into public.price_overrides (listing_id, departure_id, price)
     values ('e5100000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 650) $$,
  '23505', null,
  'price_overrides: a second override for the SAME departure is rejected (unique index)'
);

select lives_ok(
  $$ insert into public.price_overrides (id, listing_id, override_date, price)
     values ('e5400000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000001', current_date + 5, 650) $$,
  'price_overrides: first date-level override for a listing/date is accepted'
);

select throws_ok(
  $$ insert into public.price_overrides (listing_id, override_date, price)
     values ('e5100000-0000-0000-0000-000000000001', current_date + 5, 700) $$,
  '23505', null,
  'price_overrides: a second override for the SAME (listing, date) is rejected (unique index)'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.price_overrides (listing_id, override_date, price)
     values ('e5100000-0000-0000-0000-000000000001', current_date - 1, 700) $$,
  'P0001', 'OVERRIDE_DATE_IN_PAST: override_date must be today or later',
  'price_overrides: a non-admin cannot insert a past override_date'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ insert into public.price_overrides (listing_id, override_date, price)
     values ('e5100000-0000-0000-0000-000000000001', current_date - 1, 700) $$,
  'price_overrides: an admin CAN insert a past override_date'
);

select set_config('request.jwt.claims', '', true);

-- ── Group 4: departures — past-date rejection (non-admin vs admin) and
--    the cutoff_at <= departure_date+1 constraint ─────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, status)
     values ('e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date - 1, 'scheduled') $$,
  'P0001', 'DEPARTURE_DATE_IN_PAST: departure_date cannot be in the past',
  'departures: a non-admin cannot create a departure dated in the past'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ insert into public.departures (id, listing_id, agency_id, departure_date, status)
     values ('e5300000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date - 1, 'scheduled') $$,
  'departures: an admin CAN create a departure dated in the past'
);

select throws_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, cutoff_at, status)
     values ('e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 10, (current_date + 12)::timestamptz, 'scheduled') $$,
  '23514', null,
  'departures: cutoff_at more than 1 day after departure_date is rejected'
);

select lives_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, cutoff_at, status)
     values ('e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 10, (current_date + 11)::timestamptz, 'scheduled') $$,
  'departures: cutoff_at exactly departure_date+1 is accepted'
);

select set_config('request.jwt.claims', '', true);

-- ── Group 5: capacity vs. listing max (max_participants = 10) and the
--    cancelled/past departure guard, in set_departure_capacity() ──────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.set_departure_capacity('e5300000-0000-0000-0000-000000000001', 11) $$,
  'P0001', 'CAPACITY_ABOVE_LISTING_MAX: capacity_total (11) exceeds this listing''s max_participants (10)',
  'set_departure_capacity: a manager cannot set capacity above the listing''s max_participants'
);

select lives_ok(
  $$ select public.set_departure_capacity('e5300000-0000-0000-0000-000000000001', 10) $$,
  'set_departure_capacity: a manager CAN set capacity at exactly max_participants'
);

reset role;

-- set_departure_capacity's has_agency_access() gate is unconditional (the
-- is_admin() exception below only ever bypasses the max_participants
-- comparison, never "must be a manager of this agency" at all) — so
-- testing the bypass needs a caller who is BOTH this agency's manager AND
-- a platform admin, not an unrelated admin account. is_admin() itself does
-- a LIVE lookup against auth.users.raw_app_meta_data (audit H1's fresh-
-- role-lookup fix), so the owner's own row is promoted here rather than
-- relying on the JWT claims' (unverified) app_metadata.
update auth.users set raw_app_meta_data = '{"role": "admin"}'::jsonb where id = 'e5000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

select lives_ok(
  $$ select public.set_departure_capacity('e5300000-0000-0000-0000-000000000001', 11) $$,
  'set_departure_capacity: an admin (who is also this agency''s manager) CAN set capacity above the listing''s max_participants'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Revert the owner back to a plain agency role — the promotion above was
-- only to exercise the admin-bypass case; the remaining tests in this
-- group are about the UNCONDITIONAL cancelled/past-departure guard, which
-- doesn't care either way, but keeping the fixture's roles honest avoids
-- confusing a future reader of this file.
update auth.users set raw_app_meta_data = '{"role": "agency"}'::jsonb where id = 'e5000000-0000-0000-0000-000000000001';

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('e5300000-0000-0000-0000-000000000003', 'e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 32, 'cancelled');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.set_departure_capacity('e5300000-0000-0000-0000-000000000003', 5) $$,
  'P0001', 'DEPARTURE_NOT_MODIFIABLE: cannot set capacity on a cancelled or past departure',
  'set_departure_capacity: refuses to touch capacity on a cancelled departure'
);

select throws_ok(
  $$ select public.set_departure_capacity('e5300000-0000-0000-0000-000000000002', 5) $$,
  'P0001', 'DEPARTURE_NOT_MODIFIABLE: cannot set capacity on a cancelled or past departure',
  'set_departure_capacity: refuses to touch capacity on a past departure'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ── Group 6: blackout dates vs. departures, both directions ───────────────

insert into public.blackout_dates (id, listing_id, blackout_date)
values ('e5500000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', current_date + 60);

select throws_ok(
  $$ insert into public.departures (listing_id, agency_id, departure_date, status)
     values ('e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 60, 'scheduled') $$,
  'P0001', 'DEPARTURE_ON_BLACKOUT_DATE: ' || (current_date + 60)::text || ' is a blackout date for this listing',
  'departures: creating a departure on an existing blackout date is rejected'
);

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('e5300000-0000-0000-0000-000000000004', 'e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 61, 'scheduled');

select throws_ok(
  $$ insert into public.blackout_dates (listing_id, blackout_date)
     values ('e5100000-0000-0000-0000-000000000001', current_date + 61) $$,
  'P0001', 'BLACKOUT_CONFLICTS_WITH_DEPARTURE: a scheduled departure already exists on ' || (current_date + 61)::text,
  'blackout_dates: creating a blackout on a date with a scheduled departure is rejected'
);

update public.departures set status = 'cancelled' where id = 'e5300000-0000-0000-0000-000000000004';

select lives_ok(
  $$ insert into public.blackout_dates (listing_id, blackout_date)
     values ('e5100000-0000-0000-0000-000000000001', current_date + 61) $$,
  'blackout_dates: a CANCELLED departure does not block a blackout on the same date'
);

-- ── Group 7: listings text/array limits ────────────────────────────────────

select throws_ok(
  $$ update public.listings set title = 'Hi' where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: title shorter than 5 chars is rejected'
);
select throws_ok(
  $$ update public.listings set title = repeat('x', 151) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: title longer than 150 chars is rejected'
);
select throws_ok(
  $$ update public.listings set description = repeat('x', 20001) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: description longer than 20000 chars is rejected'
);
select throws_ok(
  $$ update public.listings set location = repeat('x', 151) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: location longer than 150 chars is rejected'
);
select throws_ok(
  $$ update public.listings set duration_label = repeat('x', 51) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: duration_label longer than 50 chars is rejected'
);
select throws_ok(
  $$ update public.listings set includes = array(select 'item' || n from generate_series(1, 51) n) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: includes with more than 50 items is rejected'
);
select throws_ok(
  $$ update public.listings set images = '{"not": "an array"}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: images must be a jsonb array, not an object'
);
select throws_ok(
  $$ update public.listings set itinerary = '{"not": "an array"}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'listings: itinerary must be a jsonb array, not an object'
);
select lives_ok(
  $$ update public.listings set title = 'A Perfectly Valid Title', images = '[]'::jsonb, itinerary = '[]'::jsonb, includes = array['Guide', 'Meals'] where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'listings: valid title/images/itinerary/includes values are accepted'
);

-- ── Group 8: cancellation_policy validation ────────────────────────────────

select throws_ok(
  $$ update public.listings set cancellation_policy = '[1,2,3]'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: must be a JSON object',
  'cancellation_policy: a non-object value is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": "not-an-array"}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: "tiers" must be an array',
  'cancellation_policy: a non-array "tiers" is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = jsonb_build_object('tiers', (select jsonb_agg(jsonb_build_object('days', n, 'refund_percent', 50)) from generate_series(1, 11) n)) where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: at most 10 tiers are allowed',
  'cancellation_policy: more than 10 tiers is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": [{"days": "seven", "refund_percent": 100}]}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: tier 1 must be an object with numeric "days" and "refund_percent"',
  'cancellation_policy: a non-numeric "days" is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": [{"days": -1, "refund_percent": 100}]}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: tier 1 "days" must be a non-negative integer',
  'cancellation_policy: a negative "days" is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": [{"days": 7, "refund_percent": 150}]}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: tier 1 "refund_percent" must be between 0 and 100',
  'cancellation_policy: a refund_percent above 100 is rejected'
);
select throws_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": [{"days": 3, "refund_percent": 50}, {"days": 7, "refund_percent": 100}]}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_CANCELLATION_POLICY: tier "days" values must be strictly descending (tier 2 is not less than the previous tier)',
  'cancellation_policy: non-descending "days" values are rejected'
);
select lives_ok(
  $$ update public.listings set cancellation_policy = '{"tiers": [{"days": 7, "refund_percent": 100}, {"days": 3, "refund_percent": 50}, {"days": 0, "refund_percent": 0}]}'::jsonb where id = 'e5100000-0000-0000-0000-000000000001' $$,
  'cancellation_policy: a well-formed policy is accepted'
);

-- ── Group 9: fee arithmetic + reservation_fee_percent setting ─────────────

-- A dedicated departure for this group — e5300000...0001 already picked up
-- an inventory row from Group 5's set_departure_capacity() calls.
insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('e5300000-0000-0000-0000-000000000005', 'e5100000-0000-0000-0000-000000000001', 'e5a00000-0000-0000-0000-000000000001', current_date + 40, 'scheduled');
insert into public.inventory (id, departure_id, capacity_total) values
  ('e5600000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000005', 10);
insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at, confirmed_at) values
  ('e5700000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 1, 'confirmed', now() + interval '1 hour', now());

select throws_ok(
  $$ insert into public.booking_quotes (listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at)
     values ('e5100000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000005', 'e5a00000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 1, 1000.00, 15.00, 150.00, 850.00, 'USD', '{}'::jsonb, 'e5700000-0000-0000-0000-000000000001', 'active', now() + interval '1 hour') $$,
  '23514', null,
  'booking_quotes: currency other than NPR is rejected'
);

select throws_ok(
  $$ insert into public.booking_quotes (listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at)
     values ('e5100000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000005', 'e5a00000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 1, 1000.00, 15.00, 100.00, 900.00, 'NPR', '{}'::jsonb, 'e5700000-0000-0000-0000-000000000001', 'active', now() + interval '1 hour') $$,
  '23514', null,
  'booking_quotes: platform_fee not matching round(product_value * platform_fee_percent / 100, 2) is rejected'
);

select lives_ok(
  $$ insert into public.booking_quotes (listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at)
     values ('e5100000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000005', 'e5a00000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 1, 1000.00, 15.00, 150.00, 850.00, 'NPR', '{}'::jsonb, 'e5700000-0000-0000-0000-000000000001', 'active', now() + interval '1 hour') $$,
  'booking_quotes: platform_fee correctly matching the percentage is accepted'
);

select is(
  (select value::text from public.platform_settings where key = 'reservation_fee_percent'),
  '15',
  'platform_settings has a reservation_fee_percent key set to 15'
);

select * from finish();
rollback;
