-- Scenario test (Prompt 23): every date/notice-period boundary in
-- get_bookable_dates() is computed in Asia/Kathmandu (UTC+05:45), never
-- the database server's or a naive UTC day boundary. p_now is frozen to
-- exact instants straddling local midnight to prove it.
-- Run via: supabase test db supabase/tests/timezone-edges.sql
begin;
create extension if not exists pgtap;

select plan(8);

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('d9a00000-0000-0000-0000-000000000001', 'D9 Timezone Agency', 'D9 Timezone Agency', 'd9-timezone-agency', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('d9a00000-0000-0000-0000-000000000001', 'approved', now(), now());

-- A plain day activity (default_start_time=07:00, min_advance_hours=24).
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, max_advance_days)
values ('d9100000-0000-0000-0000-000000000001', 'd9a00000-0000-0000-0000-000000000001', 'd9-day', 'D9 Day Trip', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', 365);

-- A listing starting just after local midnight, for the cross-midnight
-- notice-window check (default_start_time=00:30, min_advance_hours=2).
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status, default_start_time, min_advance_hours)
values ('d9100000-0000-0000-0000-000000000002', 'd9a00000-0000-0000-0000-000000000001', 'd9-predawn', 'D9 Pre-Dawn Departure', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 10, 'Easy', 'published', '00:30', 2);

select set_config('request.jwt.claims', '', true);

-- ── 1. too_far cutoff shifts by a whole day at the NPT midnight boundary,
--    not the UTC one — two p_now instants only 2 minutes apart in real
--    time, straddling 2026-01-02 00:00 NPT (= 2026-01-01 18:15 UTC). ─────

-- 2026-01-01 23:59 NPT = 2026-01-01 18:14 UTC. "Today" in NPT is Jan 1, so
-- the 365-day window's last open day is 2027-01-01.
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2027-01-01'::date, 1, '2026-01-01 18:14:00+00'::timestamptz),
  'open',
  '23:59 NPT Jan 1: day 365 out (Jan 1 2027) is still within the window'
);
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2027-01-02'::date, 1, '2026-01-01 18:14:00+00'::timestamptz),
  'too_far',
  '23:59 NPT Jan 1: day 366 out (Jan 2 2027) is too far'
);

-- 2026-01-02 00:01 NPT = 2026-01-01 18:16 UTC — only 2 minutes of REAL time
-- later, but "today" in NPT has already rolled over to Jan 2, so the
-- window''s last open day shifts to Jan 2 2027.
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2027-01-02'::date, 1, '2026-01-01 18:16:00+00'::timestamptz),
  'open',
  '00:01 NPT Jan 2 (2 min later in real time): day 365 out is now Jan 2 2027, which is open'
);
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2027-01-03'::date, 1, '2026-01-01 18:16:00+00'::timestamptz),
  'too_far',
  '00:01 NPT Jan 2: day 366 out (Jan 3 2027) is too far'
);

-- ── 2. The notice-period deadline is a real instant, not a date —
--    booking 2026-06-15 on the plain day listing needs p_now before
--    2026-06-14 07:00 NPT (= 2026-06-14 01:15 UTC). ──────────────────────

select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2026-06-15'::date, 1, '2026-06-14 01:14:00+00'::timestamptz),
  'open',
  '1 minute before the 24h notice deadline: still bookable'
);
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000001'::uuid, '2026-06-15'::date, 1, '2026-06-14 01:16:00+00'::timestamptz),
  'too_soon',
  '1 minute after the 24h notice deadline: too_soon'
);

-- ── 3. Cross-midnight notice window: a 00:30 NPT departure with a 2h
--    notice period has its deadline at 22:30 NPT the PREVIOUS day — the
--    deadline and the departure date are on different calendar days, and
--    the math must still land on the correct side of it. ────────────────
-- 2026-06-14 22:29 NPT = 2026-06-14 16:44 UTC (before the 22:30 deadline).

select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000002'::uuid, '2026-06-15'::date, 1, '2026-06-14 16:44:00+00'::timestamptz),
  'open',
  'pre-dawn departure: 1 minute before the previous-day 22:30 NPT deadline is still bookable'
);
select is(
  public.is_date_bookable('d9100000-0000-0000-0000-000000000002'::uuid, '2026-06-15'::date, 1, '2026-06-14 16:46:00+00'::timestamptz),
  'too_soon',
  'pre-dawn departure: 1 minute after the previous-day 22:30 NPT deadline is too_soon'
);

select * from finish();
