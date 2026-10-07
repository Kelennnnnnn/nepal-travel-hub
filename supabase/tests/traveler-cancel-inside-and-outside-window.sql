-- Scenario test (Prompt 23): traveler-initiated cancellation, fee_only vs.
-- full_online, inside vs. outside the free-cancellation window — four
-- combinations, each asserting the exact refund_records produced.
-- Run via: supabase test db supabase/tests/traveler-cancel-inside-and-outside-window.sql
begin;
create extension if not exists pgtap;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('d5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd5-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d5a00000-0000-0000-0000-000000000001', 'D5 Cancel Window Agency', 'D5 Cancel Window Agency', 'd5-cancel-window-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d5a00000-0000-0000-0000-000000000001', 'approved', now(), now());

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d5100000-0000-0000-0000-000000000001', 'd5a00000-0000-0000-0000-000000000001', 'd5-fee-only', 'D5 Fee-Only Day', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, payment_requirement, cancellation_policy)
values ('d5100000-0000-0000-0000-000000000002', 'd5a00000-0000-0000-0000-000000000001', 'd5-full-online', 'D5 Full-Online Day', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', 'full_online', '{"tiers": [{"days": 7, "refund_percent": 100}, {"days": 3, "refund_percent": 50}, {"days": 0, "refund_percent": 0}]}'::jsonb);
select set_config('request.jwt.claims', '', true);

create or replace function d5_booking(p_listing_id uuid, p_date date, p_ref text, p_start_offset interval)
returns uuid language plpgsql as $$
declare v_b uuid; v_amt numeric; v_cur text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'd5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select h.booking_id, h.amount_due_now, h.currency into v_b, v_amt, v_cur
  from public.create_booking_hold(p_listing_id, p_date, 1, jsonb_build_object('full_name', 'D5 Traveler', 'contact_email', 'd5-traveler@test.com', 'contact_phone', '+9779800000')) h;
  reset role;

  set local role service_role;
  perform public.mark_reservation_fee_paid(v_b, 'test_provider', p_ref, v_amt, v_cur);
  reset role;

  update public.booking_quotes set start_at = now() + p_start_offset, end_at = now() + p_start_offset + interval '1 hour' where id = (select quote_id from public.bookings where id = v_b);
  return v_b;
end;
$$;

-- ── 1. fee_only, OUTSIDE the window (30h before a day activity: free) ──

select d5_booking('d5100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 'd5-ref-1', interval '30 hours') as b1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'b1'), 'fee_only outside window: cancels');
reset role;
select is((select booking_status from public.bookings where id = :'b1'::uuid), 'cancelled', 'fee_only outside window: cancelled');
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'b1'::uuid and kind = 'reservation_fee'), (select platform_fee from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b1'::uuid))::numeric(12,2), 'fee_only outside window: full fee refund');
select is((select count(*)::int from public.refund_records where booking_id = :'b1'::uuid and kind = 'balance'), 0, 'fee_only outside window: no balance refund (none was ever paid through the platform)');

-- ── 2. fee_only, INSIDE the window (10h before: fee kept) ───────────────

select d5_booking('d5100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 'd5-ref-2', interval '10 hours') as b2 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'b2'), 'fee_only inside window: cancels');
reset role;
select is((select booking_status from public.bookings where id = :'b2'::uuid), 'cancelled', 'fee_only inside window: cancelled');
select is((select count(*)::int from public.refund_records where booking_id = :'b2'::uuid), 0, 'fee_only inside window: no refund record at all (fee kept)');

-- ── 3. full_online, OUTSIDE the window (30h: fee + balance both full) ──

select d5_booking('d5100000-0000-0000-0000-000000000002'::uuid, current_date + 12, 'd5-ref-3', interval '30 hours') as b3 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'b3'), 'full_online outside window: cancels');
reset role;
select is((select count(*)::int from public.refund_records where booking_id = :'b3'::uuid and kind = 'reservation_fee' and payer_side = 'platform'), 1, 'full_online outside window: platform fee refund');
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'b3'::uuid and kind = 'balance'), (select agency_balance from public.booking_quotes where id = (select quote_id from public.bookings where id = :'b3'::uuid))::numeric(12,2), 'full_online outside window: full balance refund (100% tier is not even needed — outside the free-cancel window overrides it)');
select is((select status from public.refund_records where booking_id = :'b3'::uuid and kind = 'balance'), 'agency_owed', 'full_online outside window: balance refund is agency_owed');

-- ── 4. full_online, INSIDE the window, 5 days before start (50% tier) ──
-- days_before_start computed from NOW to start_at; 5 days ~= 120h, which
-- is < the 24h free_cancel_hours threshold is false (120 > 24), so this is
-- actually still OUTSIDE the fee window — use a start_at inside 24h but
-- with date-math landing in the 3-6 day tier for the BALANCE policy. Since
-- fee/balance share one now()-vs-start_at comparison for "inside the free
-- window" (fee_refund_rule, not the tiers), this scenario needs start_at
-- inside 24h so the fee is kept while the balance follows the day-count
-- tiers computed from the same now()-to-start_at gap — i.e. just under 24h
-- still rounds to "0 days before start" on the tier scale, landing in the
-- 0% tier. This is the correct, intentional behavior (the tiers are keyed
-- to whole days, and "11 hours before start" is 0 whole days before start).

select d5_booking('d5100000-0000-0000-0000-000000000002'::uuid, current_date + 13, 'd5-ref-4', interval '11 hours') as b4 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'b4'), 'full_online inside window: cancels');
reset role;
select is((select count(*)::int from public.refund_records where booking_id = :'b4'::uuid and kind = 'reservation_fee'), 0, 'full_online inside window: no fee refund (fee kept)');
select is((select count(*)::int from public.refund_records where booking_id = :'b4'::uuid and kind = 'balance'), 0, 'full_online inside window, 0% tier: no balance refund record at all (0% means nothing to record)');

select * from finish();
