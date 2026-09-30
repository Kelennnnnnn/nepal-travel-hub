-- Rewrites account deletion: pseudonymize, don't hard-delete.
--
-- The old delete-account function deleted reviews first (unconditionally
-- destroying other travelers' ability to see honest feedback the moment
-- its author closes their account), then tried to cancel every non-
-- cancelled booking including completed/expired ones — which
-- guard_booking_status_transition's graph has never allowed
-- ("completed": ["disputed"], "expired": []) — and silently ignored the
-- resulting error. auth.admin.deleteUser() then failed anyway, because
-- bookings.traveler_id/booking_quotes.traveler_id/messages.sender_id/
-- review_votes.user_id/conversation_participants.user_id all reference
-- auth.users with no ON DELETE rule — a hard FK violation. Net result:
-- anyone who had ever booked anything lost their reviews and STILL
-- couldn't actually delete their account, with a raw Postgres error
-- surfaced to them either way.
--
-- Financial/booking records must be kept (tax/legal); personal data must
-- be removed. This migration never deletes a booking, a review, or the
-- auth.users row itself — it pseudonymizes what identifies the person
-- (profile, review author name, booking-guest PII, avatar) and leaves
-- the actual transaction/rating history intact. The auth user itself is
-- banned + its email/metadata scrubbed by the edge function afterward
-- (not this migration — see that function's own comment for why deleteUser
-- is never called).
-- ============================================================================

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set by delete_my_account() below. A non-null value means this account has been deleted (pseudonymized) — the auth.users row still exists (banned, email/metadata scrubbed by the delete-account edge function) so every FK referencing it (bookings.traveler_id, messages.sender_id, ...) stays valid, but the person behind it is gone.';

-- ── guard_review_fields (audit H3) unconditionally pins reviews.
--    traveler_name for any non-admin/non-service_role caller — including
--    the review's own author legitimately pseudonymizing their own name
--    via delete_my_account() below. Re-created here (full body, only the
--    trusted-context check changes) with one additional, narrow escape
--    hatch: a transaction-local GUC that only delete_my_account() itself
--    ever sets, immediately before its one reviews UPDATE. A client has no
--    way to set this — PostgREST only exposes table operations and grants
--    to specific functions, never arbitrary SQL/set_config() — so this
--    doesn't reopen the client-writable traveler_name path H3 closed. ────

create or replace function public.guard_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
  v_is_account_deletion boolean :=
    coalesce(nullif(current_setting('app.bypass_review_guard', true), ''), 'false') = 'true';
  v_is_trusted boolean := v_is_service_role or public.is_admin() or v_is_account_deletion;
begin
  if not v_is_trusted then
    if tg_op = 'INSERT' then
      select b.agency_id into new.agency_id from public.bookings b where b.id = new.booking_id;
      select p.full_name into new.traveler_name from public.profiles p where p.id = auth.uid();
      new.helpful_count := 0;
      new.is_flagged := false;
      new.is_featured := false;
      new.hidden_at := null;
      new.agency_response := null;
      new.agency_responded_at := null;
    else
      new.listing_id := old.listing_id;
      new.booking_id := old.booking_id;
      new.agency_id := old.agency_id;
      new.traveler_id := old.traveler_id;
      new.helpful_count := old.helpful_count;
      new.traveler_name := old.traveler_name;
      new.created_at := old.created_at;
      new.is_flagged := old.is_flagged;
      new.is_featured := old.is_featured;
      new.hidden_at := old.hidden_at;

      if not public.has_agency_access(new.agency_id, 'manager') then
        new.agency_response := old.agency_response;
        new.agency_responded_at := old.agency_responded_at;
      end if;
    end if;
  end if;

  if new.comment is not null and char_length(new.comment) not between 10 and 5000 then
    raise exception 'INVALID_COMMENT_LENGTH' using errcode = 'P0001';
  end if;
  if new.title is not null and char_length(new.title) > 150 then
    raise exception 'INVALID_TITLE_LENGTH' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_review_fields() is
  'Audit H3, extended for account deletion. Non-admin/non-service_role/non-account-deletion: on INSERT, agency_id/traveler_name are always server-derived; on UPDATE, everything except rating/title/comment (and agency_response/agency_responded_at, gated by a live manager+ check) is silently re-pinned to OLD. The account-deletion exemption is scoped to a transaction-local GUC only delete_my_account() ever sets, not a blanket "author can edit their own traveler_name" rule — that would reopen the exact client-writable path this trigger exists to close.';

create or replace function public.delete_my_account()
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

  -- ACTIVE_BOOKINGS: any booking still in a live status for a departure
  -- that hasn't happened yet. A stale pending_payment/payment_processing
  -- booking for a PAST departure is not blocking — it's already effectively
  -- moot and will be cleaned up by the existing inventory-expiry sweep
  -- regardless of this account's fate, not something account deletion
  -- itself needs to resolve.
  select count(*) into v_active_booking_count
  from public.bookings b
  join public.departures d on d.id = b.departure_id
  where b.traveler_id = v_uid
    and b.booking_status in ('pending_payment', 'payment_processing', 'confirmed', 'cancel_requested', 'in_progress')
    and d.departure_date >= current_date;

  if v_active_booking_count > 0 then
    raise exception 'ACTIVE_BOOKINGS' using errcode = 'P0001';
  end if;

  -- SOLE_AGENCY_OWNER: deleting the account of an agency's only owner
  -- would leave that agency with no one who can manage its team, review
  -- its documents, or receive payouts — refuse rather than orphan it.
  -- Co-owned agencies, and agencies where the caller is only manager/
  -- staff, are unaffected by this check.
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

  -- Soft-remove from every agency membership (safe now — the sole-owner
  -- case above already would have refused).
  update public.agency_users
  set removed_at = now()
  where user_id = v_uid and removed_at is null;

  delete from public.wishlists where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.review_votes where user_id = v_uid;

  -- Reviews are KEPT, never deleted — only the displayed name is
  -- pseudonymized. Other travelers' trust in the rating/review content
  -- stays intact; letting anyone erase their reviews by closing their
  -- account would make ratings unreliable exactly when there'd be the
  -- most incentive to do so (after a bad experience they left a review
  -- about). guard_review_fields (audit H3) otherwise pins traveler_name
  -- for any non-admin caller, including the review's own author — the
  -- transaction-local flag below is the narrow, client-unreachable
  -- exemption for exactly this one legitimate case (see that trigger's
  -- own updated comment).
  perform set_config('app.bypass_review_guard', 'true', true);
  update public.reviews set traveler_name = 'Former traveler' where traveler_id = v_uid;
  perform set_config('app.bypass_review_guard', 'false', true);

  -- Guest PII on the caller's own bookings. booking_guests has no direct
  -- user_id column (it's per-booking, not per-account) — scoped via
  -- bookings.traveler_id. The booking row itself, and booking_items/
  -- amounts, are untouched (financial/tax record).
  update public.booking_guests bg
  set full_name = 'Deleted guest', date_of_birth = null,
      passport_number_encrypted = null, contact_phone = null, contact_email = null
  from public.bookings b
  where bg.booking_id = b.id and b.traveler_id = v_uid;

  update public.profiles
  set full_name = 'Deleted user', phone = null, avatar_url = null, deleted_at = now()
  where id = v_uid;

  perform public.record_audit_log(v_uid, 'account_deleted', 'user', v_uid::text, null, null);
end;
$$;

comment on function public.delete_my_account() is
  'The only path for a traveler/agency-staff account to delete itself. One transaction: refuses (ACTIVE_BOOKINGS / SOLE_AGENCY_OWNER) before changing anything if either condition holds; otherwise soft-removes agency memberships, deletes purely-personal rows (wishlists/notification_preferences/review_votes), and pseudonymizes everything else (reviews.traveler_name, booking_guests PII, profiles) rather than deleting it. Never touches bookings.booking_status, booking_quotes, messages, or conversation_participants — those stay exactly as they were, and stay valid, because the auth.users row this all still references is never deleted (see delete-account edge function).';

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern). ──────

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
      -- onboarding-transaction additions
      'save_agency_draft', 'submit_agency_application',
      -- account-deletion addition: self-scoped to auth.uid(), same pattern
      -- as every other self-checking SECURITY DEFINER function already on
      -- this allowlist
      'delete_my_account'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
