-- Fixes audit C2
--
-- conversation_participants_insert_self let any signed-in user add THEMSELVES
-- as a participant of ANY conversation (the policy only checked user_id =
-- auth.uid(), never whether the caller had any legitimate relationship to
-- that conversation) — then read every message and attachment in it, and
-- pick participant_role 'support' or 'agency' for themselves, impersonating
-- a role they don't hold. conversations_insert_traveler was `with check
-- (true)`, letting any signed-in user create a conversation row for ANY
-- agency_id. Neither table may be written to directly by a client anymore;
-- all conversation/participant creation now goes through the SECURITY
-- DEFINER functions below, which apply the actual authorization rules the
-- old bare-INSERT policies were supposed to enforce.
--
-- This migration also adds the columns the frontend (src/hooks/useMessages.ts)
-- needs to list conversations sanely (listing_id/traveler_id/last_message_at
-- didn't exist — the old frontend was written against a schema that was
-- never actually migrated) — see the same prompt's frontend rewrite.
-- ============================================================================

-- ── 1. Close the two open-write policies. No client role may INSERT into
--    conversations or conversation_participants directly anymore. ──────────

drop policy if exists "conversation_participants_insert_self" on public.conversation_participants;
drop policy if exists "conversations_insert_traveler" on public.conversations;

-- ── 2. Columns the frontend needs, plus the uniqueness/last-message-tracking
--    machinery start_conversation() and the messages trigger below rely on ──

alter table public.conversations
  add column listing_id      uuid references public.listings(id),
  add column traveler_id     uuid references auth.users(id),
  add column last_message_at timestamptz;

comment on column public.conversations.traveler_id is
  'The traveler side of this conversation. Nullable because conversations were originally agency_id + booking_id only — every conversation created via start_conversation() below always sets this, but existing rows (pre-migration, if any were ever created despite RLS-04) may not have it.';
comment on column public.conversations.listing_id is
  'Optional: the listing this inquiry is about, if any (a traveler can also message an agency generally, listing_id null).';

-- A traveler has at most one conversation per (traveler_id, agency_id,
-- listing_id) — coalesced to a sentinel nil UUID for the listing_id-null
-- case, since two NULLs never compare equal for uniqueness purposes.
-- start_conversation() below is idempotent against this exact key.
create unique index conversations_traveler_agency_listing_key
  on public.conversations (traveler_id, agency_id, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where traveler_id is not null;

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

comment on function public.touch_conversation_last_message() is
  'Keeps conversations.last_message_at current for list-sorting. SECURITY DEFINER because the inserting participant has no UPDATE grant on conversations (only conversations_admin_all covers UPDATE) — this is the one narrow write they need to make on that table, scoped to exactly this column by what the trigger body does.';

revoke execute on function public.touch_conversation_last_message() from public, anon, authenticated;

drop trigger if exists touch_conversation_last_message on public.messages;
create trigger touch_conversation_last_message
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

-- ── 3. start_conversation(): the ONLY way a conversation + the traveler's
--    own participant row + the agency's staff participant rows get created ─

create or replace function public.start_conversation(
  p_agency_id  uuid,
  p_listing_id uuid default null,
  p_booking_id uuid default null,
  p_subject    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_traveler_id uuid := auth.uid();
  v_listing_key uuid := coalesce(p_listing_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_conversation_id uuid;
  v_subject text := nullif(left(coalesce(p_subject, ''), 200), '');
begin
  if v_traveler_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if not public.is_agency_publicly_approved(p_agency_id) then
    raise exception 'AGENCY_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if p_listing_id is not null and not exists (
    select 1 from public.listings l
    where l.id = p_listing_id and l.agency_id = p_agency_id and l.status = 'published'
  ) then
    raise exception 'LISTING_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id = p_booking_id and b.traveler_id = v_traveler_id and b.agency_id = p_agency_id
  ) then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select id into v_conversation_id
  from public.conversations
  where traveler_id = v_traveler_id
    and agency_id = p_agency_id
    and coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_listing_key;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (agency_id, traveler_id, listing_id, booking_id, subject)
  values (p_agency_id, v_traveler_id, p_listing_id, p_booking_id, v_subject)
  on conflict (traveler_id, agency_id, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid))
    where traveler_id is not null
  do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    -- Lost a create race to a concurrent call with the same key — the row
    -- exists now (just not returned by this statement), fetch it.
    select id into v_conversation_id
    from public.conversations
    where traveler_id = v_traveler_id
      and agency_id = p_agency_id
      and coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_listing_key;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, participant_role)
  values (v_conversation_id, v_traveler_id, 'traveler')
  on conflict (conversation_id, user_id) do nothing;

  insert into public.conversation_participants (conversation_id, user_id, participant_role)
  select v_conversation_id, au.user_id, 'agency'
  from public.agency_users au
  where au.agency_id = p_agency_id and au.removed_at is null and au.accepted_at is not null
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

comment on function public.start_conversation(uuid, uuid, uuid, text) is
  'The only entry point for creating a conversation (audit C2). Validates the agency is publicly approved, the listing (if given) actually belongs to that agency and is published, and the booking (if given) belongs to the calling traveler and that agency — then creates the conversation, the caller as participant_role ''traveler'', and every active accepted agency member as ''agency''. Idempotent on (traveler_id, agency_id, listing_id): calling it again with the same key returns the existing conversation id rather than creating a duplicate.';

revoke execute on function public.start_conversation(uuid, uuid, uuid, text) from public, anon;
grant  execute on function public.start_conversation(uuid, uuid, uuid, text) to authenticated;

-- ── 4. add_agency_member_to_conversation(): the only way a conversation gets
--    a NEW agency participant after creation (e.g. a manager looping in a
--    colleague who joined the agency after the thread started) ────────────

create or replace function public.add_agency_member_to_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  select agency_id into v_agency_id from public.conversations where id = p_conversation_id;
  if v_agency_id is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.agency_users au
    where au.agency_id = v_agency_id and au.user_id = p_user_id
      and au.removed_at is null and au.accepted_at is not null
  ) then
    raise exception 'NOT_AN_AGENCY_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.conversation_participants (conversation_id, user_id, participant_role)
  values (p_conversation_id, p_user_id, 'agency')
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

comment on function public.add_agency_member_to_conversation(uuid, uuid) is
  'Lets a manager+ of a conversation''s agency add a colleague as a participant. Both ends are checked against the LIVE agency_users table, not trusted from the caller: the caller must themselves be manager+ of that specific conversation''s agency, and the person being added must be an active, accepted member of that same agency — this is what stops the old conversation_participants_insert_self hole (audit C2) from reopening in a different shape.';

revoke execute on function public.add_agency_member_to_conversation(uuid, uuid) from public, anon;
grant  execute on function public.add_agency_member_to_conversation(uuid, uuid) to authenticated;

-- ── 5. conversation_display_names(): the only way a client resolves
--    participant user_ids to a name to show in the UI ─────────────────────

create or replace function public.conversation_display_names(p_conversation_id uuid)
returns table (user_id uuid, display_name text, participant_role text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_conversation_participant(p_conversation_id) or public.is_support_or_admin()) then
    return;
  end if;

  return query
  select
    cp.user_id,
    case
      when cp.participant_role = 'agency' then coalesce(a.display_name, 'Agency')
      else coalesce(pr.full_name, 'Traveler')
    end as display_name,
    cp.participant_role
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join public.profiles pr on pr.id = cp.user_id and cp.participant_role <> 'agency'
  left join public.agencies a on a.id = c.agency_id and cp.participant_role = 'agency'
  where cp.conversation_id = p_conversation_id;
end;
$$;

comment on function public.conversation_display_names(uuid) is
  'Resolves participant user_ids to a display name for the message UI, without exposing profiles/agencies to anyone who isn''t a participant (or support/admin) of this specific conversation. SECURITY DEFINER so it can read profiles.full_name/agencies.display_name regardless of the caller''s own RLS visibility into those tables; the participant-or-support gate at the top is what keeps that safe.';

revoke execute on function public.conversation_display_names(uuid) from public, anon;
grant  execute on function public.conversation_display_names(uuid) to authenticated;

-- ── 6. Message content length (target §25 input validation — never enforced
--    before; a client could insert an empty or unbounded-length message) ───

alter table public.messages
  add constraint messages_content_length check (char_length(content) between 1 and 5000);

-- ── 7. Rate limit: at most 30 messages per sender per rolling 5 minutes.
--    SECURITY DEFINER so the count is exact regardless of the caller's own
--    RLS-visible conversation set (which, by construction, is every
--    conversation they've ever sent a message in anyway — but this doesn't
--    rely on that invariant staying true). ──────────────────────────────────

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  select count(*) into v_recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '5 minutes';

  if v_recent_count >= 30 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_message_rate_limit() is
  'Blunt per-sender rate limit (audit C2 acceptance check: 31st message within 5 minutes -> RATE_LIMITED). Counts across ALL of the sender''s conversations, not just this one — a message-spam abuse path is just as real against a single victim as against many.';

revoke execute on function public.enforce_message_rate_limit() from public, anon, authenticated;

drop trigger if exists enforce_message_rate_limit on public.messages;
create trigger enforce_message_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

-- ── 8. audit_definer_exposure() (defined in migration 20260917000005, audit
--    C1) needs its allowlist extended for the three new SECURITY DEFINER
--    functions above that are deliberately granted to authenticated —
--    without this, C1's own CI guard would (correctly, but as a false
--    positive against THIS migration's intentional design) start failing
--    the moment this migration lands. Same function, same behaviour,
--    re-created here rather than editing migration 005 directly (rule 2).

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
      -- audit C2 additions: all three are authenticated-only, argument-
      -- validated, and either write only what the caller is entitled to
      -- write (start_conversation, add_agency_member_to_conversation) or
      -- gate their own read on participant-of/support-or-admin status
      -- (conversation_display_names) — see this migration's own comments.
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
