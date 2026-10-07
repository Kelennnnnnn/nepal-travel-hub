-- Scenario test (Prompt 23): the one-tap accept/decline token — single
-- use, expiry, and that a token is structurally bound to the one booking
-- it was minted for (never a client-supplied booking id).
-- Run via: supabase test db supabase/tests/token-one-tap-accept-single-use.sql
begin;
create extension if not exists pgtap;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('da000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'da-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('daa00000-0000-0000-0000-000000000001', 'DA Token Agency', 'DA Token Agency', 'da-token-agency', 'Kathmandu', 'Solukhumbu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('daa00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values
  ('da100000-0000-0000-0000-000000000001', 'daa00000-0000-0000-0000-000000000001', 'da-trek-1', 'DA Trek One', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 50000, 10, 'Moderate', 'published'),
  ('da100000-0000-0000-0000-000000000002', 'daa00000-0000-0000-0000-000000000001', 'da-trek-2', 'DA Trek Two', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Trekking', 'Solukhumbu', '7 days', 7, 50000, 10, 'Moderate', 'published');
select set_config('request.jwt.claims', '', true);

create or replace function da_booking(p_listing_id uuid, p_date date, p_ref text)
returns uuid language plpgsql as $$
declare v_b uuid; v_amt numeric; v_cur text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'da000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select h.booking_id, h.amount_due_now, h.currency into v_b, v_amt, v_cur
  from public.create_booking_hold(p_listing_id, p_date, 1, jsonb_build_object('full_name', 'DA Traveler', 'contact_email', 'da-traveler@test.com', 'contact_phone', '+9779800000')) h;
  reset role;
  set local role service_role;
  perform public.mark_reservation_fee_paid(v_b, 'test_provider', p_ref, v_amt, v_cur);
  reset role;
  return v_b;
end;
$$;

select da_booking('da100000-0000-0000-0000-000000000001'::uuid, current_date + 30, 'da-ref-1') as ba \gset
select da_booking('da100000-0000-0000-0000-000000000002'::uuid, current_date + 31, 'da-ref-2') as bb \gset

select is((select booking_status from public.bookings where id = :'ba'::uuid), 'awaiting_agency_confirmation', 'booking A is awaiting confirmation');
select is((select booking_status from public.bookings where id = :'bb'::uuid), 'awaiting_agency_confirmation', 'booking B is awaiting confirmation');

-- Mint two distinct tokens (same sha-256 scheme respond_via_token uses).
insert into public.booking_action_tokens (booking_id, token_hash, purpose, expires_at)
values
  (:'ba'::uuid, encode(extensions.digest('da-raw-token-for-A', 'sha256'), 'hex'), 'agency_accept_decline', now() + interval '1 day'),
  (:'bb'::uuid, encode(extensions.digest('da-raw-token-for-B', 'sha256'), 'hex'), 'agency_accept_decline', now() + interval '1 day');

-- ── booking_summary_for_token: works, scoped to its own booking ────────

select is((select activity_title from public.booking_summary_for_token('da-raw-token-for-A')), 'DA Trek One', 'token A''s summary resolves to booking A''s listing');
select is((select activity_title from public.booking_summary_for_token('da-raw-token-for-B')), 'DA Trek Two', 'token B''s summary resolves to booking B''s listing');

-- ── Accept via token A ───────────────────────────────────────────────────

select lives_ok($$ select public.respond_via_token('da-raw-token-for-A', true, null) $$, 'token A accepts once');
select is((select booking_status from public.bookings where id = :'ba'::uuid), 'confirmed', 'booking A is now confirmed');
select is((select booking_status from public.bookings where id = :'bb'::uuid), 'awaiting_agency_confirmation', 'booking B is untouched by token A''s action — a token can never act on a booking it wasn''t minted for');

-- ── Reuse fails ──────────────────────────────────────────────────────────

select throws_ok(
  $$ select public.respond_via_token('da-raw-token-for-A', true, null) $$,
  'P0001', 'TOKEN_ALREADY_USED',
  'reusing the same token fails'
);

-- ── An expired token fails even though it is otherwise valid ───────────

insert into public.booking_action_tokens (booking_id, token_hash, purpose, expires_at)
values (:'bb'::uuid, encode(extensions.digest('da-raw-token-expired', 'sha256'), 'hex'), 'agency_accept_decline', now() - interval '1 minute');
select throws_ok(
  $$ select public.respond_via_token('da-raw-token-expired', true, null) $$,
  'P0001', 'TOKEN_EXPIRED',
  'an expired token is rejected'
);

-- ── An unknown token fails cleanly ───────────────────────────────────────

select throws_ok(
  $$ select public.respond_via_token('da-raw-token-that-never-existed', true, null) $$,
  'P0001', 'INVALID_TOKEN',
  'an unknown token is rejected'
);

select * from finish();
