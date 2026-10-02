-- Tests for supabase/migrations/20260917000026_notifications_column_lock.sql
-- Run via: supabase test db supabase/tests/notifications-column-lock.sql
begin;
create extension if not exists pgtap;

select plan(7);

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('f5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f5-traveler@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

insert into public.domain_events (id, event_type, aggregate_type, aggregate_id, payload)
values ('f5e00000-0000-0000-0000-000000000001', 'AGENCY_APPROVED', 'agency', gen_random_uuid(), '{}'::jsonb);

insert into public.notifications (id, domain_event_id, recipient_id, channel, status, error_message, idempotency_key)
values ('f5f00000-0000-0000-0000-000000000001', 'f5e00000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001', 'in_app', 'sent', null, 'notif-lock-test-key');

-- ── Group 1: the recipient's own UPDATE can only ever change read_at ──────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'traveler'))::text, true);

-- Attempt to rewrite status/error_message/channel alongside read_at —
-- the UPDATE itself succeeds (no RLS violation, since recipient_id is
-- unchanged), but the trigger should silently re-pin everything except
-- read_at.
update public.notifications
set read_at = now(), status = 'failed', error_message = 'forged by recipient', channel = 'email'
where id = 'f5f00000-0000-0000-0000-000000000001';

reset role;

select is(
  (select read_at is not null from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  true,
  'recipient: read_at DID change — the one column they are allowed to touch'
);
select is(
  (select status from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  'sent',
  'recipient: status was re-pinned to its old value, not overwritten to failed'
);
select is(
  (select error_message from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  null,
  'recipient: error_message was re-pinned to null, not overwritten'
);
select is(
  (select channel from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  'in_app',
  'recipient: channel was re-pinned to in_app, not overwritten to email'
);

-- ── Group 2: service_role (dispatch-notifications' own write path) is
--    exempt — it can still update attempts/status/error_message/etc ──────

set local role service_role;

update public.notifications
set status = 'failed', attempts = 1, error_message = 'resend down', next_attempt_at = now() + interval '2 minutes'
where id = 'f5f00000-0000-0000-0000-000000000001';

reset role;

select is(
  (select status from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  'failed',
  'service_role: status update is NOT blocked by the lock trigger'
);
select is(
  (select attempts from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  1,
  'service_role: attempts update is NOT blocked by the lock trigger'
);

-- ── Group 3: claim_pending_notifications() (SECURITY DEFINER, runs as
--    the function owner/postgres) can still set claimed_at ──────────────

update public.notifications set next_attempt_at = now() - interval '1 minute' where id = 'f5f00000-0000-0000-0000-000000000001';
select public.claim_pending_notifications(10);

select is(
  (select claimed_at is not null from public.notifications where id = 'f5f00000-0000-0000-0000-000000000001'),
  true,
  'claim_pending_notifications() (SECURITY DEFINER) can still set claimed_at — not blocked by the lock trigger'
);

select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
