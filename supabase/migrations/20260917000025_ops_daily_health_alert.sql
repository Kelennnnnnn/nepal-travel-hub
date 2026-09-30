-- Production observability, part 3: a daily rollup alert. cron_health()
-- (previous migration) is pull-based (an admin has to open the dashboard
-- to see it) — this is the push side: once a day, check whether anything
-- actually went wrong in the last 24h and, if so, queue exactly one email
-- via the existing notification-dispatch pipeline rather than paging
-- anyone in real time for something that already happened and is already
-- being retried.
-- ============================================================================

create or replace function public.check_ops_daily_health()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failed_jobs jsonb;
  v_permanently_failed_notifications integer;
begin
  select coalesce(jsonb_agg(distinct jrd.jobid), '[]'::jsonb)
    into v_failed_jobs
    from cron.job_run_details jrd
    where jrd.status = 'failed' and jrd.start_time > now() - interval '24 hours';

  -- attempts >= 5 matches dispatch-notifications' own MAX_ATTEMPTS (audit
  -- item 4 of the earlier "fix email handling" prompt) — this is the same
  -- "permanently gave up" threshold, not a separate number invented here.
  select count(*) into v_permanently_failed_notifications
    from public.notifications
    where status = 'failed' and attempts >= 5;

  if jsonb_array_length(v_failed_jobs) > 0 or v_permanently_failed_notifications > 0 then
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
      'OPS_DAILY_HEALTH',
      'ops',
      gen_random_uuid(), -- no single real entity this event is "about" — a synthetic id, same as any other domain_event's required aggregate_id
      jsonb_build_object(
        'failed_job_ids', v_failed_jobs,
        'permanently_failed_notifications', v_permanently_failed_notifications,
        'checked_at', now()
      )
    );
  end if;
end;
$$;

comment on function public.check_ops_daily_health() is
  'Runs once a day (see the cron.schedule call below). Inserts an OPS_DAILY_HEALTH domain_event only when something is actually wrong — any cron job that failed in the last 24h, or any notification that has permanently failed (attempts>=5) — so a clean day produces zero events and zero email, not a daily "all good" noise message. dispatch-notifications (not this function) is what actually emails OPS_ALERT_EMAIL for it. No grant to any client role — invoked only by pg_cron as the database owner, same as trigger_dispatch_notifications().';

-- pg_cron runs scheduled jobs as the role that scheduled them (postgres,
-- the migration-applying role), which can always execute its own
-- functions regardless of grants — but Postgres grants EXECUTE to PUBLIC
-- by default on function creation unless revoked, so this still needs an
-- explicit revoke to actually keep it off anon/authenticated (caught by
-- audit_definer_exposure() below, which is exactly the guard this is for).
revoke execute on function public.check_ops_daily_health() from public, anon, authenticated;

-- 00:30 NPT = 18:45 UTC (NPT is UTC+5:45; the schedule below is always in
-- UTC, pg_cron has no timezone concept of its own).
select cron.schedule(
  'ops-daily-health-check',
  '45 18 * * *',
  $$select public.check_ops_daily_health();$$
);
