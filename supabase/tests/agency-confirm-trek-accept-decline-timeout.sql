-- Scenario test (Prompt 23): agency_confirm trek — accept / decline /
-- timeout, each with the refund record and alternatives suggestion a
-- decline or timeout should produce.
-- Run via: supabase test db supabase/tests/agency-confirm-trek-accept-decline-timeout.sql
begin;
create extension if not exists pgtap;

select plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd2-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd2-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values
  ('d2a00000-0000-0000-0000-000000000001', 'D2 Trek Agency A', 'D2 Trek Agency A', 'd2-trek-agency-a', 'Kathmandu', 'Solukhumbu'),
  ('d2a00000-0000-0000-0000-000000000002', 'D2 Trek Agency B', 'D2 Trek Agency B', 'd2-trek-agency-b', 'Kathmandu', 'Solukhumbu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values
  ('d2a00000-0000-0000-0000-000000000001', 'approved', now(), now()),
  ('d2a00000-0000-0000-0000-000000000002', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d2a00000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'manager', now());

-- Trekking listings default to agency_confirm (guard_listing_rules).
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d2100000-0000-0000-0000-000000000001', 'd2a00000-0000-0000-0000-000000000001', 'd2-trek', 'D2 Trek', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 50000, 10, 'Moderate', 'published');
-- Similar listing from a DIFFERENT agency, for suggest_alternatives to find.
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, rating, review_count)
values ('d2100000-0000-0000-0000-000000000002', 'd2a00000-0000-0000-0000-000000000002', 'd2-trek-alt', 'D2 Alternative Trek', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 50000, 10, 'Moderate', 'published', 4.6, 12);

select set_config('request.jwt.claims', '', true);

create or replace function d2_make_hold(p_date date, p_ref text)
returns table(booking_id uuid, amt numeric, cur text) language plpgsql as $$
declare v_b uuid; v_amt numeric; v_cur text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select h.booking_id, h.amount_due_now, h.currency into v_b, v_amt, v_cur
  from public.create_booking_hold('d2100000-0000-0000-0000-000000000001'::uuid, p_date, 1, jsonb_build_object('full_name', 'D2 Traveler', 'contact_email', 'd2-traveler@test.com', 'contact_phone', '+9779800001')) h;
  reset role;

  set local role service_role;
  perform public.mark_reservation_fee_paid(v_b, 'test_provider', p_ref, v_amt, v_cur);
  reset role;

  return query select v_b, v_amt, v_cur;
end;
$$;

-- ── Accept ───────────────────────────────────────────────────────────────

select booking_id as b_accept from d2_make_hold(current_date + 20, 'd2-ref-accept') \gset
select is((select booking_status from public.bookings where id = :'b_accept'::uuid), 'awaiting_agency_confirmation', 'accept-scenario: fee paid moves to awaiting_agency_confirmation');
select ok((select agency_confirm_deadline - created_at < interval '24 hours 1 minute' from public.bookings where id = :'b_accept'::uuid), 'accept-scenario: deadline is ~24h out');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.agency_respond_to_booking('%s'::uuid, true, null) $f$, :'b_accept'), 'manager accepts');
reset role;
select is((select booking_status from public.bookings where id = :'b_accept'::uuid), 'confirmed', 'accept-scenario: now confirmed');
select is((select count(*)::int from public.refund_records where booking_id = :'b_accept'::uuid), 0, 'accept-scenario: no refund record');

-- ── Decline ──────────────────────────────────────────────────────────────

select booking_id as b_decline from d2_make_hold(current_date + 21, 'd2-ref-decline') \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.agency_respond_to_booking('%s'::uuid, false, 'Fully booked that week, guide unavailable.') $f$, :'b_decline'),
  'manager declines with a valid reason'
);
reset role;

select is((select booking_status from public.bookings where id = :'b_decline'::uuid), 'cancelled', 'decline-scenario: cancelled');
select is((select cancellation_reason_code from public.bookings where id = :'b_decline'::uuid), 'agency_declined', 'decline-scenario: reason code recorded');
select is((select count(*)::int from public.refund_records where booking_id = :'b_decline'::uuid and kind = 'reservation_fee' and status = 'pending_provider'), 1, 'decline-scenario: full fee refund record created');
select is((select count(*)::int from public.agency_strikes where booking_id = :'b_decline'::uuid), 0, 'decline-scenario: no strike for a timely decline');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select ok(
  (select count(*)::int from public.suggest_alternatives(:'b_decline'::uuid)) >= 1,
  'decline-scenario: suggest_alternatives finds the other agency''s similar trek'
);
reset role;

-- ── Timeout ──────────────────────────────────────────────────────────────

select booking_id as b_timeout from d2_make_hold(current_date + 22, 'd2-ref-timeout') \gset

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
update public.bookings set agency_confirm_deadline = now() - interval '1 minute' where id = :'b_timeout'::uuid;
select set_config('request.jwt.claims', '', true);

select public.expire_agency_confirmations();

select is((select booking_status from public.bookings where id = :'b_timeout'::uuid), 'cancelled', 'timeout-scenario: cancelled by the sweep');
select is((select cancellation_reason_code from public.bookings where id = :'b_timeout'::uuid), 'agency_no_response', 'timeout-scenario: reason code recorded');
select is((select count(*)::int from public.refund_records where booking_id = :'b_timeout'::uuid and status = 'pending_provider'), 1, 'timeout-scenario: full fee refund record created');
select is((select count(*)::int from public.agency_strikes where booking_id = :'b_timeout'::uuid and kind = 'no_response'), 1, 'timeout-scenario: a no_response strike was recorded');
select is((select count(*)::int from public.agency_penalties where booking_id = :'b_timeout'::uuid and kind = 'no_response'), 1, 'timeout-scenario: a no_response penalty was recorded');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select ok(
  (select count(*)::int from public.suggest_alternatives(:'b_timeout'::uuid)) >= 1,
  'timeout-scenario: suggest_alternatives still finds the other agency''s similar trek'
);
reset role;

-- Traveler/agency cannot ever call mark_reservation_fee_paid themselves —
-- already exhaustively covered by the generated rls-matrix suite (via
-- has_function_privilege(), which checks the ACL bit without actually
-- invoking the function) rather than re-asserted here.

select * from finish();
