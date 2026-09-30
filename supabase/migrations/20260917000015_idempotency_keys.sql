-- Edge-function hardening: idempotency support.
--
-- A client retrying a mutating POST (network blip, double-click, a proxy
-- replaying a request) must not repeat side effects — sending a second
-- confirmation email, writing a second audit row, etc. supabase/functions/
-- _shared/http.ts's withIdempotency() stores each mutating action's
-- response here, keyed by a client-supplied Idempotency-Key header plus
-- the caller and the function name, and replays the stored response on a
-- repeat call instead of re-running the handler.
-- ============================================================================

create table public.idempotency_keys (
  key         text not null,
  user_id     uuid not null,
  fn          text not null,
  response    jsonb not null,
  status      integer not null,
  created_at  timestamptz not null default now(),
  primary key (key, user_id, fn)
);

comment on table public.idempotency_keys is
  'Written exclusively by supabase/functions/_shared/http.ts''s withIdempotency() helper, using the service-role key — never by a client role directly (see RLS below). Rows older than 24h are swept by the cron job below; an Idempotency-Key is a short-lived retry-dedup token, not a permanent record.';

alter table public.idempotency_keys enable row level security;

-- No select/insert/update/delete policy for any client role at all — this
-- table is server-internal bookkeeping, exactly like inventory_reservations
-- (migration 20260916000005) and booking_status_history (migration
-- 20260916000007): written and read only via the service-role key inside
-- edge functions, never through PostgREST directly.

create extension if not exists pg_cron schema extensions;

select cron.schedule(
  'cleanup-idempotency-keys',
  '0 * * * *',
  $$delete from public.idempotency_keys where created_at < now() - interval '24 hours';$$
);
