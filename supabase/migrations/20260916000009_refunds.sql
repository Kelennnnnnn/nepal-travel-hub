-- ============================================================================
-- Into Nepal — migration 9 of N: Refunds
--
-- PHASE_1_ARCHITECTURE.md §3.6. The old system had refund LOGIC (two
-- diverging implementations, per AUDIT_REPORT.md PAY-02) but no `refunds`
-- table at all — refund state was only ever reflected by overwriting
-- bookings.payment_status. Here, refunds are first-class, independent of
-- cancellation (target §16: "Cancellation determines whether booking can be
-- cancelled. Refund determines how much money is returned.") — a booking's
-- refund_status (previous migration) is a summary; the actual record of what
-- was refunded, why, and through which provider transaction lives here.
-- ============================================================================

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings(id),
  payment_id         uuid not null references public.payments(id),
  provider_refund_id text,
  amount             numeric(12,2) not null check (amount > 0),
  currency           char(3) not null,
  reason             text not null,
  initiated_by       text not null check (initiated_by in ('traveler', 'agency', 'admin', 'system')),
  status             text not null default 'requested' check (status in (
                        'requested', 'processing', 'partially_refunded', 'refunded', 'failed', 'reversed'
                      )),
  idempotency_key    text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.refunds is
  'Independent of cancellation (target §16). A booking can be cancelled with a $0 refund (e.g. cancellation policy tier gives 0% at <3 days), and a refund can fail/be reversed independently of the booking already being marked cancelled.';

create trigger set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

create index idx_refunds_booking on public.refunds (booking_id);
create index idx_refunds_payment on public.refunds (payment_id);

create table public.refund_events (
  id                uuid primary key default gen_random_uuid(),
  refund_id         uuid references public.refunds(id),
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  unique (provider, provider_event_id)
);

comment on table public.refund_events is
  'Mirrors payment_events for refund-specific provider callbacks. Same idempotency guarantee via the UNIQUE(provider, provider_event_id) constraint.';

create index idx_refund_events_refund on public.refund_events (refund_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Travelers/agencies can SELECT (see their own refund history) and travelers
-- can INSERT a refund REQUEST (status='requested' only — everything past
-- that point is service_role-only, matching target §16: "Never mark a
-- refund complete merely because frontend requested it.")

alter table public.refunds enable row level security;
alter table public.refund_events enable row level security;

drop policy if exists "refunds_select_traveler" on public.refunds;
create policy "refunds_select_traveler"
  on public.refunds for select
  using (exists (select 1 from public.bookings b where b.id = refunds.booking_id and b.traveler_id = auth.uid()));

drop policy if exists "refunds_select_agency" on public.refunds;
create policy "refunds_select_agency"
  on public.refunds for select
  using (exists (select 1 from public.bookings b where b.id = refunds.booking_id and public.has_agency_access(b.agency_id)));

drop policy if exists "refunds_select_finance_admin" on public.refunds;
create policy "refunds_select_finance_admin"
  on public.refunds for select
  using (public.is_finance_or_admin());

drop policy if exists "refunds_insert_traveler_request_only" on public.refunds;
create policy "refunds_insert_traveler_request_only"
  on public.refunds for insert
  with check (
    status = 'requested'
    and initiated_by = 'traveler'
    and exists (select 1 from public.bookings b where b.id = refunds.booking_id and b.traveler_id = auth.uid())
  );

drop policy if exists "refunds_finance_admin_all" on public.refunds;
create policy "refunds_finance_admin_all"
  on public.refunds for all
  using (public.is_finance_or_admin())
  with check (public.is_finance_or_admin());

drop policy if exists "refund_events_select_finance_admin" on public.refund_events;
create policy "refund_events_select_finance_admin"
  on public.refund_events for select
  using (public.is_finance_or_admin());
