-- Scenario test (Prompt 23): a reservation-fee payment that arrives after
-- the hold already expired AND the date has since filled up for someone
-- else must cancel with a full refund, never silently keep the money.
-- Run via: supabase test db supabase/tests/paid-after-expiry-date-full-refund.sql
begin;
create extension if not exists pgtap;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd4-traveler1@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd4-traveler2@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d4a00000-0000-0000-0000-000000000001', 'D4 Expiry Refund Agency', 'D4 Expiry Refund Agency', 'd4-expiry-refund-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d4a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, daily_booking_limit)
values ('d4100000-0000-0000-0000-000000000001', 'd4a00000-0000-0000-0000-000000000001', 'd4-limited-day', 'D4 Limited Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', 1);
select set_config('request.jwt.claims', '', true);

-- ── Traveler 1 holds, then their hold goes stale (webhook running late) ──

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd4000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as b1, amount_due_now as amt, currency as cur from public.create_booking_hold(
  'd4100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'D4 Traveler 1', 'contact_email', 'd4-traveler1@test.com', 'contact_phone', '+9779800001')
) \gset
reset role;

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
update public.booking_quotes set expires_at = now() - interval '1 minute' where id = (select quote_id from public.bookings where id = :'b1'::uuid);
update public.inventory_reservations set expires_at = now() - interval '1 minute' where id = (select inventory_reservation_id from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b1'::uuid));
select set_config('request.jwt.claims', '', true);

select public.expire_stale_booking_holds();
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'expired', 'traveler 1''s hold expired before the webhook arrived');

-- ── Meanwhile, traveler 2 takes the only remaining slot (and pays) ──────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd4000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id as b2, amount_due_now as amt2, currency as cur2 from public.create_booking_hold(
  'd4100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1,
  jsonb_build_object('full_name', 'D4 Traveler 2', 'contact_email', 'd4-traveler2@test.com', 'contact_phone', '+9779800002')
) \gset
reset role;

set local role service_role;
select public.mark_reservation_fee_paid(:'b2'::uuid, 'test_provider', 'd4-ref-2', :'amt2'::numeric, :'cur2');
reset role;
select is((select booking_status from public.bookings where id = :'b2'::uuid), 'confirmed', 'traveler 2 is confirmed and now occupies the day''s only slot');

-- ── Traveler 1's late webhook now arrives — the date is genuinely full ──

set local role service_role;
select is(
  public.mark_reservation_fee_paid(:'b1'::uuid, 'test_provider', 'd4-ref-1-late', :'amt'::numeric, :'cur'),
  'cancelled',
  'the late payment for traveler 1 is rejected into cancelled, not silently confirmed'
);
reset role;

select is((select booking_status from public.bookings where id = :'b1'::uuid), 'cancelled', 'traveler 1''s booking is cancelled');
select is((select cancellation_reason_code from public.bookings where id = :'b1'::uuid), 'paid_after_expiry', 'reason code recorded');
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'b1'::uuid and kind = 'reservation_fee'), :'amt'::numeric(12,2), 'traveler 1 gets a full refund of what they paid');
select is((select count(*)::int from public.payment_events where booking_id = :'b1'::uuid), 1, 'the late payment is still recorded in payment_events (money genuinely moved)');

select * from finish();
