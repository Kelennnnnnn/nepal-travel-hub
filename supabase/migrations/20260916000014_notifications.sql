-- ============================================================================
-- Into Nepal — migration 14 of N: Notifications & Domain Events
--
-- PHASE_1_ARCHITECTURE.md §8 / target §26/§38. domain_events is the backbone
-- that lets booking confirmation commit transactionally while notification
-- sending happens asynchronously and retries independently (target §38: "If
-- notification fails: booking must remain confirmed. Notification retries
-- separately.") The old system had neither concept — "notifications" meant
-- "an edge function calls sendEmail() inline," with no durable record, no
-- retry, and no in-app notification at all.
-- ============================================================================

create table public.domain_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,   -- QUOTE_CREATED | PAYMENT_STARTED | PAYMENT_FAILED |
                                    -- PAYMENT_SUCCEEDED | BOOKING_CONFIRMED |
                                    -- BOOKING_CANCELLED | BALANCE_DUE | BALANCE_PAID |
                                    -- TRIP_UPCOMING | TRIP_STARTED | TRIP_COMPLETED |
                                    -- REFUND_REQUESTED | REFUND_COMPLETED |
                                    -- SETTLEMENT_PENDING | SETTLEMENT_ELIGIBLE |
                                    -- PAYOUT_PROCESSING | PAYOUT_COMPLETED |
                                    -- PAYOUT_FAILED | NEW_MESSAGE | NEW_REVIEW |
                                    -- AGENCY_APPROVED | AGENCY_SUSPENDED (target §26,
                                    -- exact list — not constrained by CHECK since the
                                    -- set legitimately grows over time and a CHECK
                                    -- would need a migration for every new event type)
  aggregate_type text not null,   -- e.g. 'booking', 'agency', 'payout'
  aggregate_id   uuid not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

comment on table public.domain_events is
  'Append-only internal event log (target §38). The booking-confirmation transaction (Phase 10) ends with an INSERT here as its last statement — durable exactly when the confirmation itself is. A separate worker/trigger fans these out into notifications rows, independently of the originating transaction.';

create index idx_domain_events_unprocessed on public.domain_events (created_at) where processed_at is null;
create index idx_domain_events_aggregate on public.domain_events (aggregate_type, aggregate_id);

create table public.notification_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  new_booking        boolean not null default true,
  booking_cancel     boolean not null default true,
  balance_due        boolean not null default true,
  payout             boolean not null default true,
  new_message        boolean not null default true,
  new_review         boolean not null default true,
  marketing          boolean not null default false,
  updated_at         timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Reused shape from the old system — this table was already correctly designed and RLS-scoped (AUDIT_REPORT.md found no issue here). Column set expanded slightly for the new event types.';

create trigger set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  domain_event_id uuid not null references public.domain_events(id),
  recipient_id    uuid not null references auth.users(id),
  channel         text not null check (channel in ('in_app', 'email', 'sms')),
  status          text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  read_at         timestamptz,   -- meaningful for channel='in_app' only
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  error_message   text
);

comment on table public.notifications is
  'One row per (domain_event, recipient, channel) actually queued/sent. idempotency_key is derived from exactly that triple — a replayed domain_event that already produced a notification row cannot produce a second one, which is the concrete mechanism behind target §26''s "do not send duplicate booking confirmation emails when a webhook is replayed."';

create index idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index idx_notifications_unread on public.notifications (recipient_id) where read_at is null and channel = 'in_app';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.domain_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- domain_events is server-internal only — no client role can read it
-- directly (it may contain other users' data in its payload, e.g. a
-- BOOKING_CONFIRMED event's aggregate touches both a traveler and an
-- agency). Admins get read access for operational debugging.
drop policy if exists "domain_events_admin_select" on public.domain_events;
create policy "domain_events_admin_select"
  on public.domain_events for select
  using (public.is_admin());

drop policy if exists "notification_preferences_manage_own" on public.notification_preferences;
create policy "notification_preferences_manage_own"
  on public.notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_mark_read_own" on public.notifications;
create policy "notifications_update_mark_read_own"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
  -- No column lock trigger here (unlike messages) because the only
  -- meaningful mutable field a recipient could plausibly touch is read_at,
  -- and there's no financial/integrity concern if a user could otherwise
  -- edit their own notification's status/channel — low stakes, so a plain
  -- WITH CHECK is proportionate; revisit if that assumption changes.

drop policy if exists "notifications_admin_select" on public.notifications;
create policy "notifications_admin_select"
  on public.notifications for select
  using (public.is_admin());
