-- Acceptance tests for the flexible-date booking rules layer
-- (supabase/migrations/20260918000001_booking_rules.sql).
-- Run via: supabase test db supabase/tests/booking-rules.sql
begin;
create extension if not exists pgtap;

select plan(16);

-- ── Fixtures (all under the real admin JWT -- every INSERT below,
--    including the published listings and the festival preset, needs
--    is_admin() to be definitively TRUE, so claims are not cleared until
--    every admin-only insert is done). ──────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('b9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-admin@test.com',  '{"role": "admin"}'::jsonb,  '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-owner-a@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('b9000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-owner-s@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values
  ('b9a00000-0000-0000-0000-000000000001', 'Booking Rules Agency', 'Booking Rules Agency', 'br-agency', 'Kathmandu', 'Kathmandu'),
  ('b9a00000-0000-0000-0000-000000000002', 'Booking Rules Agency (suspended)', 'BR Agency Suspended', 'br-agency-suspended', 'Pokhara', 'Kaski');

insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values
  ('b9a00000-0000-0000-0000-000000000001', 'approved', now(), now()),
  ('b9a00000-0000-0000-0000-000000000002', 'suspended', now(), now());

insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values
  ('b9a00000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000002', 'owner', now()),
  ('b9a00000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000003', 'owner', now());

-- A trek (multi-day, Trekking) and a 1-day cultural tour, both drafts.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values
  ('b9100000-0000-0000-0000-000000000001', 'b9a00000-0000-0000-0000-000000000001', 'br-trek', 'Booking Rules Trek', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'draft'),
  ('b9100000-0000-0000-0000-000000000002', 'b9a00000-0000-0000-0000-000000000001', 'br-tour',  'Booking Rules Tour',  'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu',  '1 day',  1,  50, 10, 'Easy', 'draft');

-- A published day-trip, operating every day of the week.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, operating_days, difficulty, status)
values ('b9100000-0000-0000-0000-000000000003', 'b9a00000-0000-0000-0000-000000000001', 'br-daytrip', 'Booking Rules Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 50, 10, array[1,2,3,4,5,6,7]::smallint[], 'Easy', 'published');

-- A second published day-trip, open weekdays only, to test closed_day cleanly.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, operating_days, difficulty, status)
values ('b9100000-0000-0000-0000-000000000004', 'b9a00000-0000-0000-0000-000000000001', 'br-weekdays-only', 'Booking Rules Weekdays Only', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 50, 10, array[1,2,3,4,5]::smallint[], 'Easy', 'published');

-- A published listing belonging to the suspended agency.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('b9100000-0000-0000-0000-000000000005', 'b9a00000-0000-0000-0000-000000000002', 'br-suspended-listing', 'Booking Rules Suspended Agency Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 50, 10, 'Easy', 'published');

insert into public.platform_blackout_presets (id, name, start_date, end_date, year, active, created_by)
values ('b9900000-0000-0000-0000-000000000001', 'Booking Rules Test Festival', current_date + 20, current_date + 22, extract(year from current_date)::int, true, 'b9000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '', true);

-- ── 1. confirmation_mode / min_advance_hours defaults ───────────────────────

select is((select confirmation_mode from public.listings where id = 'b9100000-0000-0000-0000-000000000001'), 'agency_confirm', 'multi-day Trekking listing defaults to agency_confirm');
select is((select min_advance_hours from public.listings where id = 'b9100000-0000-0000-0000-000000000001'), 168, 'multi-day Trekking listing defaults min_advance_hours to 168');
select is((select confirmation_mode from public.listings where id = 'b9100000-0000-0000-0000-000000000002'), 'instant', '1-day Cultural listing defaults to instant');
select is((select min_advance_hours from public.listings where id = 'b9100000-0000-0000-0000-000000000002'), 24, '1-day Cultural listing defaults min_advance_hours to 24');

-- ── 2. restricted_area ───────────────────────────────────────────────────
-- Run as a real admin: guard_listing_protected_fields only skips pinning
-- restricted_area back to false when is_admin() is definitely TRUE (not
-- merely non-false), so this specific check needs a genuine admin session,
-- not just an absent/empty JWT, or the CHECK constraint below would never
-- actually see restricted_area = true to reject in the first place.

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  $sql$ insert into public.listings (agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, min_participants, restricted_area, difficulty, status)
        values ('b9a00000-0000-0000-0000-000000000001', 'br-restricted-bad', 'Bad Restricted Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Mustang', '10 days', 10, 900, 10, 1, true, 'Expert', 'draft') $sql$,
  null, null,
  'restricted_area listing with min_participants 1 is rejected'
);
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
update public.listings set restricted_area = true where id = 'b9100000-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claims', '', true);
select is((select restricted_area from public.listings where id = 'b9100000-0000-0000-0000-000000000001'), false, 'agency cannot set restricted_area -- pinned to the old value');

-- ── 3. get_bookable_dates ────────────────────────────────────────────────

select is(
  (select status from public.get_bookable_dates('b9100000-0000-0000-0000-000000000003'::uuid, current_date, current_date)),
  'too_soon',
  'get_bookable_dates: today is too_soon (inside the 24h notice period)'
);

select ok(
  (select bool_or(status = 'closed_day') from public.get_bookable_dates('b9100000-0000-0000-0000-000000000004'::uuid, current_date + 2, current_date + 12)),
  'get_bookable_dates: a non-operating weekday within range reports closed_day'
);

-- Festival preset applied to the agency -> blackout for every day it covers.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.apply_blackout_preset('b9900000-0000-0000-0000-000000000001'::uuid);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.get_bookable_dates('b9100000-0000-0000-0000-000000000003'::uuid, current_date + 21, current_date + 21)),
  'blackout',
  'get_bookable_dates: a date inside an applied festival preset reports blackout'
);

-- Agency-wide pause.
update public.agencies set bookings_paused = true where id = 'b9a00000-0000-0000-0000-000000000001';
select is(
  (select status from public.get_bookable_dates('b9100000-0000-0000-0000-000000000003'::uuid, current_date + 30, current_date + 30)),
  'paused',
  'get_bookable_dates: paused agency reports paused'
);
update public.agencies set bookings_paused = false where id = 'b9a00000-0000-0000-0000-000000000001';

-- Suspended agency.
select is(
  (select status from public.get_bookable_dates('b9100000-0000-0000-0000-000000000005'::uuid, current_date + 30, current_date + 30)),
  'unavailable',
  'get_bookable_dates: a suspended agency''s listing reports unavailable'
);

-- Timezone edge: frozen at 23:00 NPT (17:15 UTC) on day D, tomorrow 07:00
-- with 24h notice should be too_soon; the day after that is open.
select is(
  (select status from public.get_bookable_dates(
    'b9100000-0000-0000-0000-000000000003'::uuid,
    '2026-11-03'::date, '2026-11-03'::date, null,
    '2026-11-02T17:15:00+00'::timestamptz
  )),
  'too_soon',
  'get_bookable_dates: at 23:00 NPT, tomorrow 07:00 with 24h notice is too_soon'
);
select is(
  (select status from public.get_bookable_dates(
    'b9100000-0000-0000-0000-000000000003'::uuid,
    '2026-11-04'::date, '2026-11-04'::date, null,
    '2026-11-02T17:15:00+00'::timestamptz
  )),
  'open',
  'get_bookable_dates: the day after that, with the same frozen now, is open'
);

-- ── 4. Grants ────────────────────────────────────────────────────────────

set local role anon;
select lives_ok(
  $sql$ select status from public.get_bookable_dates('b9100000-0000-0000-0000-000000000003'::uuid, current_date + 5, current_date + 5) $sql$,
  'anon can call get_bookable_dates'
);
reset role;

-- Checked via has_function_privilege (the same, already-proven mechanism
-- the generated function-matrix suite uses) rather than a live call: a
-- function with NO execute grant at all, not even to service_role, cannot
-- safely be invoked as anon in this local Postgres build -- doing so
-- crashes the backend outright (reproduced independently of this
-- migration, against the pre-existing expire_stale_reservations(), which
-- has the identical "truly nobody" grant shape) rather than raising a
-- normal permission-denied error. has_function_privilege() answers the
-- same question without ever making that call.
select ok(
  not has_function_privilege('anon', 'public.ensure_departure(uuid, date)', 'EXECUTE'),
  'anon cannot call ensure_departure'
);

-- Agency direct INSERT into departures is denied (system-managed now).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  $sql$ insert into public.departures (listing_id, agency_id, departure_date) values ('b9100000-0000-0000-0000-000000000003', 'b9a00000-0000-0000-0000-000000000001', current_date + 40) $sql$,
  null, null,
  'agency direct insert into departures is denied'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
