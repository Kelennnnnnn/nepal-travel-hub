-- ============================================================================
-- Canonical fixture dataset for the supabase/tests/security/ regression
-- suite. This file is the single source of truth for the fixture roster —
-- read it to understand the roles/rows every generated and hand-written
-- security test exercises. It is NOT \i-included by other test files
-- (psql's \i path resolution is not reliably portable between a local
-- `supabase test db` run and CI, and every other test file in this repo
-- is already self-contained) — instead, scripts/generate-security-tests.ts
-- embeds this exact block into every generated/*.sql file it produces, and
-- every hand-written exploits/*.sql file pastes this same block verbatim.
-- If you change a fixture here, regenerate (`npm run test:db`) and update
-- every exploits/*.sql file's copy to match.
--
-- Runnable standalone for manual exploration:
--   supabase test db supabase/tests/security/fixtures.sql
-- (wrapped in begin/rollback below, so running it directly is a no-op against
-- the real database — it only proves the fixture itself is valid.)
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(1);

-- Fixture rows are inserted as "admin" (aal2) so triggers like
-- guard_listing_status_transition() that only allow certain direct
-- writes for admin (e.g. inserting a listing already at status=
-- 'published') don't block fixture setup — matches the established
-- convention in every other supabase/tests/*.sql file in this repo.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

-- ── Agencies ─────────────────────────────────────────────────────────────
-- A and B are both approved+active, independent of each other ("foreign"
-- to one another — any A-owned-resource test must deny B's members and
-- vice versa). S is suspended (agency_verification.status='suspended'),
-- used for H5's "suspended agency" assertions and as the "public visibility
-- must disappear on suspension" case throughout the table matrix.
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values
  ('5ec00000-0000-0000-0000-00000000000a', 'Security Suite Agency A', 'Agency A', 'sec-agency-a', 'Kathmandu', 'Kathmandu'),
  ('5ec00000-0000-0000-0000-00000000000b', 'Security Suite Agency B', 'Agency B', 'sec-agency-b', 'Pokhara', 'Kaski'),
  ('5ec00000-0000-0000-0000-00000000000c', 'Security Suite Agency S', 'Agency S (suspended)', 'sec-agency-s', 'Chitwan', 'Chitwan');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values
  ('5ec00000-0000-0000-0000-00000000000a', 'approved', now(), now()),
  ('5ec00000-0000-0000-0000-00000000000b', 'approved', now(), now()),
  ('5ec00000-0000-0000-0000-00000000000c', 'suspended', now(), now());

-- ── Users ────────────────────────────────────────────────────────────────
-- anon has no row at all (tested via `set local role anon;` with empty
-- jwt claims). Every other persona below is a real auth.users row — H1's
-- fix means current_platform_role() reads auth.users.raw_app_meta_data
-- LIVE, not the fake JWT's app_metadata claim, so THIS column (not the
-- set_config'd JWT) is what actually drives role-gated RLS in every test.
-- The fake JWT (set per-test via set_config) only needs to supply 'sub'
-- (for auth.uid()) and 'aal' (is_authenticated_aal2() does still read the
-- JWT for that — deliberately, per H1's own comment).
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('5ec10000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-t1@test.com',         '{"role": "traveler"}'::jsonb,    '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec10000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-t2@test.com',         '{"role": "traveler"}'::jsonb,    '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec20000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-owner-a@test.com',    '{"role": "agency"}'::jsonb,      '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec20000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-manager-a@test.com',  '{"role": "agency"}'::jsonb,      '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec20000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-staff-a@test.com',    '{"role": "agency"}'::jsonb,      '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec20000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-owner-b@test.com',    '{"role": "agency"}'::jsonb,      '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec20000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-owner-s@test.com',    '{"role": "agency"}'::jsonb,      '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec30000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-admin@test.com',      '{"role": "admin"}'::jsonb,       '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec30000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-admin-aal1@test.com', '{"role": "admin"}'::jsonb,       '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec30000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-superadmin@test.com', '{"role": "super_admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec30000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-support@test.com',    '{"role": "support"}'::jsonb,     '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('5ec30000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-finance@test.com',    '{"role": "finance"}'::jsonb,     '{}'::jsonb, false, now(), now(), '', '', '', '');

-- profiles rows are auto-created by the on_auth_user_created trigger
-- (handle_new_user()) — do not insert into public.profiles here.

-- ── Agency membership (agency_users) ────────────────────────────────────
-- accepted_at is set for every row below (M1: an unaccepted invitation
-- grants no access at all — these are all "already a real member" fixtures;
-- M1_uninvited_user_has_no_access exercises the unaccepted case separately).
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('5ec00000-0000-0000-0000-00000000000a', '5ec20000-0000-0000-0000-000000000001', 'owner',   now()),
  ('5ec00000-0000-0000-0000-00000000000a', '5ec20000-0000-0000-0000-000000000002', 'manager', now()),
  ('5ec00000-0000-0000-0000-00000000000a', '5ec20000-0000-0000-0000-000000000003', 'staff',   now()),
  ('5ec00000-0000-0000-0000-00000000000b', '5ec20000-0000-0000-0000-000000000004', 'owner',   now()),
  ('5ec00000-0000-0000-0000-00000000000c', '5ec20000-0000-0000-0000-000000000005', 'owner',   now());

-- ── Listings / departures / inventory (Agency A, published) ────────────
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('5ec40000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', 'sec-listing-a', 'Security Suite Test Listing A', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('5ec40000-0000-0000-0000-000000000002', '5ec00000-0000-0000-0000-00000000000b', 'sec-listing-b', 'Security Suite Test Listing B', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Pokhara', '5 days', 5, 400, 10, 'Easy', 'published');

insert into public.departures (id, listing_id, agency_id, departure_date, status)
values ('5ec50000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', current_date + 30, 'scheduled');

insert into public.inventory (id, departure_id, capacity_total)
values ('5ec60000-0000-0000-0000-000000000001', '5ec50000-0000-0000-0000-000000000001', 10);

insert into public.inventory_reservations (id, inventory_id, quantity, status, expires_at, confirmed_at)
values ('5ec70000-0000-0000-0000-000000000001', '5ec60000-0000-0000-0000-000000000001', 2, 'confirmed', now() + interval '1 hour', now());

-- ── Booking chain (T1 books Listing A, already completed+paid) ─────────
insert into public.booking_quotes (id, listing_id, departure_id, agency_id, traveler_id, participant_count, product_value, platform_fee_percent, platform_fee, agency_balance, currency, cancellation_policy_snapshot, inventory_reservation_id, status, expires_at, confirmation_mode, payment_requirement, amount_due_now, start_at, end_at, no_show_grace_minutes, fee_refund_rule)
values ('5ec80000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', '5ec50000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-000000000001', 2, 1000.00, 10.00, 100.00, 900.00, 'NPR', '{}'::jsonb, '5ec70000-0000-0000-0000-000000000001', 'consumed', now() + interval '1 hour', 'instant', 'fee_only', 100.00, now() + interval '30 days', now() + interval '31 days', 30, '{"free_cancel_hours": 24}'::jsonb);

insert into public.bookings (id, quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count, booking_status, payment_status, completed_at)
values ('5ec90000-0000-0000-0000-000000000001', '5ec80000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', '5ec50000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-000000000001', 2, 'completed', 'paid', now());

insert into public.booking_guests (id, booking_id, full_name)
values ('5eca0000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'Test Guest');

insert into public.booking_items (id, booking_id, description, unit_price, quantity, line_total)
values ('5ecb0000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'Trek package', 500.00, 2, 1000.00);

insert into public.quote_items (id, quote_id, item_type, description, unit_price, quantity, line_total)
values ('5ecc0000-0000-0000-0000-000000000001', '5ec80000-0000-0000-0000-000000000001', 'base_product', 'Trek package', 500.00, 2, 1000.00);

insert into public.booking_status_history (id, booking_id, event_type, metadata)
values ('5ecd0000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'completed', '{}'::jsonb);

-- ── Review (T1's completed booking is review-eligible) ──────────────────
insert into public.reviews (id, listing_id, agency_id, booking_id, traveler_id, rating, comment)
values ('5ece0000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec90000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 5, 'Great trip, fixture review.');

insert into public.review_votes (id, review_id, user_id, vote)
values ('5ecf0000-0000-0000-0000-000000000001', '5ece0000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000002', 'helpful');

insert into public.review_photos (id, review_id, storage_path, mime_type, size_bytes)
values ('5ed00000-0000-0000-0000-000000000001', '5ece0000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a/review.jpg', 'image/jpeg', 1024);

-- ── Messaging (T1 <-> Agency A conversation) ────────────────────────────
insert into public.conversations (id, agency_id, listing_id, traveler_id, subject)
values ('5ed10000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec40000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 'Fixture conversation');

insert into public.conversation_participants (id, conversation_id, user_id, participant_role)
values
  ('5ed20000-0000-0000-0000-000000000001', '5ed10000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 'traveler'),
  ('5ed20000-0000-0000-0000-000000000002', '5ed10000-0000-0000-0000-000000000001', '5ec20000-0000-0000-0000-000000000002', 'agency');

insert into public.messages (id, conversation_id, sender_id, content)
values ('5ed30000-0000-0000-0000-000000000001', '5ed10000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 'Fixture message');

insert into public.message_attachments (id, message_id, storage_path, mime_type, size_bytes)
values ('5ed40000-0000-0000-0000-000000000001', '5ed30000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a/attachment.pdf', 'application/pdf', 2048);

-- ── Misc per-table fixtures not covered by the chains above ─────────────
insert into public.agency_documents (id, agency_id, document_type, storage_path, mime_type, size_bytes, status)
values ('5ed50000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', 'business_registration', '5ec00000-0000-0000-0000-00000000000a/doc.pdf', 'application/pdf', 4096, 'approved');

insert into public.agency_invitations (id, agency_id, email, agency_role, token_hash, invited_by)
values ('5ed60000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', 'invitee@test.com', 'staff', 'fixture-token-hash', '5ec20000-0000-0000-0000-000000000001');

insert into public.agency_status_history (id, agency_id, from_status, to_status, changed_by, reason)
values ('5ed70000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000c', 'approved', 'suspended', '5ec30000-0000-0000-0000-000000000001', 'fixture suspension');

insert into public.blackout_dates (id, listing_id, blackout_date, reason)
values ('5ed80000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', current_date + 60, 'fixture blackout');

insert into public.listing_images (id, listing_id, storage_path, mime_type, size_bytes, sort_order)
values ('5ed90000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a/listing.jpg', 'image/jpeg', 8192, 0);

insert into public.price_overrides (id, listing_id, override_date, price)
values ('5eda0000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', current_date + 45, 600.00);

insert into public.seasonal_pricing (id, listing_id, season_name, start_date, end_date, price)
values ('5edb0000-0000-0000-0000-000000000001', '5ec40000-0000-0000-0000-000000000001', 'Fixture Season', current_date + 90, current_date + 120, 650.00);

insert into public.notification_preferences (user_id)
values ('5ec10000-0000-0000-0000-000000000001');

insert into public.domain_events (id, event_type, aggregate_type, aggregate_id, payload)
values ('5edc0000-0000-0000-0000-000000000001', 'booking.completed', 'booking', '5ec90000-0000-0000-0000-000000000001', '{}'::jsonb);

insert into public.notifications (id, domain_event_id, recipient_id, channel, status, idempotency_key)
values ('5edd0000-0000-0000-0000-000000000001', '5edc0000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 'in_app', 'sent', 'fixture-notif-1');

insert into public.wishlists (id, user_id, listing_id)
values ('5ede0000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000002', '5ec40000-0000-0000-0000-000000000001');

insert into public.contact_submissions (id, name, email, subject, message)
values ('5edf0000-0000-0000-0000-000000000001', 'Fixture Contact', 'contact@test.com', 'Fixture subject', 'Fixture message body');

insert into public.audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
values ('5ee00000-0000-0000-0000-000000000001', '5ec30000-0000-0000-0000-000000000001', 'fixture_action', 'listing', '5ec40000-0000-0000-0000-000000000001', null, '{}'::jsonb);

insert into public.platform_settings (key, value, description, value_type)
values ('sec_fixture_setting', '"fixture"'::jsonb, 'fixture-only setting, not read by the app', 'string')
on conflict (key) do nothing;

insert into public.platform_settings_history (id, key, old_value, new_value, changed_by)
values ('5ee10000-0000-0000-0000-000000000001', 'sec_fixture_setting', '"old"'::jsonb, '"fixture"'::jsonb, '5ec30000-0000-0000-0000-000000000001');

insert into public.idempotency_keys (key, user_id, fn, response, status)
values ('fixture-idem-key', '5ec10000-0000-0000-0000-000000000001', 'fixture_fn', '{}'::jsonb, 200);

insert into public.rate_limits (bucket, window_start, count)
values ('fixture-bucket', now(), 1);

insert into public.welcome_emails (user_id)
values ('5ec10000-0000-0000-0000-000000000001');

insert into public.payment_events (id, booking_id, provider, provider_ref, kind, amount, currency)
values ('5ee40000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'fixture_provider', 'fixture-ref-1', 'reservation_fee', 100.00, 'NPR');

insert into public.refund_records (id, booking_id, kind, payer_side, amount, currency, reason_code)
values ('5ee50000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'reservation_fee', 'platform', 100.00, 'NPR', 'fixture_reason');

insert into public.agency_strikes (id, agency_id, booking_id, kind)
values ('5ee60000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec90000-0000-0000-0000-000000000001', 'no_response');

insert into public.booking_action_tokens (id, booking_id, token_hash, purpose, expires_at)
values ('5ee70000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'fixture-token-hash', 'agency_accept_decline', now() + interval '1 day');

insert into public.agency_penalties (id, agency_id, booking_id, kind, amount)
values ('5ee80000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', '5ec90000-0000-0000-0000-000000000001', 'no_response', 15.00);

insert into public.booking_disruptions (id, booking_id, reason_code, choice_deadline)
values ('5ee90000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', 'conditions_weather', now() + interval '1 day');

insert into public.booking_disputes (id, booking_id, opened_by, kind, statement)
values ('5eea0000-0000-0000-0000-000000000001', '5ec90000-0000-0000-0000-000000000001', '5ec10000-0000-0000-0000-000000000001', 'no_show', 'Fixture dispute statement, long enough to pass the length check.');

insert into public.destinations (id, name, district, province)
values ('5eeb0000-0000-0000-0000-000000000001', 'Fixture Destination', 'Kathmandu', 'Bagmati');

insert into public.season_templates (id, label, start_mmdd, end_mmdd)
values ('5eec0000-0000-0000-0000-000000000001', 'Fixture Season', '09-01', '09-30');

insert into public.agency_commitments (id, agency_id, commitment_key)
values ('5eed0000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', 'fixture_commitment');

insert into public.agency_blackout_periods (id, agency_id, start_date, end_date, reason, created_by)
values ('5ee20000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-00000000000a', current_date + 150, current_date + 152, 'Fixture agency blackout', '5ec20000-0000-0000-0000-000000000001');

insert into public.platform_blackout_presets (id, name, start_date, end_date, year, description, active, created_by)
values ('5ee30000-0000-0000-0000-000000000001', 'Fixture Festival', current_date + 160, current_date + 162, extract(year from current_date)::int, 'fixture-only preset', true, '5ec30000-0000-0000-0000-000000000001');

select pass('fixture dataset loads without error');
select * from finish();
rollback;
