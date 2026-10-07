-- Scenario test (Prompt 23): the no-show window (grace period / 24h close)
-- and all three dispute resolutions (uphold / agency failed / partial).
-- Run via: supabase test db supabase/tests/no-show-window-and-dispute-paths.sql
begin;
create extension if not exists pgtap;

select plan(18);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd6-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d6000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd6-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d6000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd6-support@test.com',  '{"role": "support"}'::jsonb,  '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d6a00000-0000-0000-0000-000000000001', 'D6 No-Show Agency', 'D6 No-Show Agency', 'd6-no-show-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d6a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d6a00000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'manager', now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d6100000-0000-0000-0000-000000000001', 'd6a00000-0000-0000-0000-000000000001', 'd6-day', 'D6 Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');
select set_config('request.jwt.claims', '', true);

create or replace function d6_booking(p_date date, p_ref text, p_start_offset interval, p_end_offset interval)
returns uuid language plpgsql as $$
declare v_b uuid; v_amt numeric; v_cur text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select h.booking_id, h.amount_due_now, h.currency into v_b, v_amt, v_cur
  from public.create_booking_hold('d6100000-0000-0000-0000-000000000001'::uuid, p_date, 1, jsonb_build_object('full_name', 'D6 Traveler', 'contact_email', 'd6-traveler@test.com', 'contact_phone', '+9779800000')) h;
  reset role;
  set local role service_role;
  perform public.mark_reservation_fee_paid(v_b, 'test_provider', p_ref, v_amt, v_cur);
  reset role;
  update public.booking_quotes set start_at = now() + p_start_offset, end_at = now() + p_end_offset where id = (select quote_id from public.bookings where id = v_b);
  return v_b;
end;
$$;

-- ── Window: before grace -> error ────────────────────────────────────────

select d6_booking(current_date + 10, 'd6-ref-1', interval '-5 minutes', interval '23 hours 55 minutes') as b1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(format($f$ select public.agency_mark_no_show('%s'::uuid, null) $f$, :'b1'), 'P0001', 'GRACE_PERIOD_NOT_ELAPSED', 'before the grace period elapses: rejected');
reset role;

-- ── Window: within the window -> no_show, no refund records ─────────────

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
update public.booking_quotes set start_at = now() - interval '1 hour', end_at = now() where id = (select quote_id from public.bookings where id = :'b1'::uuid);
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.agency_mark_no_show('%s'::uuid, 'no-show') $f$, :'b1'), 'within the window: succeeds');
reset role;
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'no_show', 'booking is no_show');
select is((select count(*)::int from public.refund_records where booking_id = :'b1'::uuid), 0, 'no refund records at all for a no-show');

-- ── Window: after end+24h -> error ───────────────────────────────────────

select d6_booking(current_date + 11, 'd6-ref-2', interval '-40 hours', interval '-30 hours') as b2 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(format($f$ select public.agency_mark_no_show('%s'::uuid, null) $f$, :'b2'), 'P0001', 'NO_SHOW_WINDOW_CLOSED', 'after end+24h: rejected');
reset role;

-- ── Dispute: uphold_no_show (kind=no_show) -> booking stays no_show ─────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.traveler_dispute_no_show(:'b1'::uuid, 'I was there, please double check with the guide.');
reset role;
select id as dispute1 from public.booking_disputes where booking_id = :'b1'::uuid \gset
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'disputed', 'dispute opens -> disputed');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.admin_resolve_dispute('%s'::uuid, 'uphold_no_show', null, 'Checked with guide, confirmed absent.') $f$, :'dispute1'), 'support upholds the no-show');
reset role;
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'no_show', 'uphold_no_show reverts the booking to no_show');
select is((select count(*)::int from public.refund_records where booking_id = :'b1'::uuid), 0, 'uphold_no_show: still no refund, no penalty');
select is((select count(*)::int from public.agency_penalties where booking_id = :'b1'::uuid), 0, 'uphold_no_show: no agency penalty');

-- ── Dispute: traveler_was_present_agency_failed -> full refund + penalty + strike

select d6_booking(current_date + 12, 'd6-ref-3', interval '-1 hour', interval '0 hours') as b3 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_mark_no_show(:'b3'::uuid, null);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.traveler_dispute_no_show(:'b3'::uuid, 'The guide never showed up at the meeting point as agreed.');
reset role;
select id as dispute3 from public.booking_disputes where booking_id = :'b3'::uuid \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.admin_resolve_dispute('%s'::uuid, 'traveler_was_present_agency_failed', null, 'Confirmed agency failed.') $f$, :'dispute3'), 'support finds the agency at fault');
reset role;
select is((select booking_status from public.bookings where id = :'b3'::uuid), 'cancelled', 'agency-failed: cancelled');
select is((select count(*)::int from public.refund_records where booking_id = :'b3'::uuid and kind = 'reservation_fee'), 1, 'agency-failed: full fee refund');
select is((select count(*)::int from public.agency_penalties where booking_id = :'b3'::uuid and kind = 'agency_no_show'), 1, 'agency-failed: penalty recorded');
select is((select count(*)::int from public.agency_strikes where booking_id = :'b3'::uuid and kind = 'agency_no_show'), 1, 'agency-failed: strike recorded');

-- ── Dispute: partial -> admin-chosen percent, no penalty/strike ─────────

select d6_booking(current_date + 13, 'd6-ref-4', interval '-1 hour', interval '0 hours') as b4 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_mark_no_show(:'b4'::uuid, null);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.traveler_dispute_no_show(:'b4'::uuid, 'I think there was a miscommunication about the meeting time.');
reset role;
select id as dispute4 from public.booking_disputes where booking_id = :'b4'::uuid \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.admin_resolve_dispute('%s'::uuid, 'partial', 50, 'Good-faith compromise.') $f$, :'dispute4'), 'support resolves partially at 50%');
reset role;
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'b4'::uuid and kind = 'reservation_fee'), (select platform_fee * 0.5 from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b4'::uuid))::numeric(12,2), 'partial: 50% fee refund');
select is((select count(*)::int from public.agency_penalties where booking_id = :'b4'::uuid), 0, 'partial: no penalty (not a fault finding)');

select * from finish();
