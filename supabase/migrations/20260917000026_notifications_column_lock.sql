-- notifications_update_mark_read_own (migration 20260916000014) is a plain
-- `using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id)`
-- UPDATE policy with no column restriction at all — a recipient could use
-- their own legitimate UPDATE grant to rewrite status/error_message/
-- attempts/channel/idempotency_key on their own notification row, not just
-- mark it read. Locking this down the same way lock_message_content()
-- (migration 20260916000013_messaging.sql) already locks messages: a
-- BEFORE UPDATE trigger unconditionally re-pins every column except
-- read_at back to its OLD value.
--
-- Exemption for service_role/postgres (not "unconditional" like messages'
-- own lock): dispatch-notifications (the edge function, running as the
-- service_role Postgres role) and claim_pending_notifications()/
-- finalize_domain_event() (SECURITY DEFINER, which makes their own writes
-- run as the function owner — postgres) both legitimately update status,
-- attempts, error_message, sent_at, next_attempt_at, and claimed_at as
-- part of normal operation. Without this exemption, the notification
-- worker would silently stop working — every one of those columns would
-- just get re-pinned back to its old value by this same trigger.
-- current_user (not session_user, which never reflects a role switch) is
-- what both of those contexts actually run as.
-- ============================================================================

create or replace function public.lock_notification_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Deliberately NOT security definer: that would make current_user
  -- resolve to this function's OWNER (postgres) on every single call
  -- regardless of who actually ran the UPDATE, which would make the
  -- check below always true and permanently disable the lock for
  -- everyone — discovered by this migration's own test actually
  -- exercising a recipient's forged UPDATE and watching it NOT get
  -- blocked. Plain invoker-rights is correct here: re-pinning NEW's
  -- columns to OLD needs no elevated privilege beyond what the
  -- already-RLS-checked UPDATE itself has.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  new.domain_event_id := old.domain_event_id;
  new.recipient_id    := old.recipient_id;
  new.channel         := old.channel;
  new.status          := old.status;
  new.idempotency_key := old.idempotency_key;
  new.created_at      := old.created_at;
  new.sent_at         := old.sent_at;
  new.error_message   := old.error_message;
  new.attempts        := old.attempts;
  new.next_attempt_at := old.next_attempt_at;
  new.claimed_at      := old.claimed_at;
  -- Only read_at may ever change via a non-service caller's own UPDATE.
  return new;
end;
$$;

comment on function public.lock_notification_fields() is
  'A recipient''s own notifications_update_mark_read_own UPDATE grant can only ever actually change read_at — every other column is re-pinned to OLD, same pattern as lock_message_content(). Exempt for service_role/postgres (dispatch-notifications and its claim/finalize RPCs), which legitimately update status/attempts/error_message/sent_at/next_attempt_at/claimed_at as part of normal operation.';

drop trigger if exists lock_notification_fields on public.notifications;
create trigger lock_notification_fields
  before update on public.notifications
  for each row execute function public.lock_notification_fields();
