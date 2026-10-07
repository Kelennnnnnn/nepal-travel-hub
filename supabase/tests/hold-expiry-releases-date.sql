-- Scenario test (Prompt 23): a hold that expires unpaid releases its
-- capacity claim — the date reopens for the next caller instead of
-- staying falsely "full" forever.
-- Run via: supabase test db supabase/tests/hold-expiry-releases-date.sql
begin;
create extension if not exists pgtap;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd3-traveler1@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd3-traveler2@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d3a00000-0000-0000-0000-000000000001', 'D3 Expiry Agency', 'D3 Expiry Agency', 'd3-expiry-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d3a00000-0000-0000-0000-000000000001', 'approved', now(), now());
-- daily_booking_limit=1 makes "is the date still full" directly observable.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, daily_booking_limit)
values ('d3100000-0000-0000-0000-000000000001', 'd3a00000-0000-0000-0000-000000000001', 'd3-limited-day', 'D3 Limited Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', 1);
select set_config('request.jwt.claims', '', true);

-- ── Traveler 1 holds the only slot ───────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as b1 from public.create_booking_hold(
  'd3100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'D3 Traveler 1', 'contact_email', 'd3-traveler1@test.com', 'contact_phone', '+9779800001')
) \gset
reset role;

select is(public.is_date_bookable('d3100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1), 'full', 'the only slot is now held — date reports full');

-- A second traveler cannot hold it.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.create_booking_hold('d3100000-0000-0000-0000-000000000001'::uuid, '%s'::date, 1, jsonb_build_object('full_name', 'D3 Traveler 2', 'contact_email', 'd3-traveler2@test.com', 'contact_phone', '+9779800002')) $f$, (current_date + 10)::text),
  'P0001', 'DATE_NOT_BOOKABLE',
  'a second traveler cannot hold the same, already-full date'
);
reset role;

-- ── Expire the first hold ────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
update public.booking_quotes set expires_at = now() - interval '1 minute' where id = (select quote_id from public.bookings where id = :'b1'::uuid);
update public.inventory_reservations set expires_at = now() - interval '1 minute' where id = (select inventory_reservation_id from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b1'::uuid));
select set_config('request.jwt.claims', '', true);

select public.expire_stale_booking_holds();

select is((select booking_status from public.bookings where id = :'b1'::uuid), 'expired', 'the stale hold is now expired');
select is((select status from public.inventory_reservations ir where ir.id = (select inventory_reservation_id from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b1'::uuid))), 'expired', 'its inventory_reservation is released (status=expired)');

-- ── The date is open again ───────────────────────────────────────────────

select is(public.is_date_bookable('d3100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1), 'open', 'the date reopens once the stale hold expires');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.create_booking_hold('d3100000-0000-0000-0000-000000000001'::uuid, '%s'::date, 1, jsonb_build_object('full_name', 'D3 Traveler 2', 'contact_email', 'd3-traveler2@test.com', 'contact_phone', '+9779800002')) $f$, (current_date + 10)::text),
  'the second traveler can now hold the released date'
);
reset role;

select * from finish();
