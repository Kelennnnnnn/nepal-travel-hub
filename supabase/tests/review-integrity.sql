-- Tests for audit H3 fix (supabase/migrations/20260917000009_review_integrity.sql)
-- Run via: supabase test db supabase/tests/review-integrity.sql
begin;
create extension if not exists pgtap;

select plan(17);

-- ── Fixtures ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h3-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h3-manager@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h3-outsider@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h3-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

-- on_auth_user_created (auth.users trigger) already created a profiles row
-- for each user above — update it rather than insert.
update public.profiles set full_name = 'Real Traveler Name' where id = 'd3000000-0000-0000-0000-000000000001';

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values
  ('d3a00000-0000-0000-0000-000000000001', 'H3 Test Agency', 'H3 Test Agency', 'h3-test-agency', 'Kathmandu', 'Kathmandu'),
  ('d3a00000-0000-0000-0000-000000000002', 'H3 Rival Agency', 'H3 Rival Agency', 'h3-rival-agency', 'Pokhara', 'Kaski');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values
  ('d3a00000-0000-0000-0000-000000000001', 'approved', now(), now()),
  ('d3a00000-0000-0000-0000-000000000002', 'approved', now(), now());

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d3a00000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'manager', now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values
  ('d3100000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'h3-test-listing', 'H3 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published'),
  ('d3100000-0000-0000-0000-000000000002', 'd3a00000-0000-0000-0000-000000000002', 'h3-rival-listing', 'H3 Rival Listing', 'Another test listing with a long enough description for the schema check constraint here too.', 'Trekking', 'Pokhara', '5 days', 5, 400, 10, 'Easy', 'published');

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('d3200000-0000-0000-0000-000000000001', 'd3100000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', current_date - 10, 'scheduled');

insert into public.inventory (id, departure_id, capacity_total)
values ('d3300000-0000-0000-0000-000000000001', 'd3200000-0000-0000-0000-000000000001', 10);

insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at, confirmed_at)
values ('d3400000-0000-0000-0000-000000000001', 'd3300000-0000-0000-0000-000000000001', 1, 'confirmed', now() + interval '1 hour', now());

insert into public.booking_quotes (id, listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at)
values ('d3500000-0000-0000-0000-000000000001', 'd3100000-0000-0000-0000-000000000001', 'd3200000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 1, 500.00, 10.00, 50.00, 450.00, 'NPR', '{}'::jsonb, 'd3400000-0000-0000-0000-000000000001', 'consumed', now() + interval '1 hour');

-- Completed booking, eligible to review.
insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('d3600000-0000-0000-0000-000000000001', 'd3500000-0000-0000-0000-000000000001', 'd3100000-0000-0000-0000-000000000001', 'd3200000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 1, 'completed', 'paid');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: INSERT — agency_id/traveler_name/helpful_count are server-derived,
--    never the client value ─────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

insert into public.reviews (id, listing_id, agency_id, booking_id, traveler_id, rating, title, comment, traveler_name, helpful_count)
values (
  'd3700000-0000-0000-0000-000000000001',
  'd3100000-0000-0000-0000-000000000001',
  'd3a00000-0000-0000-0000-000000000002',  -- WRONG agency, deliberately, to prove it gets overridden
  'd3600000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  5, 'Great trip', 'This was a genuinely wonderful experience, highly recommended for anyone.',
  'Someone Else',    -- deliberately wrong, to prove it gets overridden
  999                -- deliberately wrong, to prove it gets overridden
);

reset role;

select is(
  (select agency_id::text from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  'd3a00000-0000-0000-0000-000000000001',
  'INSERT: agency_id is server-derived from the booking, not the client-supplied value'
);
select is(
  (select traveler_name from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  'Real Traveler Name',
  'INSERT: traveler_name is server-derived from profiles.full_name, not the client-supplied value'
);
select is(
  (select helpful_count from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  0,
  'INSERT: helpful_count is forced to 0 regardless of client-supplied value'
);

-- ── Group 2: UPDATE — listing_id/helpful_count (and everything else pinned)
--    are unchanged by the review's own author ─────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

update public.reviews
set listing_id = 'd3100000-0000-0000-0000-000000000002', helpful_count = 500, rating = 4
where id = 'd3700000-0000-0000-0000-000000000001';

reset role;

select is(
  (select listing_id::text from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  'd3100000-0000-0000-0000-000000000001',
  'UPDATE: traveler updating their review''s listing_id has no effect — pinned to OLD'
);
select is(
  (select helpful_count from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  0,
  'UPDATE: traveler updating their review''s helpful_count has no effect — pinned to OLD'
);
select is(
  (select rating from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  4,
  'UPDATE: rating (an allowed field) DID change, proving the trigger isn''t just blocking the whole statement'
);

-- ── Group 3: comment/title length enforcement ───────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select throws_ok(
  $$ update public.reviews set comment = 'too short' where id = 'd3700000-0000-0000-0000-000000000001' $$,
  'P0001', 'INVALID_COMMENT_LENGTH',
  'a 9-character comment (below the 10-char minimum) is rejected'
);

reset role;

-- ── Group 4: guard_listing_protected_fields — agency manager cannot set
--    rating directly ───────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

update public.listings set rating = 5, review_count = 999 where id = 'd3100000-0000-0000-0000-000000000001';

reset role;

select isnt(
  (select rating from public.listings where id = 'd3100000-0000-0000-0000-000000000001'),
  5.00,
  'agency manager: direct UPDATE of listings.rating has no effect — pinned to OLD'
);

-- ── Group 5: hiding a review recomputes the listing rating without it ─────

-- Insert a second, cheap review directly as admin (bypasses guard_review_
-- fields' derivation logic, which is fine — this is fixture setup) so the
-- listing has two reviews (5 and 4) before hiding one of them.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status)
values ('d3600000-0000-0000-0000-000000000002', 'd3500000-0000-0000-0000-000000000001', 'd3100000-0000-0000-0000-000000000001', 'd3200000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000003', 1, 'completed', 'paid');

insert into public.reviews (id, listing_id, agency_id, booking_id, traveler_id, rating, title, comment)
values ('d3700000-0000-0000-0000-000000000002', 'd3100000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'd3600000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000003', 3, 'Fine trip', 'It was a perfectly fine trip, nothing spectacular but nothing bad either.');

select is(
  (select review_count from public.listings where id = 'd3100000-0000-0000-0000-000000000001'),
  2,
  'after the second review, listing review_count is 2'
);
select is(
  (select rating from public.listings where id = 'd3100000-0000-0000-0000-000000000001'),
  3.50,
  'after the second review, listing rating is the average of both (4 and 3)'
);

update public.reviews set hidden_at = now() where id = 'd3700000-0000-0000-0000-000000000002';

select is(
  (select review_count from public.listings where id = 'd3100000-0000-0000-0000-000000000001'),
  1,
  'after hiding the second review, listing review_count drops back to 1'
);
select is(
  (select rating from public.listings where id = 'd3100000-0000-0000-0000-000000000001'),
  4.00,
  'after hiding the second review, listing rating recomputes to just the remaining review (4)'
);

select set_config('request.jwt.claims', '', true);

-- ── Group 6: review_votes visibility + self-vote + double-vote ────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

-- A real vote on someone ELSE's review (review 1 belongs to traveler
-- ...0001) succeeds — needed so the anon-visibility check below is
-- actually checking that a real row is hidden, not just an empty table.
insert into public.review_votes (review_id, user_id)
values ('d3700000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000003');

select throws_ok(
  format($$ insert into public.review_votes (review_id, user_id) values ('%s'::uuid, 'd3000000-0000-0000-0000-000000000003') $$, 'd3700000-0000-0000-0000-000000000002'),
  '42501', null,
  'a traveler cannot vote on their own review'
);

reset role;
-- auth.uid() reads the request.jwt.claims GUC directly, independent of the
-- Postgres role — `reset role` alone leaves the previous traveler's claims
-- in place for the rest of the transaction, which would make the "anon"
-- check below not actually anonymous. Clear it explicitly, matching a real
-- anon request (no sub claim at all).
select set_config('request.jwt.claims', '', true);

set local role anon;

select is(
  (select count(*)::int from public.review_votes),
  0,
  'anonymous select on review_votes returns 0 rows, despite a real vote existing'
);

reset role;

-- ── Group 7: respond_to_review — manager+ only, re-derived from the
--    review's real agency, not trusted from the caller ────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select lives_ok(
  $$ select public.respond_to_review('d3700000-0000-0000-0000-000000000001'::uuid, 'Thanks so much for the kind words!') $$,
  'manager of the review''s own agency: respond_to_review succeeds'
);

reset role;

select is(
  (select agency_response from public.reviews where id = 'd3700000-0000-0000-0000-000000000001'),
  'Thanks so much for the kind words!',
  'agency_response was actually written'
);

select set_config('request.jwt.claims', '', true);
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d3a00000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000003', 'manager', now());
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'agency'))::text, true);

select throws_ok(
  $$ select public.respond_to_review('d3700000-0000-0000-0000-000000000001'::uuid, 'I am not this review''s agency') $$,
  'P0001', 'INSUFFICIENT_PRIVILEGE',
  'a manager of a DIFFERENT agency cannot respond to this review'
);

reset role;

select * from finish();
rollback;
