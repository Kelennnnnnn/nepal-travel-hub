-- Scenario test (Prompt 23): instant day activity happy path.
-- hold -> fee paid (service_role, simulating the webhook) -> confirmed ->
-- (time pushed forward) auto-complete -> review allowed.
-- Run via: supabase test db supabase/tests/instant-day-activity-happy-path.sql
begin;
create extension if not exists pgtap;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd1-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd1-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d1a00000-0000-0000-0000-000000000001', 'D1 Happy Path Agency', 'D1 Happy Path Agency', 'd1-happy-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d1a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d1a00000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'manager', now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d1100000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'd1-instant-day', 'D1 Instant Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');

select set_config('request.jwt.claims', '', true);

-- ── 1. Traveler holds the date ──────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as b1, amount_due_now as amt, currency as cur, confirmation_mode as conf_mode from public.create_booking_hold(
  'd1100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 2,
  jsonb_build_object('full_name', 'D1 Traveler', 'contact_email', 'd1-traveler@test.com', 'contact_phone', '+9779800000')
) \gset
reset role;

select is(:'conf_mode'::text, 'instant', 'listing is instant-confirm (Cultural, 1 day)');
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'pending_payment', 'hold starts at pending_payment');

-- ── 2. service_role marks the fee paid, simulating the NIC Asia webhook ──

set local role service_role;
select is(
  public.mark_reservation_fee_paid(:'b1'::uuid, 'test_provider', 'd1-ref-1', :'amt'::numeric, :'cur'),
  'confirmed',
  'fee paid -> instant-confirm booking goes straight to confirmed'
);
reset role;

select is((select payment_status from public.bookings where id = :'b1'::uuid), 'paid', 'payment_status is paid');
select is((select ir.status from public.inventory_reservations ir join public.booking_quotes q on q.inventory_reservation_id = ir.id where q.id = (select quote_id from public.bookings where id = :'b1'::uuid)), 'confirmed', 'the reservation is confirmed, not just held');

-- ── 3. Push the trip into the past and auto-complete ────────────────────

update public.booking_quotes set start_at = now() - interval '26 hours', end_at = now() - interval '25 hours'
where id = (select quote_id from public.bookings where id = :'b1'::uuid);

select public.complete_finished_bookings();

select is((select booking_status from public.bookings where id = :'b1'::uuid), 'completed', 'auto-completed 24h after end_at');
select ok((select completed_at is not null from public.bookings where id = :'b1'::uuid), 'completed_at is set');

-- ── 4. A completed booking may be reviewed by its own traveler ──────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format(
    $f$ insert into public.reviews (listing_id, agency_id, booking_id, traveler_id, rating, comment)
        values ('d1100000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', '%s'::uuid, 'd1000000-0000-0000-0000-000000000001', 5, 'Fantastic day out, highly recommend this operator.') $f$,
    :'b1'
  ),
  'a completed booking is reviewable by its own traveler'
);
reset role;

select is((select count(*)::int from public.reviews where booking_id = :'b1'::uuid), 1, 'exactly one review row exists');

select * from finish();
