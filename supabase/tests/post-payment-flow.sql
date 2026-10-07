-- Acceptance tests for the post-payment flow
-- (supabase/migrations/20260920000001_post_payment_flow.sql).
-- mark_reservation_fee_paid is called directly as service_role throughout,
-- simulating the future webhook — it is never exposed to the UI. Booking
-- ids are captured into psql variables (\gset), not temp tables, so they
-- stay readable across the role switches these tests need (a temp table
-- is only visible to the role that created it plus superuser).
-- Run via: supabase test db supabase/tests/post-payment-flow.sql
begin;
create extension if not exists pgtap;

select plan(30);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ppf-traveler1@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ppf-traveler2@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ppf-manager@test.com',   '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ppf-staff@test.com',     '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values
  ('c2a00000-0000-0000-0000-000000000001', 'Post Payment Agency A', 'Post Payment Agency A', 'ppf-agency-a', 'Kathmandu', 'Kathmandu'),
  ('c2a00000-0000-0000-0000-000000000002', 'Post Payment Agency B', 'Post Payment Agency B', 'ppf-agency-b', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values
  ('c2a00000-0000-0000-0000-000000000001', 'approved', now(), now()),
  ('c2a00000-0000-0000-0000-000000000002', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('c2a00000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003', 'manager', now()),
  ('c2a00000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000004', 'staff', now());

-- Instant (1-day Cultural) listing.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('c2100000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001', 'ppf-instant', 'PPF Instant Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');

-- Agency-confirm (Trekking) listing.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('c2100000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001', 'ppf-agency-confirm', 'PPF Agency Confirm Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 20000, 10, 'Easy', 'published');

-- A similar listing from AGENCY B, for suggest_alternatives to find.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, rating, review_count)
values ('c2100000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002', 'ppf-alternative', 'PPF Alternative Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 20000, 10, 'Easy', 'published', 4.5, 10);

select set_config('request.jwt.claims', '', true);

-- ── 1. Instant: fee paid -> confirmed; replay -> unchanged, one event ────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold1 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'Instant Traveler', 'contact_email', 'instant@test.com', 'contact_phone', '+9779800000')
) \gset
reset role;

set local role service_role;
select is(
  public.mark_reservation_fee_paid(:'hold1'::uuid, 'test_provider', 'ref-instant-1', 1500.00, 'NPR'),
  'confirmed',
  'instant listing: fee paid moves the booking straight to confirmed'
);
select is(
  public.mark_reservation_fee_paid(:'hold1'::uuid, 'test_provider', 'ref-instant-1', 1500.00, 'NPR'),
  'confirmed',
  'replaying the same provider_ref returns the same status unchanged'
);
reset role;

select is((select booking_status from public.bookings where id = :'hold1'::uuid), 'confirmed', 'booking_status is confirmed');
select is((select payment_status from public.bookings where id = :'hold1'::uuid), 'paid', 'payment_status is paid');
select is((select count(*)::int from public.payment_events where booking_id = :'hold1'::uuid), 1, 'exactly one payment_events row exists despite the replay');

-- ── 2. agency_confirm: fee paid -> awaiting_agency_confirmation +24h ─────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold2 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000002'::uuid, current_date + 20, 1,
  jsonb_build_object('full_name', 'Confirm Traveler', 'contact_email', 'confirm@test.com', 'contact_phone', '+9779800001')
) \gset
reset role;

set local role service_role;
select is(
  public.mark_reservation_fee_paid(:'hold2'::uuid, 'test_provider', 'ref-confirm-1', 3000.00, 'NPR'),
  'awaiting_agency_confirmation',
  'agency_confirm listing: fee paid moves to awaiting_agency_confirmation'
);
reset role;

select ok(
  (select agency_confirm_deadline - created_at < interval '24 hours 1 minute' and agency_confirm_deadline - created_at > interval '23 hours 59 minutes' from public.bookings where id = :'hold2'::uuid),
  'agency_confirm_deadline is ~24 hours out'
);

-- Staff (not manager) cannot accept/decline.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.agency_respond_to_booking('%s'::uuid, true, null) $f$, :'hold2'),
  '42501', 'INSUFFICIENT_PRIVILEGE',
  'agency staff (not manager) cannot respond to a booking'
);
reset role;

-- Manager accepts.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.agency_respond_to_booking('%s'::uuid, true, null) $f$, :'hold2'),
  'manager can accept an awaiting_agency_confirmation booking'
);
reset role;
select is((select booking_status from public.bookings where id = :'hold2'::uuid), 'confirmed', 'booking is now confirmed after manager accept');

-- ── 3. Decline -> cancelled, full refund record, alternatives ───────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold3 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000002'::uuid, current_date + 21, 1,
  jsonb_build_object('full_name', 'Decline Traveler', 'contact_email', 'decline@test.com', 'contact_phone', '+9779800002')
) \gset
reset role;

set local role service_role;
select public.mark_reservation_fee_paid(:'hold3'::uuid, 'test_provider', 'ref-decline-1', 3000.00, 'NPR');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.agency_respond_to_booking('%s'::uuid, false, 'too short') $f$, :'hold3'),
  'P0001', null,
  'a decline reason under 10 characters is rejected'
);
select lives_ok(
  format($f$ select public.agency_respond_to_booking('%s'::uuid, false, 'Sorry, our guide is unavailable that week.') $f$, :'hold3'),
  'manager can decline with a valid reason'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select ok(
  (select count(*)::int from public.suggest_alternatives(:'hold3'::uuid) where listing_id = 'c2100000-0000-0000-0000-000000000003'::uuid) = 1,
  'suggest_alternatives finds the similar listing from the other agency'
);
reset role;

select is((select booking_status from public.bookings where id = :'hold3'::uuid), 'cancelled', 'declined booking is cancelled');
select is((select cancelled_by from public.bookings where id = :'hold3'::uuid), 'agency', 'cancelled_by is agency');
select is(
  (select status from public.refund_records where booking_id = :'hold3'::uuid),
  'pending_provider',
  'a pending_provider refund record exists'
);
select is(
  (select amount from public.refund_records where booking_id = :'hold3'::uuid),
  3000.00,
  'the refund record is for the full reservation fee'
);

-- ── 4. One-tap token: works once, reuse fails, expired fails ────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold4 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000002'::uuid, current_date + 22, 1,
  jsonb_build_object('full_name', 'Token Traveler', 'contact_email', 'token@test.com', 'contact_phone', '+9779800003')
) \gset
reset role;

set local role service_role;
select public.mark_reservation_fee_paid(:'hold4'::uuid, 'test_provider', 'ref-token-1', 3000.00, 'NPR');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
insert into public.booking_action_tokens (id, booking_id, token_hash, purpose, expires_at)
values
  ('c2900000-0000-0000-0000-000000000001', :'hold4'::uuid, encode(digest('ppf-valid-token', 'sha256'), 'hex'), 'agency_accept_decline', now() + interval '1 day'),
  ('c2900000-0000-0000-0000-000000000002', :'hold4'::uuid, encode(digest('ppf-expired-token', 'sha256'), 'hex'), 'agency_accept_decline', now() - interval '1 minute');
select set_config('request.jwt.claims', '', true);

set local role anon;
select lives_ok(
  $$ select public.respond_via_token('ppf-valid-token', true, null) $$,
  'accepting via a valid token works, as anon'
);
select throws_ok(
  $$ select public.respond_via_token('ppf-valid-token', true, null) $$,
  'P0001', null,
  'reusing an already-used token fails'
);
select throws_ok(
  $$ select public.respond_via_token('ppf-expired-token', true, null) $$,
  'P0001', null,
  'an expired token fails'
);
reset role;

select is((select booking_status from public.bookings where id = :'hold4'::uuid), 'confirmed', 'token-accepted booking is confirmed');

-- ── 5. Amount mismatch -> not confirmed, event recorded ─────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold5 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 1,
  jsonb_build_object('full_name', 'Mismatch Traveler', 'contact_email', 'mismatch@test.com', 'contact_phone', '+9779800004')
) \gset
reset role;

set local role service_role;
select is(
  public.mark_reservation_fee_paid(:'hold5'::uuid, 'test_provider', 'ref-mismatch-1', 999.00, 'NPR'),
  'pending_payment',
  'an amount mismatch leaves the booking unconfirmed, status unchanged'
);
reset role;
select is((select count(*)::int from public.payment_events where booking_id = :'hold5'::uuid), 1, 'the mismatched payment event was still recorded');
select is((select payment_status from public.bookings where id = :'hold5'::uuid), 'unpaid', 'payment_status is untouched by a mismatched amount');

-- ── 6. Traveler and agency cannot call mark_reservation_fee_paid ────────

select ok(
  not has_function_privilege('authenticated', 'public.mark_reservation_fee_paid(uuid, text, text, numeric, text)', 'EXECUTE'),
  'authenticated (traveler or agency) has no EXECUTE grant on mark_reservation_fee_paid'
);
select ok(
  not has_function_privilege('anon', 'public.mark_reservation_fee_paid(uuid, text, text, numeric, text)', 'EXECUTE'),
  'anon has no EXECUTE grant on mark_reservation_fee_paid'
);

-- ── 7. Deadline timeout sweep: strike recorded, reminder fires once ─────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as hold6 from public.create_booking_hold(
  'c2100000-0000-0000-0000-000000000002'::uuid, current_date + 23, 1,
  jsonb_build_object('full_name', 'Timeout Traveler', 'contact_email', 'timeout@test.com', 'contact_phone', '+9779800005')
) \gset
reset role;

set local role service_role;
select public.mark_reservation_fee_paid(:'hold6'::uuid, 'test_provider', 'ref-timeout-1', 3000.00, 'NPR');
reset role;

-- Move the deadline into the reminder window first.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
update public.bookings set agency_confirm_deadline = now() + interval '11 hours' where id = :'hold6'::uuid;
select set_config('request.jwt.claims', '', true);

select public.expire_agency_confirmations();
select isnt((select agency_reminder_sent_at from public.bookings where id = :'hold6'::uuid), null, 'a reminder was sent once the deadline is within 12 hours');
select is((select public.expire_agency_confirmations()), 0, 'running the sweep again sends no second reminder (0 timeouts, dedup holds)');

-- Now push the deadline into the past and sweep again -> timeout + strike.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
update public.bookings set agency_confirm_deadline = now() - interval '1 minute' where id = :'hold6'::uuid;
select set_config('request.jwt.claims', '', true);

select public.expire_agency_confirmations();
select is((select booking_status from public.bookings where id = :'hold6'::uuid), 'cancelled', 'a booking past its deadline is cancelled by the sweep');
select is(
  (select count(*)::int from public.agency_strikes where booking_id = :'hold6'::uuid and kind = 'no_response'),
  1,
  'a no_response strike was recorded for the agency'
);

select * from finish();
rollback;
