-- ============================================================================
-- Into Nepal — Phase 23: lock the booking engine down with tests, and give
-- admins visibility.
--
-- The test suite itself (rls-matrix.yaml extensions, pgTAP scenario files,
-- the genuinely-parallel concurrency scripts) lives outside migrations —
-- see supabase/tests/*.sql and scripts/concurrency/*.sh. This migration is
-- the one piece of schema this phase actually needs: a single read-only,
-- admin/support-only function that assembles one booking's full history
-- across every table that can write an event against it, for the new admin
-- booking-detail view.
-- ============================================================================

create or replace function public.admin_booking_timeline(p_booking_id uuid)
returns table(
  occurred_at timestamptz,
  source      text,
  event_type  text,
  summary     text,
  metadata    jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_support_or_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  return query
  select * from (
    select bh.created_at as occurred_at, 'status_history'::text as source, bh.event_type as event_type,
           bh.event_type || case when bh.metadata <> '{}'::jsonb then ' ' || bh.metadata::text else '' end as summary,
           bh.metadata as metadata
    from public.booking_status_history bh
    where bh.booking_id = p_booking_id

    union all

    select pe.received_at, 'payment_event'::text, pe.kind,
           format('%s payment of %s %s received via %s (ref %s)', pe.kind, pe.amount, pe.currency, pe.provider, pe.provider_ref),
           coalesce(pe.raw, '{}'::jsonb)
    from public.payment_events pe
    where pe.booking_id = p_booking_id

    union all

    select rr.created_at, 'refund_record'::text, rr.status,
           format('%s refund of %s %s (%s) — %s, payer: %s', rr.kind, rr.amount, rr.currency, rr.reason_code, rr.status, rr.payer_side),
           jsonb_build_object('payer_side', rr.payer_side, 'due_by', rr.due_by, 'provider_ref', rr.provider_ref)
    from public.refund_records rr
    where rr.booking_id = p_booking_id

    union all

    select bd.created_at, 'dispute'::text, bd.status,
           format('%s dispute opened (%s)%s', bd.kind, bd.status, case when bd.resolution is not null then format(' — resolved: %s', bd.resolution) else '' end),
           jsonb_build_object('statement', bd.statement, 'resolution', bd.resolution, 'opened_by', bd.opened_by, 'resolved_by', bd.resolved_by)
    from public.booking_disputes bd
    where bd.booking_id = p_booking_id

    union all

    select bdi.offered_at, 'disruption'::text, coalesce(bdi.traveler_choice, 'pending'),
           format('%s disruption reported — %s', bdi.reason_code, coalesce(bdi.traveler_choice, 'awaiting the traveler''s choice')),
           jsonb_build_object('note', bdi.note, 'choice_deadline', bdi.choice_deadline, 'resolved_at', bdi.resolved_at)
    from public.booking_disruptions bdi
    where bdi.booking_id = p_booking_id

    union all

    select n.created_at, 'notification'::text, n.channel,
           format('%s notification %s', n.channel, n.status),
           jsonb_build_object('status', n.status, 'recipient_id', n.recipient_id, 'error_message', n.error_message)
    from public.notifications n
    join public.domain_events de on de.id = n.domain_event_id
    where de.aggregate_type = 'booking' and de.aggregate_id = p_booking_id
  ) timeline
  order by occurred_at;
end;
$$;

comment on function public.admin_booking_timeline(uuid) is
  'One booking''s full event history — booking_status_history, payment_events, refund_records, booking_disputes, booking_disruptions, and every notifications row tied to a domain_event for this booking — merged into one chronological timeline. admin/support only. Powers the admin booking-detail view (Prompt 23).';

revoke all on function public.admin_booking_timeline(uuid) from public, anon;
grant execute on function public.admin_booking_timeline(uuid) to authenticated;

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
      'cron_health',
      'apply_blackout_preset', 'agency_close_date', 'get_bookable_dates',
      'create_booking_hold', 'release_booking_hold', 'get_booking_hold_status',
      'agency_respond_to_booking', 'respond_via_token', 'booking_summary_for_token',
      'suggest_alternatives',
      'compute_traveler_cancellation', 'traveler_cancel_booking', 'agency_cancel_booking',
      'traveler_reschedule', 'traveler_choose_refund',
      'agency_mark_no_show', 'traveler_dispute_no_show', 'traveler_report_agency_no_show',
      'admin_resolve_dispute', 'booking_policy_summary', 'listing_policy_preview',
      -- Phase 23 addition: re-derives privilege from is_support_or_admin(),
      -- never trusting the client-supplied booking id's ownership alone.
      'admin_booking_timeline'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
