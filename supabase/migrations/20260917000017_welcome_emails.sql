-- Fixes the welcome-email dead path: send-welcome-email's own header
-- claimed a pg_net trigger called it whenever email_confirmed_at
-- transitioned from NULL to a timestamp — no such trigger, or any pg_net
-- call anywhere, actually exists in this migration history (checked: zero
-- matches for pg_net/net.http_post/send-welcome-email across every
-- migration file). The welcome email has never sent to a single real user.
--
-- welcome_emails is the atomic dedupe table for the real fix (send-
-- welcome-email itself, called from the frontend after a session is
-- established with email_confirmed_at set — see src/stores/authStore.ts):
-- an `insert ... on conflict do nothing returning user_id` is what makes
-- two concurrent calls for the same user result in exactly one send, not
-- a check-then-send race.
-- ============================================================================

create table public.welcome_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.welcome_emails is
  'One row per user who has been sent the welcome email. send-welcome-email inserts this row FIRST (on conflict do nothing) and only actually sends if its own insert won the race; if sending then fails, it deletes the row so a later retry is possible. No client role has any grant here — service_role only.';

alter table public.welcome_emails enable row level security;

-- No select/insert/update/delete policy for any client role — server-
-- internal bookkeeping, same shape as idempotency_keys/rate_limits.
