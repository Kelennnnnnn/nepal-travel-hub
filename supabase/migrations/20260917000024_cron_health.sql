-- Production observability, part 2: an admin-only view into pg_cron's own
-- health. cron.job_run_details/cron.job are pg_cron-internal tables with
-- their own RLS (USING (username = CURRENT_USER)) — a SECURITY DEFINER
-- function owned by the same role that scheduled every job in this
-- project (postgres, via migrations) sees them all; no client role could
-- otherwise query cron.* directly at all.
-- ============================================================================

create or replace function public.cron_health()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_status text,
  last_start_time timestamptz,
  last_end_time timestamptz,
  is_healthy boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_support_or_admin()) then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  return query
  with latest_run as (
    select distinct on (jrd.jobid)
      jrd.jobid, jrd.status, jrd.start_time, jrd.end_time
    from cron.job_run_details jrd
    order by jrd.jobid, jrd.start_time desc nulls last
  )
  select
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    lr.status,
    lr.start_time,
    lr.end_time,
    coalesce(
      j.active
      and lr.status = 'succeeded'
      -- "Hasn't run in 5 minutes" (the literal ask) only makes sense for
      -- jobs that are SUPPOSED to run every minute — applying it as a flat
      -- rule to the hourly cleanup jobs would flag them unhealthy for 59
      -- minutes out of every 60, which isn't a real problem. Threshold is
      -- picked from the job's own schedule instead: 5 minutes for a
      -- per-minute job, 2 hours (2x) for an hourly one. Pattern-matched
      -- against this project's actual schedules (migrations 20260917000004/
      -- 20260917000015/16/18) — extend this if a genuinely different
      -- schedule shape is ever added.
      and (
        (j.schedule = '* * * * *' and lr.start_time > now() - interval '5 minutes')
        or (j.schedule <> '* * * * *' and lr.start_time > now() - interval '2 hours')
      ),
      false
    ) as is_healthy
  from cron.job j
  left join latest_run lr on lr.jobid = j.jobid
  order by j.jobname;
end;
$$;

comment on function public.cron_health() is
  'Admin dashboard cron-health card. One row per scheduled job with its most recent run''s status/timestamps and a computed is_healthy (active, last run succeeded, and within a schedule-appropriate freshness window — 5 minutes for a per-minute job, 2 hours for an hourly one). A job with no run history yet (lr.status null) reports is_healthy=false, not null — a job that has literally never run is not a healthy job.';

revoke execute on function public.cron_health() from public, anon;
grant  execute on function public.cron_health() to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern) —
--    cron_health() does its own internal is_admin()/is_support_or_admin()
--    check, same reasoning as every other function on this list. ────────

create or replace function public.audit_definer_exposure()
returns table(function_name text, arguments text, executable_by text[])
language sql
stable
as $$
  select
    p.proname::text,
    pg_get_function_identity_arguments(p.oid),
    array_remove(array[
      case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
      case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end
    ], null)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      'request_booking_cancellation', 'agency_set_trip_status',
      'respond_to_review', 'is_own_review',
      'replace_agency_document',
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency',
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster',
      'save_agency_draft', 'submit_agency_application',
      'delete_my_account',
      'admin_user_directory', 'admin_user_stats',
      'cron_health'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
