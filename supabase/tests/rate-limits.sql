-- Tests for the rate_limits table + hit_rate_limit() RPC
-- (supabase/migrations/20260917000016_rate_limits.sql), added for audit M2's
-- per-IP contact-form rate limit.
-- Run via: supabase test db supabase/tests/rate-limits.sql
begin;
create extension if not exists pgtap;

select plan(10);

-- ── Group 1: no client role can call hit_rate_limit ────────────────────────

select ok(
  not has_function_privilege('anon', 'public.hit_rate_limit(text,int,int)'::regprocedure, 'EXECUTE'),
  'anon: hit_rate_limit has no EXECUTE grant'
);
select ok(
  not has_function_privilege('authenticated', 'public.hit_rate_limit(text,int,int)'::regprocedure, 'EXECUTE'),
  'authenticated: hit_rate_limit has no EXECUTE grant'
);
select ok(
  has_function_privilege('service_role', 'public.hit_rate_limit(text,int,int)'::regprocedure, 'EXECUTE'),
  'service_role: hit_rate_limit has an EXECUTE grant'
);

-- ── Group 2: allow/reject behaviour within a single window ─────────────────

set local role service_role;

select is(
  public.hit_rate_limit('test:bucket-a', 3, 3600),
  true,
  'call 1 of 3: allowed'
);
select is(
  public.hit_rate_limit('test:bucket-a', 3, 3600),
  true,
  'call 2 of 3: allowed'
);
select is(
  public.hit_rate_limit('test:bucket-a', 3, 3600),
  true,
  'call 3 of 3: allowed'
);
select is(
  public.hit_rate_limit('test:bucket-a', 3, 3600),
  false,
  'call 4 of 3: rejected — over the limit'
);
select is(
  public.hit_rate_limit('test:bucket-a', 3, 3600),
  false,
  'call 5 of 3: still rejected — the increment happens even on rejection, no free retries'
);

-- A different bucket is entirely independent of the one above.
select is(
  public.hit_rate_limit('test:bucket-b', 1, 3600),
  true,
  'a different bucket has its own independent counter'
);

reset role;

-- No client role can read the table directly either.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'rate_limits'),
  0,
  'rate_limits has zero RLS policies for any client role'
);

select * from finish();
rollback;
