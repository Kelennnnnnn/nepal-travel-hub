-- ============================================================================
-- Into Nepal — migration 13 of N: Messaging
--
-- PHASE_1_ARCHITECTURE.md §3 / target §25. Adds conversation_participants
-- (didn't exist before — the old system put traveler_id/agency_id directly
-- on conversations, which only works for a 1:1 traveler<->single-agency-user
-- model and can't generalize to multi-staff agencies now that agency_users
-- exists). Fixes AUDIT_REPORT.md RLS-04: the old messages UPDATE policy had
-- no WITH CHECK, so any participant could rewrite any message's content or
-- reassign sender_id, not just mark it read. Here, content/sender_id are
-- locked by a trigger exactly like the booking financial-fields pattern —
-- only read_at is mutable, and only by the non-sender participant.
-- ============================================================================

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings(id),  -- optional: a conversation
                -- may exist in the context of a specific booking, or be a
                -- general pre-booking inquiry (booking_id null)
  agency_id   uuid not null references public.agencies(id),
  subject     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create index idx_conversations_agency on public.conversations (agency_id);
create index idx_conversations_booking on public.conversations (booking_id);

create table public.conversation_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  participant_role text not null check (participant_role in ('traveler', 'agency', 'support')),
  joined_at       timestamptz not null default now(),
  unique (conversation_id, user_id)
);

comment on table public.conversation_participants is
  'Generalizes the old traveler_id/agency_id-on-conversations model to support multiple agency staff in one conversation, and a future traveler<->support channel (target §25) without a schema change.';

create index idx_conversation_participants_conversation on public.conversation_participants (conversation_id);
create index idx_conversation_participants_user on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  content         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_messages_conversation on public.messages (conversation_id, created_at);

create table public.message_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  created_at    timestamptz not null default now()
);

comment on table public.message_attachments is
  'Did not exist in the old system at all. Storage bucket policy (storage migration) restricts access to conversation participants only — never a predictable/public URL (target §25).';

create index idx_message_attachments_message on public.message_attachments (message_id);

-- ── Lock message content/sender after creation — fixes AUDIT_REPORT.md
--    RLS-04 at the trigger layer, in addition to a correct WITH CHECK below
--    (belt-and-suspenders, matching the booking financial-fields pattern) ──

create or replace function public.lock_message_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.content := old.content;
  new.sender_id := old.sender_id;
  new.conversation_id := old.conversation_id;
  new.created_at := old.created_at;
  -- Only read_at may ever change after creation.
  return new;
end;
$$;

create trigger lock_message_content
  before update on public.messages
  for each row execute function public.lock_message_content();

-- ── RLS ──────────────────────────────────────────────────────────────────

-- conversation_participants_select_own (below) needs to answer "is auth.uid()
-- a participant in this conversation" by reading conversation_participants
-- itself — a self-referencing check. Done as a raw exists(select ... from
-- conversation_participants ...) inside that same table's own SELECT policy,
-- this recurses infinitely (Postgres 42P17 / "infinite recursion detected in
-- policy for relation conversation_participants"), the same class of bug
-- fixed for has_agency_access() in migration 3 — found here only once Phase
-- 4 exercised a storage.objects insert whose applicable policy set
-- transitively touches conversation_participants (message_attachments_bucket_
-- participant), which triggered this table's own recursive policy even
-- though the upload had nothing to do with messaging. SECURITY DEFINER
-- makes the internal lookup run as the function owner (bypasses RLS on
-- conversation_participants), breaking the cycle.
create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = target_conversation_id and cp.user_id = auth.uid()
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = conversations.id and cp.user_id = auth.uid()));

drop policy if exists "conversations_select_agency_staff" on public.conversations;
create policy "conversations_select_agency_staff"
  on public.conversations for select
  using (public.has_agency_access(agency_id));

drop policy if exists "conversations_insert_traveler" on public.conversations;
create policy "conversations_insert_traveler"
  on public.conversations for insert
  with check (true);  -- creation is followed immediately by a
                        -- conversation_participants insert (same request/
                        -- transaction, application-layer), which is what's
                        -- actually gated below

drop policy if exists "conversations_admin_all" on public.conversations;
create policy "conversations_admin_all"
  on public.conversations for all
  using (public.is_support_or_admin())
  with check (public.is_support_or_admin());

drop policy if exists "conversation_participants_select_own" on public.conversation_participants;
create policy "conversation_participants_select_own"
  on public.conversation_participants for select
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "conversation_participants_insert_self" on public.conversation_participants;
create policy "conversation_participants_insert_self"
  on public.conversation_participants for insert
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.conversations c where c.id = conversation_participants.conversation_id and public.has_agency_access(c.agency_id, 'manager'))
  );
  -- A traveler can add themselves; an agency manager can add their own staff
  -- to a conversation for their agency.

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));

drop policy if exists "messages_select_admin" on public.messages;
create policy "messages_select_admin"
  on public.messages for select
  using (public.is_support_or_admin());

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
  );

drop policy if exists "messages_update_mark_read" on public.messages;
create policy "messages_update_mark_read"
  on public.messages for update
  using (
    sender_id <> auth.uid()  -- only the recipient marks something read, never the sender
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
  )
  with check (true);
  -- The WITH CHECK is permissive here on purpose — the real protection is
  -- the lock_message_content trigger above, which unconditionally re-pins
  -- content/sender_id/conversation_id/created_at to their old values
  -- regardless of what the UPDATE statement tried to set. This mirrors
  -- (and explicitly improves on) the booking financial-fields pattern
  -- already proven correct in the old system, applied here to fully close
  -- AUDIT_REPORT.md RLS-04.

drop policy if exists "message_attachments_select_participant" on public.message_attachments;
create policy "message_attachments_select_participant"
  on public.message_attachments for select
  using (exists (
    select 1 from public.messages m join public.conversation_participants cp on cp.conversation_id = m.conversation_id
    where m.id = message_attachments.message_id and cp.user_id = auth.uid()
  ));

drop policy if exists "message_attachments_insert_sender" on public.message_attachments;
create policy "message_attachments_insert_sender"
  on public.message_attachments for insert
  with check (exists (select 1 from public.messages m where m.id = message_attachments.message_id and m.sender_id = auth.uid()));
