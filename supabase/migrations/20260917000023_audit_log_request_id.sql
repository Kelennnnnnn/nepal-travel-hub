-- Production observability, part 1: record_audit_log() has always had a
-- p_request_id column (migration 20260916000015_admin_and_audit.sql), but
-- three SQL functions that call it internally never had a way to receive
-- one from the edge function that invoked them — admin_suspend_agency()/
-- admin_reinstate_agency() (review-agency-application) and
-- delete_my_account() (delete-account) all wrote null there. Adding
-- p_request_id as a new trailing DEFAULT NULL parameter is backward
-- compatible in the sense that existing call sites (which never pass it)
-- keep working — but a bare `create or replace` with a DIFFERENT
-- parameter list creates a SEPARATE OVERLOAD rather than actually
-- replacing the old one (Postgres identifies functions by their full
-- argument-type signature, not by name alone), and Postgres then finds
-- the old zero/fewer-arg signature genuinely ambiguous against the new
-- one when called with the old arity ("function ... is not unique",
-- confirmed by running this migration once without the explicit drops
-- below and watching every existing pgTAP call site for these three
-- functions fail with exactly that error). Each old signature is
-- dropped explicitly first so exactly one version of each function ever
-- exists.
-- ============================================================================

drop function if exists public.admin_suspend_agency(uuid, text);
drop function if exists public.admin_reinstate_agency(uuid);
drop function if exists public.delete_my_account();

create or replace function public.admin_suspend_agency(p_agency_id uuid, p_reason text, p_request_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  select status into v_current_status from public.agency_verification where agency_id = p_agency_id;
  if v_current_status is null then
    raise exception 'AGENCY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current_status = 'suspended' then
    raise exception 'ALREADY_SUSPENDED' using errcode = 'P0001';
  end if;

  update public.agency_verification
  set status = 'suspended', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
  where agency_id = p_agency_id;

  update public.listings set status = 'paused' where agency_id = p_agency_id and status = 'published';

  perform public.record_audit_log(auth.uid(), 'agency_suspend', 'agency', p_agency_id::text, null, jsonb_build_object('reason', p_reason), p_request_id);

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('AGENCY_SUSPENDED', 'agency', p_agency_id, jsonb_build_object('reason', p_reason));
end;
$$;

comment on function public.admin_suspend_agency(uuid, text, text) is
  'Audit H5c. Admin-only (checked internally, not just via the grant). Rejects a duplicate suspend call (ALREADY_SUSPENDED) BEFORE any writes happen, so a repeat call produces no second audit row, no second domain event, and — since the edge function returns on this error before sending anything — no second email. Pauses every currently-published listing in the same transaction as the status change, closing the audit H5 gap where those two writes used to happen as separate, non-atomic statements. p_request_id (added for production observability) threads the calling edge function''s requestId into audit_logs.request_id.';

revoke execute on function public.admin_suspend_agency(uuid, text, text) from public, anon;
grant  execute on function public.admin_suspend_agency(uuid, text, text) to authenticated;

create or replace function public.admin_reinstate_agency(p_agency_id uuid, p_request_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  select status into v_current_status from public.agency_verification where agency_id = p_agency_id;
  if v_current_status is null then
    raise exception 'AGENCY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current_status = 'approved' then
    raise exception 'ALREADY_APPROVED' using errcode = 'P0001';
  end if;

  update public.agency_verification
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where agency_id = p_agency_id;

  perform public.record_audit_log(auth.uid(), 'agency_reinstate', 'agency', p_agency_id::text, null, null, p_request_id);

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('AGENCY_REINSTATED', 'agency', p_agency_id, '{}'::jsonb);
end;
$$;

comment on function public.admin_reinstate_agency(uuid, text) is
  'Audit H5c. Admin-only (checked internally). Rejects a duplicate reinstate call (ALREADY_APPROVED) before any writes. Listings are deliberately NOT auto-republished (matches the pre-existing behavior/comment in review-agency-application''s reinstate action) — an agency reinstated after suspension should review and manually republish each listing. p_request_id (added for production observability) threads the calling edge function''s requestId into audit_logs.request_id.';

revoke execute on function public.admin_reinstate_agency(uuid, text) from public, anon;
grant  execute on function public.admin_reinstate_agency(uuid, text) to authenticated;

create or replace function public.delete_my_account(p_request_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active_booking_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select count(*) into v_active_booking_count
  from public.bookings b
  join public.departures d on d.id = b.departure_id
  where b.traveler_id = v_uid
    and b.booking_status in ('pending_payment', 'payment_processing', 'confirmed', 'cancel_requested', 'in_progress')
    and d.departure_date >= current_date;

  if v_active_booking_count > 0 then
    raise exception 'ACTIVE_BOOKINGS' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.agency_users au
    where au.user_id = v_uid and au.agency_role = 'owner' and au.removed_at is null
      and not exists (
        select 1 from public.agency_users au2
        where au2.agency_id = au.agency_id and au2.agency_role = 'owner'
          and au2.removed_at is null and au2.user_id <> v_uid
      )
  ) then
    raise exception 'SOLE_AGENCY_OWNER' using errcode = 'P0001';
  end if;

  update public.agency_users
  set removed_at = now()
  where user_id = v_uid and removed_at is null;

  delete from public.wishlists where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.review_votes where user_id = v_uid;

  perform set_config('app.bypass_review_guard', 'true', true);
  update public.reviews set traveler_name = 'Former traveler' where traveler_id = v_uid;
  perform set_config('app.bypass_review_guard', 'false', true);

  update public.booking_guests bg
  set full_name = 'Deleted guest', date_of_birth = null,
      passport_number_encrypted = null, contact_phone = null, contact_email = null
  from public.bookings b
  where bg.booking_id = b.id and b.traveler_id = v_uid;

  update public.profiles
  set full_name = 'Deleted user', phone = null, avatar_url = null, deleted_at = now()
  where id = v_uid;

  perform public.record_audit_log(v_uid, 'account_deleted', 'user', v_uid::text, null, null, p_request_id);
end;
$$;

comment on function public.delete_my_account(text) is
  'The only path for a traveler/agency-staff account to delete itself. One transaction: refuses (ACTIVE_BOOKINGS / SOLE_AGENCY_OWNER) before changing anything if either condition holds; otherwise soft-removes agency memberships, deletes purely-personal rows (wishlists/notification_preferences/review_votes), and pseudonymizes everything else (reviews.traveler_name, booking_guests PII, profiles) rather than deleting it. Never touches bookings.booking_status, booking_quotes, messages, or conversation_participants — those stay exactly as they were, and stay valid, because the auth.users row this all still references is never deleted (see delete-account edge function). p_request_id (added for production observability) threads the calling edge function''s requestId into audit_logs.request_id.';

revoke execute on function public.delete_my_account(text) from public, anon;
grant  execute on function public.delete_my_account(text) to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern). Not
--    strictly necessary here (these three function NAMES are already
--    allowlisted — the guard matches on proname, not the full signature —
--    but the guard is redefined anyway for consistency with every other
--    migration that touches a function on it, so a future diff doesn't
--    have to wonder why this one didn't). ─────────────────────────────

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
      'admin_user_directory', 'admin_user_stats'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
