-- Scenario test (Prompt 23): suspending an agency blocks every NEW hold on
-- its listings immediately, but an already-existing confirmed booking
-- stays fully visible to both the traveler and the agency's own staff —
-- suspension is a going-forward gate, never a retroactive data lockout.
-- Run via: supabase test db supabase/tests/suspended-agency-blocks-new-holds-but-existing-bookings-remain-visible.sql
begin;
create extension if not exists pgtap;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd8-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d8000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd8-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d8000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd8-admin@test.com',    '{"role": "admin"}'::jsonb,    '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d8a00000-0000-0000-0000-000000000001', 'D8 Suspend Agency', 'D8 Suspend Agency', 'd8-suspend-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d8a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d8a00000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', 'manager', now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d8100000-0000-0000-0000-000000000001', 'd8a00000-0000-0000-0000-000000000001', 'd8-day', 'D8 Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');

-- ── An existing, already-confirmed booking before any suspension ───────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as b1, amount_due_now as amt, currency as cur from public.create_booking_hold(
  'd8100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'D8 Traveler', 'contact_email', 'd8-traveler@test.com', 'contact_phone', '+9779800000')
) \gset
reset role;

set local role service_role;
select public.mark_reservation_fee_paid(:'b1'::uuid, 'test_provider', 'd8-ref-1', :'amt'::numeric, :'cur');
reset role;
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'confirmed', 'the pre-suspension booking is confirmed');

-- ── Suspend the agency ───────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('sub', 'd8000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok($$ select public.admin_suspend_agency('d8a00000-0000-0000-0000-000000000001'::uuid, 'Compliance review') $$, 'admin suspends the agency');
select set_config('request.jwt.claims', '', true);
select is((select status from public.agency_verification where agency_id = 'd8a00000-0000-0000-0000-000000000001'::uuid), 'suspended', 'agency_verification reflects the suspension');
select is((select status from public.listings where id = 'd8100000-0000-0000-0000-000000000001'::uuid), 'paused', 'the listing is auto-paused alongside the suspension');

-- ── New holds are blocked immediately ───────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.create_booking_hold('d8100000-0000-0000-0000-000000000001'::uuid, '%s'::date, 1, jsonb_build_object('full_name', 'D8 Traveler', 'contact_email', 'd8-traveler@test.com', 'contact_phone', '+9779800000')) $f$, (current_date + 11)::text),
  'P0001', 'DATE_NOT_BOOKABLE',
  'a new hold on the suspended agency''s listing is blocked'
);
reset role;

-- is_date_bookable() has no execute grant to any role at all (internal
-- only) — called here as the ambient superuser, not under 'authenticated'.
select is(public.is_date_bookable('d8100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 1), 'unavailable', 'is_date_bookable reports unavailable for a suspended agency''s listing');

-- ── The existing booking stays visible to both sides ────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is((select count(*)::int from public.bookings where id = :'b1'::uuid), 1, 'the traveler can still see their existing booking');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is((select count(*)::int from public.bookings where id = :'b1'::uuid), 1, 'the suspended agency''s own manager can still see the existing booking');
reset role;

select * from finish();
