-- Scenario test (Prompt 23): a weather disruption's three possible
-- outcomes — reschedule (same price, new quote), traveler-chosen refund,
-- and the deadline-default-to-refund sweep.
-- Run via: supabase test db supabase/tests/weather-disruption-reschedule-and-refund-and-default.sql
begin;
create extension if not exists pgtap;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd7-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd7-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d7a00000-0000-0000-0000-000000000001', 'D7 Weather Agency', 'D7 Weather Agency', 'd7-weather-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d7a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d7a00000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000002', 'manager', now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d7100000-0000-0000-0000-000000000001', 'd7a00000-0000-0000-0000-000000000001', 'd7-day', 'D7 Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');
select set_config('request.jwt.claims', '', true);

create or replace function d7_booking(p_date date, p_ref text)
returns uuid language plpgsql as $$
declare v_b uuid; v_amt numeric; v_cur text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'd7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select h.booking_id, h.amount_due_now, h.currency into v_b, v_amt, v_cur
  from public.create_booking_hold('d7100000-0000-0000-0000-000000000001'::uuid, p_date, 1, jsonb_build_object('full_name', 'D7 Traveler', 'contact_email', 'd7-traveler@test.com', 'contact_phone', '+9779800000')) h;
  reset role;
  set local role service_role;
  perform public.mark_reservation_fee_paid(v_b, 'test_provider', p_ref, v_amt, v_cur);
  reset role;
  return v_b;
end;
$$;

create or replace function d7_report_weather(p_booking_id uuid)
returns void language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'd7000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.agency_cancel_booking(p_booking_id, 'conditions_weather', 'Heavy storm forecast');
  reset role;
end;
$$;

-- ── Outcome 1: reschedule ────────────────────────────────────────────────

select d7_booking(current_date + 20, 'd7-ref-1') as b1 \gset
select (select quote_id from public.bookings where id = :'b1'::uuid) as old_quote1 \gset
select (select inventory_reservation_id from public.booking_quotes where id = :'old_quote1'::uuid) as old_reservation1 \gset

select d7_report_weather(:'b1'::uuid);
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'cancel_requested', 'weather disruption opens: cancel_requested');
select is((select reason_code from public.booking_disruptions where booking_id = :'b1'::uuid and resolved_at is null), 'conditions_weather', 'disruption row recorded with the right reason');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_reschedule('%s'::uuid, current_date + 90) $f$, :'b1'), 'traveler reschedules to a far-future open date');
reset role;

select is((select booking_status from public.bookings where id = :'b1'::uuid), 'confirmed', 'rescheduled booking is confirmed again');
select isnt((select quote_id from public.bookings where id = :'b1'::uuid), :'old_quote1'::uuid, 'a new quote row backs the rescheduled booking');
select is((select product_value from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b1'::uuid)), (select product_value from public.booking_quotes where id = :'old_quote1'::uuid), 'price is unchanged (never re-derived for the new date)');
select is((select status from public.inventory_reservations where id = :'old_reservation1'::uuid), 'released', 'the OLD reservation is released, not left dangling');
select is((select count(*)::int from public.refund_records where booking_id = :'b1'::uuid), 0, 'a reschedule creates no refund records at all');

-- ── Outcome 2: traveler-chosen refund ───────────────────────────────────

select d7_booking(current_date + 21, 'd7-ref-2') as b2 \gset
select d7_report_weather(:'b2'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_choose_refund('%s'::uuid) $f$, :'b2'), 'traveler chooses a refund instead');
reset role;

select is((select booking_status from public.bookings where id = :'b2'::uuid), 'cancelled', 'refund choice: cancelled');
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'b2'::uuid and kind = 'reservation_fee'), (select platform_fee from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b2'::uuid))::numeric(12,2), 'refund choice: full fee refund, regardless of timing — a genuine disruption is never the traveler''s fault');

-- ── Outcome 3: no choice by the deadline -> default to refund ──────────

select d7_booking(current_date + 22, 'd7-ref-3') as b3 \gset
select d7_report_weather(:'b3'::uuid);

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
update public.booking_disruptions set choice_deadline = now() - interval '1 hour' where booking_id = :'b3'::uuid;
select set_config('request.jwt.claims', '', true);

select public.expire_disruption_choices();

select is((select booking_status from public.bookings where id = :'b3'::uuid), 'cancelled', 'unanswered disruption auto-cancels once the deadline passes');
select is((select traveler_choice from public.booking_disruptions where booking_id = :'b3'::uuid), 'refund', 'the sweep defaults to refund, never a silent hold');
select is((select count(*)::int from public.refund_records where booking_id = :'b3'::uuid and reason_code = 'disruption_refund_auto'), 1, 'an auto-refund record is created');

select * from finish();
