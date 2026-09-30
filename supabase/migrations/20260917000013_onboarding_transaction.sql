-- Fixes the agency-onboarding race/partial-write bugs
--
-- agency-application's save_draft looked up the caller's existing
-- membership with .maybeSingle() and then made three SEPARATE inserts
-- (agencies, agency_users, agency_verification) as three separate
-- PostgREST calls, each its own implicit transaction. Two concurrent
-- save_draft calls from the same user both read "no membership found"
-- before either commits, and both then try to create their own
-- agency+owner+verification set — the unique owner index (added
-- alongside audit M1, re-asserted idempotently below) turns the SECOND
-- concurrent agency_users insert into a 23505 conflict, but by then that
-- call has ALREADY inserted its own orphan `agencies` row with no owner
-- and no verification row — permanently stuck, invisible to the user (who
-- only ever sees whichever agency_id the FIRST call returned), and
-- undiscoverable without a manual DB query. Raw Postgres error text (e.g.
-- that same 23505 message) was also returned straight to the client.
--
-- Fix: collapse save_draft and submit into two SECURITY DEFINER functions,
-- each a single transaction, each opening with a session-scoped advisory
-- lock keyed on the caller's own uid — a second concurrent call from the
-- SAME user simply waits for the first to finish (and then sees its
-- result via the now-existing membership row) instead of racing it.
-- ============================================================================

-- ── 1. Re-assert the unique-owner-per-user index (audit M1) idempotently —
--    this migration must not assume M1 has already run in every
--    environment it's deployed to. ─────────────────────────────────────────

create unique index if not exists agency_users_one_active_owner_per_user
  on public.agency_users (user_id)
  where agency_role = 'owner' and removed_at is null;

-- ── 2. save_agency_draft(): the only path that creates or edits an
--    agency+owner+verification set during onboarding. ─────────────────────

create or replace function public.save_agency_draft(p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text := nullif(trim(coalesce(p_fields->>'companyName', '')), '');
  v_description  text := coalesce(p_fields->>'description', '');
  v_city         text := nullif(trim(coalesce(p_fields->>'city', '')), '');
  v_district     text := nullif(trim(coalesce(p_fields->>'district', '')), '');
  v_address      text := nullif(trim(coalesce(p_fields->>'address', '')), '');
  v_phone        text := nullif(trim(coalesce(p_fields->>'phone', '')), '');
  v_email        text := nullif(trim(coalesce(p_fields->>'email', '')), '');
  v_website      text := nullif(trim(coalesce(p_fields->>'website', '')), '');
  v_slug_base    text;
  v_agency_id    uuid;
  v_verification_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Serializes concurrent calls from the SAME user only (hashtext of their
  -- own uid) — unrelated users' onboarding flows never contend with each
  -- other. Released automatically at the end of this function's implicit
  -- transaction (pg_advisory_XACT_lock, not session-lock).
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  if v_company_name is null or char_length(v_company_name) < 2 or char_length(v_company_name) > 150 then
    raise exception 'INVALID_COMPANY_NAME' using errcode = 'P0001';
  end if;
  if char_length(v_description) > 5000 then
    raise exception 'INVALID_DESCRIPTION' using errcode = 'P0001';
  end if;
  if v_city is not null and char_length(v_city) > 100 then
    raise exception 'INVALID_CITY' using errcode = 'P0001';
  end if;
  if v_district is not null and char_length(v_district) > 100 then
    raise exception 'INVALID_DISTRICT' using errcode = 'P0001';
  end if;
  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
  end if;
  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'INVALID_PHONE' using errcode = 'P0001';
  end if;
  if v_email is not null and char_length(v_email) > 255 then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  if v_website is not null and char_length(v_website) > 300 then
    raise exception 'INVALID_WEBSITE' using errcode = 'P0001';
  end if;

  select au.agency_id into v_agency_id
  from public.agency_users au
  where au.user_id = auth.uid() and au.agency_role = 'owner' and au.removed_at is null;

  if v_agency_id is not null then
    select v.status into v_verification_status
    from public.agency_verification v where v.agency_id = v_agency_id;

    if v_verification_status not in ('draft', 'more_info_required', 'rejected') then
      raise exception 'CANNOT_EDIT_IN_STATUS' using errcode = 'P0001';
    end if;

    update public.agencies
    set legal_name = v_company_name, display_name = v_company_name, description = v_description,
        city = v_city, district = v_district, address = v_address, phone = v_phone,
        email = v_email, website = v_website
    where id = v_agency_id;

    return v_agency_id;
  end if;

  -- First time for this user: create agency + owner membership + draft
  -- verification row, all inside this same transaction — either all three
  -- exist or none do, closing the "orphan agency with no owner" failure
  -- mode entirely (no statement here can succeed while a LATER one in the
  -- same function fails and leaves the earlier one committed).
  v_slug_base := lower(regexp_replace(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));

  insert into public.agencies (legal_name, display_name, slug, description, city, district, address, phone, email, website)
  values (
    v_company_name, v_company_name,
    coalesce(nullif(v_slug_base, ''), 'agency') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_description, v_city, v_district, v_address, v_phone, v_email, v_website
  )
  returning id into v_agency_id;

  insert into public.agency_users (agency_id, user_id, agency_role, accepted_at)
  values (v_agency_id, auth.uid(), 'owner', now());

  insert into public.agency_verification (agency_id, status)
  values (v_agency_id, 'draft');

  return v_agency_id;
end;
$$;

comment on function public.save_agency_draft(jsonb) is
  'The only path that creates or edits an onboarding agency. One transaction (create-agency-and-owner-and-verification, or update-editable-fields, never split across separate calls), opened with an advisory lock keyed on the caller''s own uid so concurrent calls from the SAME user serialize instead of racing. Raises CANNOT_EDIT_IN_STATUS once the agency has left the editable states (draft/more_info_required/rejected) — an approved or submitted-and-under-review agency cannot have its fields silently rewritten this way.';

revoke execute on function public.save_agency_draft(jsonb) from public, anon;
grant  execute on function public.save_agency_draft(jsonb) to authenticated;

-- ── 3. submit_agency_application(): transitions draft/rejected/more_info_
--    required -> submitted. Takes no field arguments — the edge function
--    calls save_agency_draft() first (if the caller sent field edits) and
--    then this, as two separate calls; see that function's own comment
--    for why this stays two functions rather than one combined RPC. ──────

create or replace function public.submit_agency_application()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_verification_status text;
  v_missing text[];
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select au.agency_id into v_agency_id
  from public.agency_users au
  where au.user_id = auth.uid() and au.agency_role = 'owner' and au.removed_at is null;

  if v_agency_id is null then
    raise exception 'NO_APPLICATION_FOUND' using errcode = 'P0001';
  end if;

  select v.status into v_verification_status
  from public.agency_verification v where v.agency_id = v_agency_id
  for update;

  if v_verification_status not in ('draft', 'rejected', 'more_info_required') then
    raise exception 'CANNOT_SUBMIT_IN_STATUS' using errcode = 'P0001';
  end if;

  -- The CURRENT (non-superseded) document of each required type must be
  -- pending or approved — a rejected/expired current document, or no
  -- document at all, both count as missing (audit H4's own submit-time
  -- check, now enforced here instead of the edge function).
  select array_agg(t) into v_missing
  from unnest(array['tourism_license', 'pan_certificate']) as t
  where not exists (
    select 1 from public.agency_documents d
    where d.agency_id = v_agency_id and d.document_type = t and d.superseded_at is null
      and d.status in ('pending', 'approved')
  );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'MISSING_REQUIRED_DOCUMENTS' using errcode = 'P0001';
  end if;

  update public.agency_verification
  set status = 'submitted', submitted_at = now(), rejection_reason = null, info_requested_note = null
  where agency_id = v_agency_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('AGENCY_APPLICATION_SUBMITTED', 'agency', v_agency_id, '{}'::jsonb);

  return v_agency_id;
end;
$$;

comment on function public.submit_agency_application() is
  'The only path that transitions an agency''s verification status from draft/rejected/more_info_required to submitted. Locked (advisory + row-level FOR UPDATE on agency_verification) and single-transaction, same reasoning as save_agency_draft(). Document requirements are re-derived from live agency_documents here rather than trusted from the caller.';

revoke execute on function public.submit_agency_application() from public, anon;
grant  execute on function public.submit_agency_application() to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    the C2/H2/H3/H4/H5/M1 migrations' own copies of this same
--    extension). ─────────────────────────────────────────────────────────

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
    and p.prosecdef                                   -- SECURITY DEFINER only
    and p.prorettype <> 'trigger'::regtype              -- trigger functions are never PostgREST RPC-callable, regardless of grants — excluded so this guard stays focused on audit C1's actual exposure surface (anon/authenticated hitting /rest/v1/rpc/<fn>), not flagged as noise requiring its own allowlist entries
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      -- audit C2 additions
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      -- audit H2 additions
      'request_booking_cancellation', 'agency_set_trip_status',
      -- audit H3 additions
      'respond_to_review', 'is_own_review',
      -- audit H4 addition
      'replace_agency_document',
      -- audit H5/H7 additions
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency',
      -- audit M1 additions
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster',
      -- onboarding-transaction additions: both self-scoped to auth.uid()'s
      -- own membership, same pattern as every other self-checking
      -- SECURITY DEFINER function already on this allowlist
      'save_agency_draft', 'submit_agency_application'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
