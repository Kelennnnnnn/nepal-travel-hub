-- Fixes the "fix email handling" prompt's item 4: agency lifecycle emails
-- (application received, approved/rejected/more-info/suspended) were sent
-- INLINE from the request that caused them — a slow/down Resend call
-- delayed the admin's approve/reject response, and a failed send was just
-- logged and silently dropped (no retry, no record). domain_events/
-- notifications already existed (migration 20260916000014) with almost
-- this exact shape but nothing ever consumed them. This migration adds
-- what's missing: a claim-and-lease mechanism so dispatch-notifications
-- (the new edge function) can safely run once a minute without two
-- overlapping runs double-sending the same email, retry/backoff columns
-- on notifications, a NEW_MESSAGE emitter, and the pg_cron + pg_net wiring
-- that actually calls the dispatcher on a schedule.
-- ============================================================================

create extension if not exists pg_net;

-- ── 1. Retry/backoff + claim-lease columns ─────────────────────────────────

alter table public.notifications
  add column attempts int not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column claimed_at timestamptz;

comment on column public.notifications.attempts is
  'Number of FAILED send attempts so far (not incremented on success). dispatch-notifications stops retrying once this reaches 5 — the row stays status=failed permanently.';
comment on column public.notifications.next_attempt_at is
  'Earliest time a failed notification may be retried — set to an exponential backoff from attempts on each failure. Ignored for status=queued rows (always immediately eligible).';
comment on column public.notifications.claimed_at is
  'Lease timestamp set by claim_pending_notifications() so two overlapping dispatch-notifications runs cannot both send the same row. A claim older than 2 minutes is considered abandoned (e.g. the function crashed mid-send) and becomes reclaimable.';

alter table public.domain_events
  add column claimed_at timestamptz;

comment on column public.domain_events.claimed_at is
  'Lease timestamp set by claim_domain_events(), same abandoned-claim reasoning as notifications.claimed_at above.';

-- ── 2. claim_domain_events(): atomic "read unprocessed, oldest first, lock
--    so nobody else takes them" — the FOR UPDATE SKIP LOCKED itself only
--    holds for the duration of THIS statement, so the lease is made
--    durable by writing claimed_at before returning, not by relying on the
--    lock outliving the call (it can't: sending the actual emails happens
--    in the edge function afterward, in a separate transaction). ─────────

create or replace function public.claim_domain_events(p_limit int default 50)
returns setof public.domain_events
language sql
security definer
set search_path = public
as $$
  with c as (
    select id from public.domain_events
    where processed_at is null
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.domain_events de
  set claimed_at = now()
  from c
  where de.id = c.id
  returning de.*;
$$;

comment on function public.claim_domain_events(int) is
  'Audit item 4. Leases up to p_limit unprocessed domain_events (oldest first) for dispatch-notifications to process. A lease older than 2 minutes is treated as abandoned and reclaimable, so a crashed run does not permanently strand an event.';

revoke execute on function public.claim_domain_events(int) from public, anon, authenticated;
grant  execute on function public.claim_domain_events(int) to service_role;

-- ── 3. claim_pending_notifications(): same pattern, for the actual
--    queued/due-for-retry notification rows. Decoupled from domain-event
--    claiming so a notification's own exponential backoff (not the fixed
--    2-minute domain-event lease window) governs when it's retried. ──────

create or replace function public.claim_pending_notifications(p_limit int default 100)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  with c as (
    select id from public.notifications
    where (
      status = 'queued'
      or (status = 'failed' and attempts < 5 and next_attempt_at <= now())
    )
    and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.notifications n
  set claimed_at = now()
  from c
  where n.id = c.id
  returning n.*;
$$;

comment on function public.claim_pending_notifications(int) is
  'Audit item 4. Leases up to p_limit notifications that are either freshly queued or a failed send whose backoff window has elapsed and has not yet hit the 5-attempt cap.';

revoke execute on function public.claim_pending_notifications(int) from public, anon, authenticated;
grant  execute on function public.claim_pending_notifications(int) to service_role;

-- ── 4. finalize_domain_event(): marks a domain_event processed once every
--    notification it produced is a terminal state (sent, or permanently
--    failed at 5 attempts) — never while any row is still queued or
--    within its retry window. ──────────────────────────────────────────

create or replace function public.finalize_domain_event(p_domain_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.notifications
    where domain_event_id = p_domain_event_id
      and (status = 'queued' or (status = 'failed' and attempts < 5))
  ) then
    update public.domain_events
    set processed_at = now(), claimed_at = null
    where id = p_domain_event_id and processed_at is null;
  end if;
end;
$$;

comment on function public.finalize_domain_event(uuid) is
  'Audit item 4. Called by dispatch-notifications after processing a domain_event''s notifications. A no-op if any notification for it is still pending or retryable, so processed_at is only ever set once nothing more will happen for this event.';

revoke execute on function public.finalize_domain_event(uuid) from public, anon, authenticated;
grant  execute on function public.finalize_domain_event(uuid) to service_role;

-- ── 5. lookup_user_id_by_email(): AGENCY_INVITATION_SENT's recipient may
--    not have an account yet (auth.users has no row for their email) —
--    the dispatcher needs to check, since notifications.recipient_id is a
--    NOT NULL FK to auth.users and can't reference someone who doesn't
--    exist. auth.users isn't exposed through PostgREST, so this small
--    SECURITY DEFINER wrapper is the only way the edge function (using
--    the anon/service-role REST client, not raw SQL) can ask the
--    question at all. ────────────────────────────────────────────────

create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

comment on function public.lookup_user_id_by_email(text) is
  'Audit item 4. service_role-only lookup used by dispatch-notifications to decide whether an AGENCY_INVITATION_SENT recipient already has an account (queue normally via notifications) or not (send the email directly, no notifications row).';

revoke execute on function public.lookup_user_id_by_email(text) from public, anon, authenticated;
grant  execute on function public.lookup_user_id_by_email(text) to service_role;

-- ── 6. NEW_MESSAGE domain event — messages never emitted one before, so
--    no in-app "you have a new message" notification has ever existed.
--    One domain_event per message; the dispatcher fans it out to every
--    OTHER participant in the conversation (in_app only, respecting
--    notification_preferences.new_message — see dispatch-notifications). ─

create or replace function public.emit_new_message_domain_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('NEW_MESSAGE', 'message', new.id, jsonb_build_object('conversation_id', new.conversation_id, 'sender_id', new.sender_id));
  return new;
end;
$$;

drop trigger if exists emit_new_message_domain_event on public.messages;
create trigger emit_new_message_domain_event
  after insert on public.messages
  for each row execute function public.emit_new_message_domain_event();

-- ── 7. Schedule the dispatcher — pg_cron fires once a minute; the actual
--    HTTP call goes through this small wrapper (rather than inlining
--    net.http_post directly in cron.schedule's command) so a project
--    where the one-time Vault setup (README §5d) hasn't been done yet
--    just silently skips instead of logging a cron failure every minute. ─

create or replace function public.trigger_dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

comment on function public.trigger_dispatch_notifications() is
  'Audit item 4. Invoked by the dispatch-notifications-cron pg_cron job every minute. Both the project URL and the shared secret are read from Supabase Vault at call time (never hardcoded) — see README "5d. One-time: store the cron secret in Vault" for the one-time setup this depends on.';

revoke execute on function public.trigger_dispatch_notifications() from public, anon, authenticated;
-- No grant to service_role either — pg_cron runs scheduled jobs as the
-- database owner (postgres), not through PostgREST, so no client-facing
-- role ever needs EXECUTE here at all.

select cron.schedule(
  'dispatch-notifications-cron',
  '* * * * *',
  $$select public.trigger_dispatch_notifications();$$
);
