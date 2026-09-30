-- Tests for the notification-dispatch worker's DB layer
-- (supabase/migrations/20260917000018_notification_dispatch.sql), added
-- for audit item 4. dispatch-notifications (the edge function) itself is
-- exercised by hand/HTTP, not here — this covers what pgTAP can reach:
-- the claim/lease RPCs, finalize_domain_event(), lookup_user_id_by_email(),
-- and the NEW_MESSAGE trigger.
-- Run via: supabase test db supabase/tests/notification-dispatch.sql
begin;
create extension if not exists pgtap;

select plan(25);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd1-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd1-agency-owner@test.com', '{"role": "agency"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d1a00000-0000-0000-0000-000000000001', 'D1 Test Agency', 'D1 Test Agency', 'd1-test-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d1a00000-0000-0000-0000-000000000001', 'approved', now(), now());
insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
values ('d1a00000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'owner', now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('d1100000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'd1-test-listing', 'D1 Test Listing', 'A test listing with a long enough description to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

select set_config('request.jwt.claims', '', true);

-- ── Group 1: no client role can call any of the four new RPCs ─────────────

select ok(not has_function_privilege('anon', 'public.claim_domain_events(int)'::regprocedure, 'EXECUTE'), 'anon: claim_domain_events has no EXECUTE grant');
select ok(not has_function_privilege('authenticated', 'public.claim_domain_events(int)'::regprocedure, 'EXECUTE'), 'authenticated: claim_domain_events has no EXECUTE grant');
select ok(has_function_privilege('service_role', 'public.claim_domain_events(int)'::regprocedure, 'EXECUTE'), 'service_role: claim_domain_events has an EXECUTE grant');

select ok(not has_function_privilege('authenticated', 'public.claim_pending_notifications(int)'::regprocedure, 'EXECUTE'), 'authenticated: claim_pending_notifications has no EXECUTE grant');
select ok(has_function_privilege('service_role', 'public.claim_pending_notifications(int)'::regprocedure, 'EXECUTE'), 'service_role: claim_pending_notifications has an EXECUTE grant');

select ok(not has_function_privilege('authenticated', 'public.finalize_domain_event(uuid)'::regprocedure, 'EXECUTE'), 'authenticated: finalize_domain_event has no EXECUTE grant');
select ok(has_function_privilege('service_role', 'public.finalize_domain_event(uuid)'::regprocedure, 'EXECUTE'), 'service_role: finalize_domain_event has an EXECUTE grant');

select ok(not has_function_privilege('authenticated', 'public.lookup_user_id_by_email(text)'::regprocedure, 'EXECUTE'), 'authenticated: lookup_user_id_by_email has no EXECUTE grant');
select ok(has_function_privilege('service_role', 'public.lookup_user_id_by_email(text)'::regprocedure, 'EXECUTE'), 'service_role: lookup_user_id_by_email has an EXECUTE grant');

-- ── Group 2: claim_domain_events() leases oldest-first and respects the lease ─

set local role service_role;

insert into public.domain_events (id, event_type, aggregate_type, aggregate_id, created_at)
values
  ('d1e00000-0000-0000-0000-000000000001', 'AGENCY_APPROVED', 'agency', 'd1a00000-0000-0000-0000-000000000001', now() - interval '3 minutes'),
  ('d1e00000-0000-0000-0000-000000000002', 'AGENCY_APPROVED', 'agency', 'd1a00000-0000-0000-0000-000000000001', now() - interval '2 minutes'),
  ('d1e00000-0000-0000-0000-000000000003', 'AGENCY_APPROVED', 'agency', 'd1a00000-0000-0000-0000-000000000001', now() - interval '1 minute');

select is(
  (select array_agg(id order by created_at) from public.claim_domain_events(2)),
  array['d1e00000-0000-0000-0000-000000000001'::uuid, 'd1e00000-0000-0000-0000-000000000002'::uuid],
  'claim_domain_events(2) returns the 2 oldest unprocessed events'
);

select is(
  (select count(*)::int from public.claim_domain_events(10)),
  1,
  'a second call only returns the 1 event NOT already leased (the other 2 are within their 2-minute lease)'
);

update public.domain_events set claimed_at = now() - interval '5 minutes' where id = 'd1e00000-0000-0000-0000-000000000001';

select is(
  (select array_agg(id) from public.claim_domain_events(10)),
  array['d1e00000-0000-0000-0000-000000000001'::uuid],
  'an event whose lease has gone stale (older than 2 minutes) becomes reclaimable again'
);

-- ── Group 3: claim_pending_notifications() picks up queued + due retries only ─

insert into public.notifications (id, domain_event_id, recipient_id, channel, status, attempts, next_attempt_at, idempotency_key) values
  ('d1f00000-0000-0000-0000-000000000001', 'd1e00000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'email', 'queued', 0, now(), 'd1e1:owner:email'),
  ('d1f00000-0000-0000-0000-000000000002', 'd1e00000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'email', 'failed', 1, now() - interval '1 minute', 'd1e2:owner:email'),
  ('d1f00000-0000-0000-0000-000000000003', 'd1e00000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'email', 'failed', 1, now() + interval '10 minutes', 'd1e3:owner:email'),
  ('d1f00000-0000-0000-0000-000000000004', 'd1e00000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'email', 'failed', 5, now() - interval '1 minute', 'd1e3:owner:email:exhausted');

select is(
  (select array_agg(id order by id) from public.claim_pending_notifications(10)),
  array['d1f00000-0000-0000-0000-000000000001'::uuid, 'd1f00000-0000-0000-0000-000000000002'::uuid],
  'claim_pending_notifications() returns the queued row and the due (backoff elapsed, attempts<5) failed row — not the not-yet-due retry or the exhausted (attempts=5) one'
);

-- ── Group 4: finalize_domain_event() only finalizes once nothing is pending ──

select is(
  (select processed_at is null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000001'),
  true,
  'sanity: event 1 starts unprocessed (its notification is still queued)'
);

select public.finalize_domain_event('d1e00000-0000-0000-0000-000000000001');

select is(
  (select processed_at is null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000001'),
  true,
  'finalize_domain_event() is a no-op while its notification is still queued'
);

update public.notifications set status = 'sent', sent_at = now() where id = 'd1f00000-0000-0000-0000-000000000001';
select public.finalize_domain_event('d1e00000-0000-0000-0000-000000000001');

select is(
  (select processed_at is not null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000001'),
  true,
  'finalize_domain_event() marks the event processed once its only notification is sent'
);

-- Event 3 has two notifications: one exhausted-failed (attempts=5) and one
-- still-retryable failed (attempts=1, due in the future) — should NOT finalize.
select is(
  (select processed_at is null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000003'),
  true,
  'sanity: event 3 starts unprocessed'
);
select public.finalize_domain_event('d1e00000-0000-0000-0000-000000000003');
select is(
  (select processed_at is null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000003'),
  true,
  'finalize_domain_event() does not finalize while ANY notification is still retryable, even if another for the same event is permanently failed'
);

update public.notifications set attempts = 5 where id = 'd1f00000-0000-0000-0000-000000000003';
select public.finalize_domain_event('d1e00000-0000-0000-0000-000000000003');
select is(
  (select processed_at is not null from public.domain_events where id = 'd1e00000-0000-0000-0000-000000000003'),
  true,
  'finalize_domain_event() finalizes once every notification for the event is either sent or permanently failed'
);

-- ── Group 5: lookup_user_id_by_email() ─────────────────────────────────────

select is(
  public.lookup_user_id_by_email('d1-traveler@test.com'),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'lookup_user_id_by_email() finds an existing user (case-insensitive column, exact-case lookup)'
);
select is(
  public.lookup_user_id_by_email('D1-TRAVELER@TEST.COM'),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'lookup_user_id_by_email() is case-insensitive'
);
select is(
  public.lookup_user_id_by_email('nobody-with-this-email@test.com'),
  null,
  'lookup_user_id_by_email() returns null for an email with no account'
);

reset role;

-- ── Group 6: NEW_MESSAGE domain event is emitted on message insert ────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

select public.start_conversation('d1a00000-0000-0000-0000-000000000001'::uuid, 'd1100000-0000-0000-0000-000000000001'::uuid) as conv_id \gset

insert into public.messages (id, conversation_id, sender_id, content)
values ('d1900000-0000-0000-0000-000000000001', :'conv_id'::uuid, 'd1000000-0000-0000-0000-000000000001', 'Hello, is this trip still available?');

reset role;

select is(
  (select count(*)::int from public.domain_events where event_type = 'NEW_MESSAGE' and aggregate_id = 'd1900000-0000-0000-0000-000000000001'),
  1,
  'inserting a message emits exactly one NEW_MESSAGE domain_event'
);
select is(
  (select payload->>'conversation_id' from public.domain_events where event_type = 'NEW_MESSAGE' and aggregate_id = 'd1900000-0000-0000-0000-000000000001'),
  :'conv_id',
  'the NEW_MESSAGE event payload carries the correct conversation_id'
);
select is(
  (select payload->>'sender_id' from public.domain_events where event_type = 'NEW_MESSAGE' and aggregate_id = 'd1900000-0000-0000-0000-000000000001'),
  'd1000000-0000-0000-0000-000000000001',
  'the NEW_MESSAGE event payload carries the correct sender_id'
);

select * from finish();
rollback;
