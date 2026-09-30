-- Fixes audit M2 (part 1): generic rate-limit bucket, used first by
-- contact-form's per-IP limit (the existing per-email limit stays a plain
-- table query — no bucket abstraction needed for that one).
-- ============================================================================

create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);

comment on table public.rate_limits is
  'Generic fixed-window rate-limit counter. bucket identifies what''s being limited (e.g. "contact-form:ip:203.0.113.4"); window_start is the counting window''s start (truncated to window_seconds, so concurrent callers in the same window increment the SAME row instead of each creating their own). Written exclusively via hit_rate_limit() below — no client role has any grant on this table at all.';

alter table public.rate_limits enable row level security;

-- No select/insert/update/delete policy for any client role — this table
-- is server-internal bookkeeping, exactly like idempotency_keys
-- (migration 20260917000015): written and read only via hit_rate_limit(),
-- called from edge functions using the service-role key.

create or replace function public.hit_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Truncate "now" down to a window_seconds-wide bucket boundary, so every
  -- call within the same window addresses the same row regardless of
  -- exactly when within the window it lands.
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

comment on function public.hit_rate_limit(text, int, int) is
  'Audit M2. Atomically increments the counter for (p_bucket, current window of width p_window_seconds) and returns whether this call is still within p_limit — true means "allow", false means "reject, over the limit". The increment always happens (even on a rejected call) so a caller hammering past the limit doesn''t get free, uncounted retries.';

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant  execute on function public.hit_rate_limit(text, int, int) to service_role;

-- Old windows are small and cheap to keep briefly for debugging, but
-- shouldn't accumulate forever.
select cron.schedule(
  'cleanup-rate-limits',
  '0 * * * *',
  $$delete from public.rate_limits where window_start < now() - interval '24 hours';$$
);
