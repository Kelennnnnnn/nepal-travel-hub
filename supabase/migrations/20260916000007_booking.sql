-- ============================================================================
-- Into Nepal — migration 7 of N: Booking
--
-- PHASE_1_ARCHITECTURE.md §3.5 and §4. Four independent state machines
-- (booking_status, payment_status, balance_status, settlement_status,
-- refund_status) instead of the old system's two conflated fields
-- (PHASE_0_FORENSIC_AUDIT.md §3). Financial fields are NOT duplicated as
-- mutable columns here (contrast with the old bookings.commission_amount/
-- net_payout GENERATED-column design, AUDIT_REPORT.md SCHEMA-01) — they are
-- read from the linked, immutable booking_quotes row via quote_id, so a
-- booking's price can never drift from the quote that produced it.
--
-- Transition validation is enforced with real BEFORE UPDATE triggers, not
-- just an unconstrained CHECK on allowed values — closing the exact gap that
-- let the old system silently strand a paid booking in pending_payment with
-- no error (AUDIT_REPORT.md PAY-01): an invalid transition here raises
-- immediately instead of silently succeeding.
-- ============================================================================

create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  booking_ref        text unique not null default ('BK-' || upper(substring(gen_random_uuid()::text, 1, 8))),

  quote_id           uuid not null references public.booking_quotes(id),
  listing_id         uuid not null references public.listings(id),
  departure_id       uuid not null references public.departures(id),
  agency_id          uuid not null references public.agencies(id),
  traveler_id        uuid not null references auth.users(id),
  participant_count  integer not null check (participant_count > 0),

  booking_status     text not null default 'draft' check (booking_status in (
                        'draft', 'pending_payment', 'payment_processing', 'confirmed',
                        'cancel_requested', 'cancelled', 'in_progress', 'completed',
                        'no_show', 'disputed', 'expired'
                      )),
  payment_status     text not null default 'unpaid' check (payment_status in (
                        'unpaid', 'pending', 'processing', 'paid', 'partially_refunded',
                        'refunded', 'failed', 'expired', 'disputed'
                      )),
  -- payment_status tracks the PLATFORM_FEE obligation specifically — it is
  -- what actually gates booking_status transitioning to 'confirmed'
  -- (PHASE_1_ARCHITECTURE.md §2). The AGENCY_BALANCE obligation has its own,
  -- independent tracking below.
  balance_method     text check (balance_method in ('direct_to_agency', 'into_nepal_platform')),
  balance_status     text not null default 'not_due' check (balance_status in (
                        'not_due', 'due', 'partially_paid', 'paid', 'overdue'
                      )),
  settlement_status  text not null default 'not_applicable' check (settlement_status in (
                        'not_applicable', 'not_eligible', 'pending', 'on_hold',
                        'eligible', 'processing', 'paid', 'failed', 'reversed'
                      )),
  refund_status      text not null default 'none' check (refund_status in (
                        'none', 'requested', 'processing', 'partially_refunded',
                        'refunded', 'failed', 'reversed'
                      )),

  cancelled_at        timestamptz,
  cancellation_reason  text,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.bookings is
  'Financial fields (product_value/platform_fee/agency_balance/currency) are NOT columns on this table — join to booking_quotes via quote_id. This is deliberate: it is structurally impossible for a booking''s price to disagree with the quote that produced it, because there is no second copy of the number to disagree.';

create trigger set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index idx_bookings_traveler on public.bookings (traveler_id);
create index idx_bookings_agency on public.bookings (agency_id);
create index idx_bookings_listing on public.bookings (listing_id);
create index idx_bookings_departure on public.bookings (departure_id);
create index idx_bookings_booking_status on public.bookings (booking_status);
create index idx_bookings_settlement_status on public.bookings (settlement_status) where settlement_status in ('pending', 'eligible');

-- Now that bookings exists, wire the FK deferred from the Inventory migration.
alter table public.inventory_reservations
  add constraint inventory_reservations_booking_id_fkey
  foreign key (booking_id) references public.bookings(id) on delete set null;

-- ── Per-guest / per-item detail ──────────────────────────────────────────────

create table public.booking_guests (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  full_name       text not null,
  date_of_birth   date,
  passport_number_encrypted text,  -- Vault-encrypted reference if/when collected —
                                     -- mirrors the pattern already proven correct in
                                     -- the old system for bank account numbers
                                     -- (AUDIT_REPORT.md: agency_bank_details Vault
                                     -- design was genuinely well-built). Actual
                                     -- Vault wiring is a Phase 10 application-layer
                                     -- concern once product scope confirms this
                                     -- field is needed (PHASE_0 open question #4).
  contact_phone   text,
  contact_email   citext,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_booking_guests_booking on public.booking_guests (booking_id);

create table public.booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  quote_item_id  uuid references public.quote_items(id),
  description    text not null,
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  quantity       integer not null check (quantity > 0),
  line_total     numeric(12,2) not null check (line_total >= 0)
);

create index idx_booking_items_booking on public.booking_items (booking_id);

-- ── Immutable timeline (target §41) ──────────────────────────────────────────

create table public.booking_status_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  event_type  text not null,   -- mirrors target §26's event names, e.g.
                                 -- QUOTE_CREATED, PAYMENT_INITIATED,
                                 -- RESERVATION_FEE_VERIFIED, BOOKING_CONFIRMED,
                                 -- AGENCY_NOTIFIED, BALANCE_DUE, BALANCE_PAID,
                                 -- TRIP_UPCOMING, TRIP_STARTED, TRIP_COMPLETED,
                                 -- SETTLEMENT_ELIGIBLE, PAYOUT_COMPLETED, ...
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.booking_status_history is
  'Append-only. No UPDATE/DELETE grant exists for any role on this table (see RLS below) — rows are written exclusively by record_booking_event(), called from the trusted server functions that drive the actual state transitions.';

create index idx_booking_status_history_booking on public.booking_status_history (booking_id, created_at);

create or replace function public.record_booking_event(p_booking_id uuid, p_event_type text, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.booking_status_history (booking_id, event_type, metadata)
  values (p_booking_id, p_event_type, p_metadata);
$$;

-- ── State machine transition guards ──────────────────────────────────────────
-- One generic validator, parameterized per column, driven by a small
-- transition-table encoded as a jsonb constant. Rejects (raises) any UPDATE
-- that isn't in the allowed-transitions map for that column. service_role
-- and admin are NOT exempt from this — validity of a transition is a data-
-- integrity property, not an authorization property (authorization — WHO
-- may attempt a given transition — is enforced separately, in RLS).

create or replace function public.assert_valid_transition(
  p_column text, p_old text, p_new text, p_allowed jsonb
)
returns void
language plpgsql
immutable
as $$
begin
  if p_old is distinct from p_new
     and not (p_allowed -> coalesce(p_old, 'null') ? p_new) then
    raise exception 'INVALID_TRANSITION: % cannot go from % to %', p_column, p_old, p_new
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.guard_booking_status_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('booking_status', old.booking_status, new.booking_status, $j$
    {
      "draft":              ["pending_payment", "expired"],
      "pending_payment":    ["payment_processing", "expired", "cancelled"],
      "payment_processing": ["confirmed", "pending_payment", "expired"],
      "confirmed":          ["in_progress", "cancel_requested", "cancelled", "disputed", "no_show"],
      "cancel_requested":   ["cancelled", "confirmed"],
      "in_progress":        ["completed", "no_show", "disputed"],
      "completed":          ["disputed"],
      "cancelled":          [],
      "expired":            [],
      "no_show":            ["disputed"],
      "disputed":           ["confirmed", "cancelled", "completed"]
    }
  $j$::jsonb);
  return new;
end;
$$;

create trigger guard_booking_status_transition
  before update of booking_status on public.bookings
  for each row execute function public.guard_booking_status_transition();

create or replace function public.guard_payment_status_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('payment_status', old.payment_status, new.payment_status, $j$
    {
      "unpaid":              ["pending", "expired"],
      "pending":             ["processing", "failed", "expired"],
      "processing":          ["paid", "failed"],
      "paid":                ["partially_refunded", "refunded", "disputed"],
      "partially_refunded":  ["refunded"],
      "refunded":            [],
      "failed":              ["pending"],
      "expired":             [],
      "disputed":            ["paid", "refunded"]
    }
  $j$::jsonb);
  return new;
end;
$$;

create trigger guard_payment_status_transition
  before update of payment_status on public.bookings
  for each row execute function public.guard_payment_status_transition();

create or replace function public.guard_settlement_status_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('settlement_status', old.settlement_status, new.settlement_status, $j$
    {
      "not_applicable": [],
      "not_eligible":    ["pending"],
      "pending":         ["on_hold", "eligible"],
      "on_hold":         ["pending"],
      "eligible":        ["processing", "on_hold"],
      "processing":      ["paid", "failed"],
      "paid":            ["reversed"],
      "failed":          ["eligible"],
      "reversed":        []
    }
  $j$::jsonb);
  return new;
end;
$$;

create trigger guard_settlement_status_transition
  before update of settlement_status on public.bookings
  for each row execute function public.guard_settlement_status_transition();

create or replace function public.guard_refund_status_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('refund_status', old.refund_status, new.refund_status, $j$
    {
      "none":                ["requested"],
      "requested":           ["processing"],
      "processing":          ["refunded", "partially_refunded", "failed"],
      "partially_refunded":  ["processing", "reversed"],
      "refunded":            ["reversed"],
      "failed":              ["requested"],
      "reversed":            []
    }
  $j$::jsonb);
  return new;
end;
$$;

create trigger guard_refund_status_transition
  before update of refund_status on public.bookings
  for each row execute function public.guard_refund_status_transition();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mirrors the old system's ONE genuinely correct pattern (lock_booking_
-- financial_fields, AUDIT_REPORT.md — this was well-designed) generalized:
-- travelers/agency staff may update booking_status only within the bounds
-- the transition guards above already enforce structurally, and can NEVER
-- write payment_status/balance_status/settlement_status/refund_status
-- directly at all — those are service_role-only (written exclusively by the
-- payment/refund/settlement edge functions).

alter table public.bookings enable row level security;
alter table public.booking_guests enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_status_history enable row level security;

drop policy if exists "bookings_select_traveler" on public.bookings;
create policy "bookings_select_traveler"
  on public.bookings for select
  using (auth.uid() = traveler_id);

drop policy if exists "bookings_select_agency" on public.bookings;
create policy "bookings_select_agency"
  on public.bookings for select
  using (public.has_agency_access(agency_id));

drop policy if exists "bookings_select_admin" on public.bookings;
create policy "bookings_select_admin"
  on public.bookings for select
  using (public.is_admin() or public.is_support_or_admin());

-- Traveler may only ever move booking_status toward cancel_requested/cancelled
-- (mirrors the old system's fix_booking_rls.sql, correctly, from the start
-- rather than as a later patch) and may never touch any other column.
drop policy if exists "bookings_traveler_request_cancel" on public.bookings;
create policy "bookings_traveler_request_cancel"
  on public.bookings for update
  using (auth.uid() = traveler_id and booking_status in ('pending_payment', 'confirmed'))
  with check (auth.uid() = traveler_id and booking_status in ('cancel_requested', 'cancelled'));

-- Agency staff may move booking_status forward through fulfillment
-- (confirmed -> in_progress -> completed / no_show) but, like travelers,
-- never touch payment_status/balance_status/settlement_status/refund_status
-- — those columns simply have no WITH CHECK path that allows them to differ
-- from OLD.*, enforced by listing them explicitly below rather than relying
-- on an implicit "USING doubles as WITH CHECK" (AUDIT_REPORT.md flagged the
-- old schema's over-reliance on that implicit behavior as fragile/easy to
-- get wrong — being explicit here is deliberate).
drop policy if exists "bookings_agency_update_own" on public.bookings;
create policy "bookings_agency_update_own"
  on public.bookings for update
  using (public.has_agency_access(agency_id))
  with check (
    public.has_agency_access(agency_id)
    and payment_status = (select b.payment_status from public.bookings b where b.id = bookings.id)
    and balance_status = (select b.balance_status from public.bookings b where b.id = bookings.id)
    and settlement_status = (select b.settlement_status from public.bookings b where b.id = bookings.id)
    and refund_status = (select b.refund_status from public.bookings b where b.id = bookings.id)
  );

drop policy if exists "bookings_admin_all" on public.bookings;
create policy "bookings_admin_all"
  on public.bookings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "booking_guests_select" on public.booking_guests;
create policy "booking_guests_select"
  on public.booking_guests for select
  using (
    exists (select 1 from public.bookings b where b.id = booking_guests.booking_id and (b.traveler_id = auth.uid() or public.has_agency_access(b.agency_id)))
    or public.is_admin()
  );

drop policy if exists "booking_guests_insert_traveler" on public.booking_guests;
create policy "booking_guests_insert_traveler"
  on public.booking_guests for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_guests.booking_id and b.traveler_id = auth.uid()));

drop policy if exists "booking_items_select" on public.booking_items;
create policy "booking_items_select"
  on public.booking_items for select
  using (
    exists (select 1 from public.bookings b where b.id = booking_items.booking_id and (b.traveler_id = auth.uid() or public.has_agency_access(b.agency_id)))
    or public.is_admin()
  );

drop policy if exists "booking_status_history_select" on public.booking_status_history;
create policy "booking_status_history_select"
  on public.booking_status_history for select
  using (
    exists (select 1 from public.bookings b where b.id = booking_status_history.booking_id and (b.traveler_id = auth.uid() or public.has_agency_access(b.agency_id)))
    or public.is_admin()
  );
  -- No insert/update/delete policy for any non-service-role caller — see
  -- record_booking_event() above, the sole write path.
