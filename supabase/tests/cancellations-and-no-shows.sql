-- Acceptance tests for Phase 22 (supabase/migrations/20260921000001_
-- cancellations_and_no_shows.sql). Real bookings are created via the real
-- functions (create_booking_hold + mark_reservation_fee_paid, exactly as
-- Prompt 20/21's own tests do) and then have their quote's start_at/end_at
-- moved directly (service_role, no RLS/trigger guards that specific
-- columns) to simulate "30 hours before start" / "already finished" etc.
-- without needing to wait on the real clock — the schema has no p_now
-- override for these functions the way get_bookable_dates() does, so this
-- is the equivalent of "freezing time" available here.
-- Run via: supabase test db supabase/tests/cancellations-and-no-shows.sql
begin;
create extension if not exists pgtap;

select plan(53);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('c3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cns-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cns-manager@test.com',  '{"role": "agency"}'::jsonb,   '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('c3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cns-support@test.com',  '{"role": "support"}'::jsonb,  '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('c3a00000-0000-0000-0000-000000000001', 'Cancel Test Agency', 'Cancel Test Agency', 'cns-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('c3a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('c3a00000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'manager', now());

-- L1: fee_only day activity (instant confirm, default cancellation_policy).
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('c3100000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', 'cns-fee-only', 'CNS Fee-Only Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published');

-- L2: full_online day activity, explicit tiers (7d/100%, 3d/50%, 0d/0%).
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, payment_requirement, cancellation_policy)
values ('c3100000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000001', 'cns-full-online', 'CNS Full-Online Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', 'full_online', '{"tiers": [{"days": 7, "refund_percent": 100}, {"days": 3, "refund_percent": 50}, {"days": 0, "refund_percent": 0}]}'::jsonb);

select set_config('request.jwt.claims', '', true);

-- Helper to create a confirmed, fee-paid booking for a given listing/date/
-- pax, returning its id — every scenario below starts from this.
create or replace function cns_make_confirmed_booking(p_listing_id uuid, p_date date, p_pax integer, p_ref text)
returns uuid language plpgsql as $$
declare
  v_booking_id uuid;
  v_amount numeric;
  v_currency text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select booking_id, amount_due_now, currency into v_booking_id, v_amount, v_currency
  from public.create_booking_hold(p_listing_id, p_date, p_pax, jsonb_build_object('full_name', 'CNS Traveler', 'contact_email', 'cns-traveler@test.com', 'contact_phone', '+9779800000'));
  reset role;

  set local role service_role;
  perform public.mark_reservation_fee_paid(v_booking_id, 'test_provider', p_ref, v_amount, v_currency);
  reset role;

  return v_booking_id;
end;
$$;

-- ── 1. Day activity, traveler cancels 30h before -> fee refund 100% ─────

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 10, 1, 'cns-ref-1') as booking1 \gset
update public.booking_quotes set start_at = now() + interval '30 hours', end_at = now() + interval '31 hours'
where id = (select quote_id from public.bookings where id = :'booking1'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, 'change of plans') $f$, :'booking1'), '30h-before cancellation succeeds');
reset role;

select is((select booking_status from public.bookings where id = :'booking1'::uuid), 'cancelled', 'booking1: cancelled');
select is((select cancellation_reason_code from public.bookings where id = :'booking1'::uuid), 'traveler_cancelled', 'booking1: reason code recorded');
select is((select amount::numeric(12,2) from public.refund_records where booking_id = :'booking1'::uuid and kind = 'reservation_fee'), (select platform_fee from public.booking_quotes where id = (select quote_id from public.bookings where id = :'booking1'::uuid))::numeric(12,2), 'booking1: full fee refunded');
select is((select payer_side from public.refund_records where booking_id = :'booking1'::uuid and kind = 'reservation_fee'), 'platform', 'booking1: refund is platform-side');
select is((select count(*)::int from public.refund_records where booking_id = :'booking1'::uuid and kind = 'balance'), 0, 'booking1: no balance refund for a fee_only booking');

-- ── 2. Day activity, traveler cancels 10h before -> fee kept, no record ─

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 11, 1, 'cns-ref-2') as booking2 \gset
update public.booking_quotes set start_at = now() + interval '10 hours', end_at = now() + interval '11 hours'
where id = (select quote_id from public.bookings where id = :'booking2'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'booking2'), '10h-before cancellation still succeeds (fee just isn''t refunded)');
reset role;

select is((select booking_status from public.bookings where id = :'booking2'::uuid), 'cancelled', 'booking2: cancelled');
select is((select count(*)::int from public.refund_records where booking_id = :'booking2'::uuid), 0, 'booking2: no refund record at all (fee kept)');

-- ── 3. full_online day activity cancelled 30h before -> platform fee
--    refund + agency-owed balance refund, due in ~7 days ─────────────────

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000002'::uuid, current_date + 10, 1, 'cns-ref-3') as booking3 \gset
update public.booking_quotes set start_at = now() + interval '30 hours', end_at = now() + interval '31 hours'
where id = (select quote_id from public.bookings where id = :'booking3'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_cancel_booking('%s'::uuid, null) $f$, :'booking3'), 'full_online 30h-before cancellation succeeds');
reset role;

select is((select count(*)::int from public.refund_records where booking_id = :'booking3'::uuid and kind = 'reservation_fee' and payer_side = 'platform'), 1, 'booking3: platform fee refund record exists');
select is((select count(*)::int from public.refund_records where booking_id = :'booking3'::uuid and kind = 'balance' and payer_side = 'agency'), 1, 'booking3: agency balance refund record exists');
select is((select status from public.refund_records where booking_id = :'booking3'::uuid and kind = 'balance'), 'agency_owed', 'booking3: balance refund status is agency_owed');
select ok((select due_by - now() between interval '6 days 23 hours' and interval '7 days 1 hour' from public.refund_records where booking_id = :'booking3'::uuid and kind = 'balance'), 'booking3: balance refund due_by is ~7 days out');

-- ── 4. No-show: before grace -> error; within window -> no_show, no
--    refund records; after end+24h -> NO_SHOW_WINDOW_CLOSED ──────────────

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 12, 1, 'cns-ref-4') as booking4 \gset
update public.booking_quotes set start_at = now() - interval '5 minutes', end_at = now() + interval '23 hours 55 minutes'
where id = (select quote_id from public.bookings where id = :'booking4'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.agency_mark_no_show('%s'::uuid, null) $f$, :'booking4'),
  'P0001', 'GRACE_PERIOD_NOT_ELAPSED',
  'marking no-show before the grace period elapses fails'
);
reset role;

update public.booking_quotes set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where id = (select quote_id from public.bookings where id = :'booking4'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.agency_mark_no_show('%s'::uuid, 'did not show up') $f$, :'booking4'), 'marking no-show within the window succeeds');
reset role;

select is((select booking_status from public.bookings where id = :'booking4'::uuid), 'no_show', 'booking4: no_show');
select is((select count(*)::int from public.refund_records where booking_id = :'booking4'::uuid), 0, 'booking4: no refund records at all for a no-show');
select ok((select no_show_dispute_deadline - now() between interval '47 hours' and interval '49 hours' from public.bookings where id = :'booking4'::uuid), 'booking4: dispute deadline is ~48h out');

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 13, 1, 'cns-ref-4b') as booking4b \gset
update public.booking_quotes set start_at = now() - interval '40 hours', end_at = now() - interval '30 hours'
where id = (select quote_id from public.bookings where id = :'booking4b'::uuid);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.agency_mark_no_show('%s'::uuid, null) $f$, :'booking4b'),
  'P0001', 'NO_SHOW_WINDOW_CLOSED',
  'marking no-show after end+24h fails'
);
reset role;

-- ── 5. Dispute within 48h -> disputed; after -> error. Admin "agency
--    failed" -> full refunds + penalty + strike ──────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.traveler_dispute_no_show('%s'::uuid, 'I was there on time, the guide never arrived.') $f$, :'booking4'),
  'disputing a no-show within the 48h window succeeds'
);
reset role;

select is((select booking_status from public.bookings where id = :'booking4'::uuid), 'disputed', 'booking4: disputed');
select id as dispute4 from public.booking_disputes where booking_id = :'booking4'::uuid \gset

set local role service_role;
select set_config('request.jwt.claims', '', true);
update public.bookings set no_show_dispute_deadline = now() - interval '1 hour' where id = :'booking4'::uuid;
reset role;
-- (booking4 is already disputed, not no_show, so a SECOND dispute attempt
-- correctly fails on status, not the deadline — this just proves the
-- deadline check alone, via a fresh already-past-deadline no_show booking.)

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 14, 1, 'cns-ref-5') as booking5 \gset
update public.booking_quotes set start_at = now() - interval '3 hours', end_at = now() - interval '2 hours'
where id = (select quote_id from public.bookings where id = :'booking5'::uuid);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_mark_no_show(:'booking5'::uuid, null);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
update public.bookings set no_show_dispute_deadline = now() - interval '1 hour' where id = :'booking5'::uuid;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok(
  format($f$ select public.traveler_dispute_no_show('%s'::uuid, 'Too late, but still trying.') $f$, :'booking5'),
  'P0001', 'DISPUTE_WINDOW_CLOSED',
  'disputing a no-show after the 48h window fails'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.admin_resolve_dispute('%s'::uuid, 'traveler_was_present_agency_failed', null, 'Confirmed via GPS logs.') $f$, :'dispute4'),
  'support resolves the dispute as agency-failed'
);
reset role;

select is((select booking_status from public.bookings where id = :'booking4'::uuid), 'cancelled', 'booking4: cancelled after agency-failed resolution');
select is((select count(*)::int from public.refund_records where booking_id = :'booking4'::uuid and kind = 'reservation_fee'), 1, 'booking4: full fee refund after agency-failed resolution');
select is((select count(*)::int from public.agency_penalties where booking_id = :'booking4'::uuid and kind = 'agency_no_show'), 1, 'booking4: agency_penalties row created');
select is((select count(*)::int from public.agency_strikes where booking_id = :'booking4'::uuid and kind = 'agency_no_show'), 1, 'booking4: agency_strikes row created');
select is((select status from public.booking_disputes where id = :'dispute4'::uuid), 'resolved', 'dispute4: resolved');

-- ── 6. Weather disruption: reschedule (same price, new quote, old
--    reservation released) / choose refund / auto-refund on deadline ────

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 20, 1, 'cns-ref-6a') as booking6a \gset
select (select quote_id from public.bookings where id = :'booking6a'::uuid) as old_quote6a \gset
select (select inventory_reservation_id from public.booking_quotes where id = :'old_quote6a'::uuid) as old_reservation6a \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.agency_cancel_booking('%s'::uuid, 'conditions_weather', 'Storm warning') $f$, :'booking6a'),
  'agency reports a weather disruption'
);
reset role;

select is((select booking_status from public.bookings where id = :'booking6a'::uuid), 'cancel_requested', 'booking6a: cancel_requested after disruption report');
select is((select count(*)::int from public.booking_disruptions where booking_id = :'booking6a'::uuid and resolved_at is null), 1, 'booking6a: open disruption row exists');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(
  format($f$ select public.traveler_reschedule('%s'::uuid, current_date + 60) $f$, :'booking6a'),
  'traveler reschedules to a genuinely open date'
);
reset role;

select is((select booking_status from public.bookings where id = :'booking6a'::uuid), 'confirmed', 'booking6a: confirmed again after reschedule');
select isnt((select quote_id from public.bookings where id = :'booking6a'::uuid), :'old_quote6a'::uuid, 'booking6a: a new quote row was created');
select is((select product_value from public.booking_quotes where id = (select quote_id from public.bookings where id = :'booking6a'::uuid)), (select product_value from public.booking_quotes where id = :'old_quote6a'::uuid), 'booking6a: price is unchanged after reschedule');
select is((select status from public.inventory_reservations where id = :'old_reservation6a'::uuid), 'released', 'booking6a: old reservation released');
select is((select traveler_choice from public.booking_disruptions where booking_id = :'booking6a'::uuid), 'reschedule', 'booking6a: disruption resolved as reschedule');

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 21, 1, 'cns-ref-6b') as booking6b \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_cancel_booking(:'booking6b'::uuid, 'conditions_flight', 'Flights grounded');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select lives_ok(format($f$ select public.traveler_choose_refund('%s'::uuid) $f$, :'booking6b'), 'traveler chooses a refund instead');
reset role;

select is((select booking_status from public.bookings where id = :'booking6b'::uuid), 'cancelled', 'booking6b: cancelled after choosing refund');
select is((select count(*)::int from public.refund_records where booking_id = :'booking6b'::uuid and kind = 'reservation_fee'), 1, 'booking6b: full refund record created');

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 22, 1, 'cns-ref-6c') as booking6c \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_cancel_booking(:'booking6c'::uuid, 'conditions_safety', 'Trail closed by authorities');
reset role;

-- expire_disruption_choices() has NO execute grant to any role, including
-- service_role — it is reached only via pg_cron's own scheduling role
-- (postgres, same as every other truly-internal sweep in this schema), so
-- it is called here as the ambient superuser, never under an impersonated
-- role that lacks the grant.
select set_config('request.jwt.claims', '', true);
update public.booking_disruptions set choice_deadline = now() - interval '1 hour' where booking_id = :'booking6c'::uuid;
select public.expire_disruption_choices();

select is((select booking_status from public.bookings where id = :'booking6c'::uuid), 'cancelled', 'booking6c: auto-cancelled once the choice deadline passed');
select is((select traveler_choice from public.booking_disruptions where booking_id = :'booking6c'::uuid), 'refund', 'booking6c: disruption auto-resolved as refund');
select is((select count(*)::int from public.refund_records where booking_id = :'booking6c'::uuid and reason_code = 'disruption_refund_auto'), 1, 'booking6c: auto-refund record created');

-- ── 7. Auto-complete fires 24h after end_at; a disputed booking is not ──

select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 30, 1, 'cns-ref-7') as booking7 \gset
update public.booking_quotes set start_at = now() - interval '26 hours', end_at = now() - interval '25 hours'
where id = (select quote_id from public.bookings where id = :'booking7'::uuid);

-- complete_finished_bookings(), like expire_disruption_choices(), has no
-- execute grant to any role — called here as the ambient superuser.
select set_config('request.jwt.claims', '', true);
select public.complete_finished_bookings();

select is((select booking_status from public.bookings where id = :'booking7'::uuid), 'completed', 'booking7: auto-completed 24h after end_at');
select ok((select completed_at is not null from public.bookings where id = :'booking7'::uuid), 'booking7: completed_at is set');

-- A disputed booking, with an old end_at, must stay disputed —
-- complete_finished_bookings() only ever selects booking_status in
-- (confirmed, in_progress).
select cns_make_confirmed_booking('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 31, 1, 'cns-ref-8') as booking8 \gset
update public.booking_quotes set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where id = (select quote_id from public.bookings where id = :'booking8'::uuid);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.agency_mark_no_show(:'booking8'::uuid, null);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select public.traveler_dispute_no_show(:'booking8'::uuid, 'I really was there, please check the GPS logs.');
reset role;

select is((select booking_status from public.bookings where id = :'booking8'::uuid), 'disputed', 'booking8: disputed, not yet resolved');

select set_config('request.jwt.claims', '', true);
update public.booking_quotes set start_at = now() - interval '31 hours', end_at = now() - interval '30 hours' where id = (select quote_id from public.bookings where id = :'booking8'::uuid);
select public.complete_finished_bookings();

select is((select booking_status from public.bookings where id = :'booking8'::uuid), 'disputed', 'booking8: a disputed booking is never auto-completed');

-- ── 8. Idempotency: a second cancel_booking_internal call on an
--    already-cancelled booking is a safe no-op (no duplicate refund row) ─

-- cancel_booking_internal() has no execute grant to any role either —
-- called here as the ambient superuser, same reasoning as above.
select set_config('request.jwt.claims', '', true);
select lives_ok(
  format($f$ select public.cancel_booking_internal('%s'::uuid, 'traveler', 'traveler_cancelled', 100, 100) $f$, :'booking1'),
  'calling cancel_booking_internal a second time on an already-cancelled booking is a no-op'
);

select is((select count(*)::int from public.refund_records where booking_id = :'booking1'::uuid), 1, 'booking1: still exactly one refund record after the replay');

-- ── 9. Policy summary text ────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select ok((select array_length(public.booking_policy_summary(:'booking2'::uuid), 1) > 0), 'booking_policy_summary returns at least one sentence');
select ok((select public.booking_policy_summary(:'booking3'::uuid) @> array['If you''re paying the full amount online: cancel 7+ days before and get 100% of the total price back.']), 'booking_policy_summary reflects the full_online tiers from the quote snapshot');
reset role;

select set_config('request.jwt.claims', '', true);
select ok((select array_length(public.listing_policy_preview('c3100000-0000-0000-0000-000000000001'::uuid, current_date + 40, 1), 1) > 0), 'listing_policy_preview returns at least one sentence (no login required)');

select * from finish();
