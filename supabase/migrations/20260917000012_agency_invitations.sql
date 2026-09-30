-- Fixes audit M1
--
-- agency_users_manage_own_agency is FOR ALL — an owner could directly
-- INSERT a row for any user_id at all, self-selecting agency_role owner
-- or manager, with zero consent from the person being "added" (they'd
-- simply wake up as a member of an agency they never agreed to join, with
-- write access to its listings/departures). has_agency_access() also never
-- checked accepted_at, so even a properly-designed future invitation flow
-- would have been meaningless — any row, accepted or not, granted access.
-- ============================================================================

-- ── 1. has_agency_access(): require accepted_at is not null. Same
--    signature, same SECURITY DEFINER, same role ladder — only the
--    membership condition changes. ──────────────────────────────────────

create or replace function public.has_agency_access(target_agency_id uuid, min_role text default 'staff')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_users au
    where au.agency_id = target_agency_id
      and au.user_id = auth.uid()
      and au.removed_at is null
      and au.accepted_at is not null
      and (
        min_role = 'staff'
        or (min_role = 'manager' and au.agency_role in ('manager', 'owner'))
        or (min_role = 'owner' and au.agency_role = 'owner')
      )
  );
$$;

comment on function public.has_agency_access(uuid, text) is
  'True if the caller is an active (non-removed), CONSENTED (accepted_at is not null) member of the given agency, at or above min_role (staff < manager < owner). Audit M1: an invited-but-not-yet-accepted agency_users row grants no access at all — accept_agency_invitation (agency-invitations edge function) is what sets accepted_at, never a raw client insert. The owner row created during onboarding (agency-application edge function) sets accepted_at at creation time — an applicant consenting to their own application needs no separate accept step.';

-- ── 2. agency_invitations ────────────────────────────────────────────────

create table public.agency_invitations (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  email       citext not null,
  agency_role text not null check (agency_role in ('manager', 'staff')),
  -- owner is deliberately not an invitable role — ownership transfer is a
  -- materially different, higher-stakes operation than adding staff and is
  -- out of scope here (not built by this migration).
  token_hash  text not null unique,
  invited_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

comment on table public.agency_invitations is
  'Audit M1. token_hash stores sha-256(token), never the raw token — the agency-invitations edge function emails the raw token as a link and only ever looks rows up by its hash, the same pattern password-reset/email-confirm tokens use everywhere else in this stack. No client role has direct INSERT/UPDATE — invite/accept/revoke all go through that edge function (service_role).';

create index idx_agency_invitations_agency on public.agency_invitations (agency_id);
create index idx_agency_invitations_email on public.agency_invitations (email);

alter table public.agency_invitations enable row level security;

create policy "agency_invitations_select_owner"
  on public.agency_invitations for select
  using (public.has_agency_access(agency_id, 'owner'));

-- No insert/update/delete policy for any client role at all — see the
-- table comment above.

-- ── 3. Drop agency_users_manage_own_agency. agency_users_select_own_agency
--    (existing, using has_agency_access(agency_id)) is untouched — it
--    already correctly scopes to active+accepted members via the
--    has_agency_access() change above, with no policy edit needed. ────────

drop policy if exists "agency_users_manage_own_agency" on public.agency_users;

create or replace function public.remove_agency_member(p_agency_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_owner_count integer;
begin
  if not public.has_agency_access(p_agency_id, 'owner') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  select agency_role into v_target_role
  from public.agency_users
  where agency_id = p_agency_id and user_id = p_user_id and removed_at is null;

  if v_target_role is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_target_role = 'owner' then
    select count(*) into v_owner_count
    from public.agency_users
    where agency_id = p_agency_id and agency_role = 'owner' and removed_at is null;
    if v_owner_count <= 1 then
      raise exception 'CANNOT_REMOVE_LAST_OWNER' using errcode = 'P0001';
    end if;
  end if;

  update public.agency_users
  set removed_at = now()
  where agency_id = p_agency_id and user_id = p_user_id;

  -- Removed member loses messaging access to this agency's conversations
  -- immediately too, not just listings/departures write access.
  delete from public.conversation_participants cp
  using public.conversations c
  where cp.conversation_id = c.id
    and c.agency_id = p_agency_id
    and cp.user_id = p_user_id
    and cp.participant_role = 'agency';
end;
$$;

comment on function public.remove_agency_member(uuid, uuid) is
  'Audit M1. Owner-only. Soft-removes (removed_at, never deleted — preserves history per agency_users'' own design). Refuses to remove the last active owner. Also drops the member from every conversation_participants row for this agency''s conversations, so removal takes effect for messaging immediately, not just for has_agency_access()-gated writes.';

revoke execute on function public.remove_agency_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_agency_member(uuid, uuid) to authenticated;

create or replace function public.change_agency_member_role(p_agency_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_owner_count integer;
begin
  if not public.has_agency_access(p_agency_id, 'owner') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  select agency_role into v_target_role
  from public.agency_users
  where agency_id = p_agency_id and user_id = p_user_id and removed_at is null;

  if v_target_role is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_target_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.agency_users
    where agency_id = p_agency_id and agency_role = 'owner' and removed_at is null;
    if v_owner_count <= 1 then
      raise exception 'CANNOT_DEMOTE_LAST_OWNER' using errcode = 'P0001';
    end if;
  end if;

  update public.agency_users
  set agency_role = p_role
  where agency_id = p_agency_id and user_id = p_user_id;
end;
$$;

comment on function public.change_agency_member_role(uuid, uuid, text) is
  'Audit M1. Owner-only. Refuses to demote the last active owner away from owner (promoting someone TO owner, or changing between manager/staff, is unrestricted beyond the caller being an owner themselves). The agency_users_one_active_owner_per_user partial unique index below is the hard backstop for the "promote to owner" direction — this function does not need its own check for that, the index raises a unique-violation instead.';

revoke execute on function public.change_agency_member_role(uuid, uuid, text) from public, anon;
grant  execute on function public.change_agency_member_role(uuid, uuid, text) to authenticated;

-- ── 4. One active owner row per user, platform-wide (also relied on by
--    Prompt 9). Matches the assumption agency-application's own
--    save_draft/existingMembership lookup already makes (.maybeSingle() on
--    exactly this shape of query) — this makes that assumption a real,
--    enforced invariant instead of an implicit one. ────────────────────────

create unique index agency_users_one_active_owner_per_user
  on public.agency_users (user_id)
  where agency_role = 'owner' and removed_at is null;

-- ── agency_team_roster(): resolves active team members' display names/
--    emails for the frontend Team section. Not explicitly listed in the
--    prompt's migration items, but genuinely required infrastructure —
--    profiles_select_own only lets a user read their OWN profile row
--    (supabase/migrations/20260916000002_identity.sql), so a teammate's
--    name is otherwise unreadable by another member at all. Same shape/
--    reasoning as conversation_display_names() (audit C2): a SECURITY
--    DEFINER resolver scoped by the same membership check the underlying
--    rows are already gated by, rather than a broad grant onto profiles/
--    auth.users directly. ───────────────────────────────────────────────

create or replace function public.agency_team_roster(p_agency_id uuid)
returns table (
  membership_id uuid,
  user_id       uuid,
  display_name  text,
  email         text,
  agency_role   text,
  accepted_at   timestamptz,
  invited_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select au.id, au.user_id, coalesce(p.full_name, u.email::text), u.email::text,
         au.agency_role, au.accepted_at, au.invited_at
  from public.agency_users au
  join auth.users u on u.id = au.user_id
  left join public.profiles p on p.id = au.user_id
  where au.agency_id = p_agency_id
    and au.removed_at is null
    and public.has_agency_access(p_agency_id)
  order by au.invited_at asc;
$$;

comment on function public.agency_team_roster(uuid) is
  'Audit M1 frontend support. Returns active (non-removed) members of the given agency with a resolved display name/email — empty if the caller isn''t themselves an active member (has_agency_access gates every row, not just a top-level check, since this is a set-returning SQL function).';

revoke execute on function public.agency_team_roster(uuid) from public, anon;
grant  execute on function public.agency_team_roster(uuid) to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    the C2/H2/H3/H4/H5 migrations' own copies of this same extension). ────

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
      -- audit M1 additions: remove_agency_member/change_agency_member_role
      -- are owner-only (checked internally via has_agency_access(...,
      -- 'owner')); agency_team_roster is an RLS-equivalent resolver, same
      -- shape as conversation_display_names — all self-checking, same
      -- pattern as every other function already on this allowlist
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
