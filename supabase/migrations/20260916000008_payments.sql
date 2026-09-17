-- ============================================================================
-- Into Nepal — migration 8 of N: Payments
--
-- PHASE_1_ARCHITECTURE.md §3.6. Replaces the old system's single
-- payment_intent_id string column with a real payments/payment_attempts/
-- payment_events tier, provider-agnostic (target §3/§15 — Stripe is gone;
-- nothing here references Stripe or NIC ASIA-specific fields, per target
-- §66's "do not invent NIC ASIA API specifications"). One `payments` row
-- exists per obligation (PLATFORM_FEE or AGENCY_BALANCE) per booking — a
-- booking can have zero, one, or two rows here depending on whether/how the
-- balance was collected.
-- ============================================================================

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id),
  obligation_type   text not null check (obligation_type in ('platform_fee', 'agency_balance')),
  amount            numeric(12,2) not null check (amount > 0),
  currency          char(3) not null,
  provider          text not null default 'nic_asia' check (provider in ('nic_asia', 'esewa', 'khalti', 'other')),
  status            text not null default 'unpaid' check (status in (
                       'unpaid', 'pending', 'processing', 'paid', 'partially_refunded',
                       'refunded', 'failed', 'expired', 'disputed'
                     )),
  idempotency_key   text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (booking_id, obligation_type)
  -- A booking can have at most ONE payments row per obligation type — this
  -- is what makes "has the platform fee been paid" or "has the balance been
  -- paid via the platform" an unambiguous single-row lookup, not something
  -- requiring a MAX(created_at) or similar over multiple candidate rows.
);

comment on table public.payments is
  'One row per (booking, obligation_type). provider is deliberately generic (target §3: future providers include eSewa, Khalti) — no provider-specific field lives on this table; those live on payment_attempts/payment_events, and are only ever written/read through the PaymentProvider abstraction (application-layer, Phase 11).';

create trigger set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index idx_payments_booking on public.payments (booking_id);
create index idx_payments_status on public.payments (status);

create table public.payment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references public.payments(id) on delete cascade,
  provider_reference  text,   -- opaque, provider-specific (e.g. NIC ASIA's own
                                -- transaction/order reference) — never assumed
                                -- to have a particular shape here
  status              text not null default 'initiated' check (status in ('initiated', 'succeeded', 'failed', 'timed_out')),
  initiated_at        timestamptz not null default now(),
  completed_at        timestamptz,
  failure_reason      text
);

comment on table public.payment_attempts is
  'One row per provider-facing try (a declined card retried, a timed-out redirect retried, etc). A payment can have multiple attempts; exactly the capability the old system lacked entirely (it had one payment_intent_id per booking, full stop).';

create index idx_payment_attempts_payment on public.payment_attempts (payment_id);
create unique index idx_payment_attempts_provider_ref on public.payment_attempts (provider_reference) where provider_reference is not null;

create table public.payment_events (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid references public.payments(id),  -- nullable: an event
                          -- might arrive for a not-yet-linked payment (e.g. the
                          -- callback races ahead of our own write) and must
                          -- still be durably stored for debugging/replay
                          -- (target §51: "payment callback arrives before
                          -- frontend")
  provider              text not null,
  provider_event_id     text not null,
  event_type            text not null,
  raw_payload_reference text,  -- a reference to (or redacted copy of) the raw
                                  -- provider payload — target §14: "store raw
                                  -- provider metadata only where appropriate and
                                  -- safe." Never card numbers/CVV/tokens/secrets.
  received_at           timestamptz not null default now(),
  processed_at          timestamptz,
  processing_status     text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  error_message         text,
  unique (provider, provider_event_id)
  -- THIS constraint is the idempotency backbone for the whole payment
  -- pipeline (target §39/§40): a webhook replay with the same provider +
  -- provider_event_id cannot insert a second row — the INSERT itself fails
  -- on the unique constraint, which the calling function treats as "already
  -- processed, no-op" rather than retrying the side effects. This is a
  -- database-enforced guarantee, not just an application-level "if exists
  -- then skip" check (target §39 explicitly warns against relying only on
  -- the latter).
);

comment on table public.payment_events is
  'Every callback/webhook received, whether or not it changed anything — richer than the old system''s webhook_events (event id + type only). The UNIQUE(provider, provider_event_id) constraint is what makes duplicate-callback handling a database guarantee rather than an application discipline.';

create index idx_payment_events_payment on public.payment_events (payment_id);
create index idx_payment_events_status on public.payment_events (processing_status) where processing_status = 'pending';

-- ── RLS ──────────────────────────────────────────────────────────────────
-- payments/payment_attempts/payment_events are written EXCLUSIVELY by
-- service-role edge functions (create-payment, verify-payment, the NIC ASIA
-- webhook handler). No INSERT/UPDATE/DELETE grant exists for travelers,
-- agency staff, or even admins directly via the client SDK — this is
-- deliberate: payment state must only ever change as a consequence of an
-- actual, verified provider event, never a direct table write from any UI,
-- including the admin UI (an admin who needs to force a payment correction
-- does so via a dedicated, audited admin-actions function in a later phase,
-- which itself still goes through service_role — not by an admin having a
-- raw UPDATE grant on this table).

alter table public.payments enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "payments_select_traveler" on public.payments;
create policy "payments_select_traveler"
  on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = payments.booking_id and b.traveler_id = auth.uid()));

drop policy if exists "payments_select_agency" on public.payments;
create policy "payments_select_agency"
  on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = payments.booking_id and public.has_agency_access(b.agency_id)));

drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin"
  on public.payments for select
  using (public.is_admin() or public.is_finance_or_admin());

drop policy if exists "payment_attempts_select" on public.payment_attempts;
create policy "payment_attempts_select"
  on public.payment_attempts for select
  using (
    exists (select 1 from public.payments p join public.bookings b on b.id = p.booking_id
            where p.id = payment_attempts.payment_id and (b.traveler_id = auth.uid() or public.has_agency_access(b.agency_id)))
    or public.is_finance_or_admin()
  );

drop policy if exists "payment_events_select_admin" on public.payment_events;
create policy "payment_events_select_admin"
  on public.payment_events for select
  using (public.is_finance_or_admin());
  -- payment_events is not traveler/agency-visible at all — it's raw
  -- provider-callback debugging data, admin/finance-only.
