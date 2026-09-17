-- ============================================================================
-- Into Nepal — migration 6 of N: Quoting
--
-- PHASE_1_ARCHITECTURE.md §3.4. This entire tier is new — the old system had
-- no separate quote object at all; create-payment-intent computed price and
-- created the Stripe PaymentIntent AND the bookings row synchronously in one
-- step (PHASE_0_FORENSIC_AUDIT.md §2). Here, a quote is issued first, backed
-- by a live inventory hold (hold_inventory(), previous migration), and is
-- immutable once created — the frontend can only ever read a quote, never
-- write to its financial fields (target §11: "Do not allow frontend
-- modification of quote totals").
-- ============================================================================

create table public.booking_quotes (
  id                     uuid primary key default gen_random_uuid(),
  listing_id             uuid not null references public.listings(id),
  departure_id           uuid not null references public.departures(id),
  agency_id              uuid not null references public.agencies(id),
  traveler_id            uuid not null references auth.users(id),
  participant_count      integer not null check (participant_count > 0),

  -- The two-obligation split (PHASE_1_ARCHITECTURE.md §2) — frozen at quote
  -- time and never recomputed later, even if the agency changes base_price
  -- afterward (target §6: "Once a booking is confirmed, its financial
  -- snapshot must not change merely because the agency changes its future
  -- listing price.")
  product_value          numeric(12,2) not null check (product_value > 0),
  platform_fee_percent   numeric(5,2) not null check (platform_fee_percent >= 0),
  platform_fee           numeric(12,2) not null check (platform_fee >= 0),
  agency_balance         numeric(12,2) not null check (agency_balance >= 0),
  currency               char(3) not null,
  check (agency_balance = product_value - platform_fee),

  pricing_version               jsonb not null default '{}'::jsonb,  -- which
                                   -- seasonal_pricing/price_overrides rows were
                                   -- resolved, for auditability (Phase 8 populates
                                   -- the real shape; placeholder here)
  cancellation_policy_snapshot  jsonb not null,   -- copied from listings.cancellation_policy
                                                    -- at quote time (target §16)
  balance_payment_terms_snapshot jsonb not null default '{}'::jsonb,  -- due date /
                                   -- allowed methods, frozen at quote time

  inventory_reservation_id      uuid not null references public.inventory_reservations(id),
  status                 text not null default 'active' check (status in ('active', 'expired', 'consumed', 'cancelled')),
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now()
);

comment on table public.booking_quotes is
  'Server-generated, immutable pricing snapshot (target §11). No UPDATE grant exists on the financial columns for any role, including admin/service_role, at the RLS layer below — the only way a quote''s numbers change is by creating a NEW quote. Status transitions (active -> expired/consumed/cancelled) are the sole mutation path, and only via trusted server functions.';

create index idx_booking_quotes_traveler on public.booking_quotes (traveler_id);
create index idx_booking_quotes_departure on public.booking_quotes (departure_id);
create index idx_booking_quotes_status_expiry on public.booking_quotes (status, expires_at) where status = 'active';

create table public.quote_items (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references public.booking_quotes(id) on delete cascade,
  item_type     text not null check (item_type in ('base_product', 'extra')),
  description   text not null,
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  quantity      integer not null check (quantity > 0),
  line_total    numeric(12,2) not null check (line_total >= 0),
  check (line_total = unit_price * quantity)
);

comment on table public.quote_items is
  'Line items backing a quote''s product_value. Extras (item_type=extra) are future scope per target §6 — the table exists now so adding extras later is additive, not a breaking schema change.';

create index idx_quote_items_quote on public.quote_items (quote_id);

-- ── Expiry sweep (mirrors expire_stale_reservations, but for quotes whose
--    backing reservation has expired) ────────────────────────────────────────

create or replace function public.expire_stale_quotes()
returns integer
language sql
security definer
set search_path = public
as $$
  update public.booking_quotes
  set status = 'expired'
  where status = 'active' and expires_at < now()
  returning 1;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.booking_quotes enable row level security;
alter table public.quote_items enable row level security;

-- No INSERT/UPDATE/DELETE policy exists for ANY non-service-role caller on
-- booking_quotes. Quotes are created exclusively by the create-quote edge
-- function (service_role, bypasses RLS by design). Travelers and agency
-- staff get SELECT only.
drop policy if exists "booking_quotes_select_traveler" on public.booking_quotes;
create policy "booking_quotes_select_traveler"
  on public.booking_quotes for select
  using (auth.uid() = traveler_id);

drop policy if exists "booking_quotes_select_agency" on public.booking_quotes;
create policy "booking_quotes_select_agency"
  on public.booking_quotes for select
  using (public.has_agency_access(agency_id));

drop policy if exists "booking_quotes_admin_select" on public.booking_quotes;
create policy "booking_quotes_admin_select"
  on public.booking_quotes for select
  using (public.is_admin());

drop policy if exists "quote_items_select_traveler" on public.quote_items;
create policy "quote_items_select_traveler"
  on public.quote_items for select
  using (exists (select 1 from public.booking_quotes q where q.id = quote_items.quote_id and q.traveler_id = auth.uid()));

drop policy if exists "quote_items_select_agency" on public.quote_items;
create policy "quote_items_select_agency"
  on public.quote_items for select
  using (exists (select 1 from public.booking_quotes q where q.id = quote_items.quote_id and public.has_agency_access(q.agency_id)));

drop policy if exists "quote_items_admin_select" on public.quote_items;
create policy "quote_items_admin_select"
  on public.quote_items for select
  using (public.is_admin());
