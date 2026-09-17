-- ============================================================================
-- Into Nepal — migration 11 of N: Settlement & Payouts
--
-- PHASE_1_ARCHITECTURE.md §3.8. Replaces the old payouts table's
-- `booking_ids UUID[]` accounting model, which target §17 explicitly forbids
-- ("Do NOT use booking_ids UUID[] as the primary payout accounting model"),
-- with a normalized payout_items join table. agency_earnings is a derived
-- summary view over financial_ledger, never an independent source of truth
-- — recomputing it is always just re-running the same SUM query, so it can
-- never drift from the ledger the way the old system's live-computed
-- AgencyEarnings.tsx aggregate could silently diverge from reality.
-- ============================================================================

create table public.payouts (
  id                         uuid primary key default gen_random_uuid(),
  agency_id                  uuid not null references public.agencies(id),
  status                     text not null default 'pending' check (status in (
                                'pending', 'processing', 'paid', 'failed', 'reversed'
                              )),
  total_amount               numeric(12,2) not null check (total_amount > 0),
  currency                   char(3) not null,
  provider_payout_reference  text,
  idempotency_key            text not null unique,
  period_start               date,
  period_end                 date,
  initiated_by               uuid references auth.users(id),
  created_at                 timestamptz not null default now(),
  completed_at               timestamptz
);

comment on table public.payouts is
  'A settlement batch. total_amount must equal SUM(payout_items.amount) for this payout — enforced by the trigger below, not just assumed.';

create index idx_payouts_agency on public.payouts (agency_id);
create index idx_payouts_status on public.payouts (status);

create table public.payout_items (
  id                        uuid primary key default gen_random_uuid(),
  payout_id                 uuid not null references public.payouts(id) on delete cascade,
  booking_id                uuid not null references public.bookings(id),
  financial_ledger_entry_id uuid not null references public.financial_ledger(id),
  amount                    numeric(12,2) not null check (amount > 0),
  unique (payout_id, booking_id)
  -- Prevents the same booking appearing twice WITHIN one payout. Preventing
  -- the same booking being paid out across TWO DIFFERENT payouts (the real
  -- "never pay a booking twice" guarantee, target §17/§39) additionally
  -- requires the application-layer check in create-payout (Phase 19): before
  -- creating a new payout, query for any existing payout_items row for a
  -- candidate booking_id across ALL payouts, not just the current one. This
  -- table's constraint is necessary but not sufficient on its own; the
  -- second unique index below closes the gap at the database layer too.
);

comment on table public.payout_items is
  'Normalized join, replacing the old booking_ids UUID[] design (explicitly forbidden by target §17). One row per booking included in a payout.';

-- Database-enforced "never pay the same booking twice, across ANY payout":
-- a booking_id can appear in payout_items at most once, full stop, regardless
-- of which payout it's attached to. This is the real teeth behind target
-- §17's "Payout must be idempotent. Never pay a booking twice." — not just
-- an application-level check that could be raced or forgotten.
create unique index idx_payout_items_booking_unique on public.payout_items (booking_id);

create index idx_payout_items_payout on public.payout_items (payout_id);

create or replace function public.assert_payout_total_matches_items()
returns trigger
language plpgsql
as $$
declare
  v_sum numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_sum from public.payout_items where payout_id = coalesce(new.payout_id, old.payout_id);
  if v_sum <> (select total_amount from public.payouts where id = coalesce(new.payout_id, old.payout_id)) then
    raise exception 'PAYOUT_TOTAL_MISMATCH: payout %.total_amount does not equal SUM(payout_items.amount)', coalesce(new.payout_id, old.payout_id)
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger assert_payout_total_matches_items
  after insert or update or delete on public.payout_items
  deferrable initially deferred  -- allows all items to be inserted within one
                                    -- transaction before the total is checked
  for each row execute function public.assert_payout_total_matches_items();

-- Wire the FK deferred from the Financial Ledger migration.
alter table public.financial_ledger
  add constraint financial_ledger_related_payout_id_fkey
  foreign key (related_payout_id) references public.payouts(id);

-- ── Agency earnings (derived summary, not an independent table of record) ──
-- Implemented as a VIEW rather than a materialized/summary table for this
-- phase — correctness over speed until real usage patterns justify caching.
-- If/when this needs to be materialized for performance, the refresh is
-- still just "re-run this exact query," so the single-source-of-truth
-- property is preserved either way.

create or replace view public.agency_earnings as
select
  a.id as agency_id,
  coalesce(sum(l.amount) filter (where l.entry_type = 'agency_funds_collected'), 0) as gross_collected,
  coalesce(sum(l.amount) filter (where l.entry_type = 'refund' and l.agency_id = a.id), 0) as refunded,
  coalesce(sum(l.amount) filter (where l.entry_type = 'adjustment'), 0) as adjustments,
  coalesce(sum(l.amount) filter (where l.entry_type = 'agency_funds_collected'), 0)
    + coalesce(sum(l.amount) filter (where l.entry_type = 'refund' and l.agency_id = a.id), 0)
    + coalesce(sum(l.amount) filter (where l.entry_type = 'adjustment'), 0)
    - coalesce(sum(l.amount) filter (where l.entry_type = 'payout'), 0) as net_payable,
  coalesce(sum(l.amount) filter (where l.entry_type = 'payout'), 0) as settled_to_date,
  now() as computed_at
from public.agencies a
left join public.financial_ledger l on l.agency_id = a.id
group by a.id;

comment on view public.agency_earnings is
  'Always re-derived from financial_ledger — never an independently-writable table, so it structurally cannot drift from the ledger (target §9''s reconciliation requirement). net_payable = gross_collected + refunded (refund amounts are already negative, per the ledger''s signed-amount convention) + adjustments - settled_to_date.';

-- ── Platform settings (pulled forward from the Admin & Audit bounded
--    context, PHASE_1_ARCHITECTURE.md §1, because is_booking_settlement_
--    eligible below needs settlement_delay_days to exist — LANGUAGE sql
--    functions are validated against the schema at CREATE time, confirmed
--    by actually running this migration set against the local instance
--    while building it. The Admin & Audit migration adds audit_logs and
--    settings-change auditing on top of this table; it does not redefine
--    the table itself.) ──────────────────────────────────────────────────

create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

comment on table public.platform_settings is
  'Configurable business rules (target §43): booking fee percentage, settlement delay, min/max booking amount, supported currencies, maintenance mode, etc. Every write is versioned via platform_settings_history (Admin & Audit migration) — normal users cannot modify this table at all (see RLS below).';

create trigger set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value, description) values
  ('booking_fee_percentage', '15'::jsonb, 'Into Nepal''s mandatory reservation fee, as a percentage of product_value (target §1). Frozen into each quote at creation time — changing this never retroactively affects an already-issued quote.'),
  ('settlement_delay_days', '14'::jsonb, 'Days after trip completion before platform-collected agency funds become settlement-eligible (target §5).'),
  ('inventory_hold_ttl_minutes', '15'::jsonb, 'How long an inventory hold (HELD reservation) survives before expiring if payment is not completed.'),
  ('supported_currencies', '["NPR", "USD"]'::jsonb, 'Currencies the platform can price/charge in (target §8).'),
  ('maintenance_mode', 'false'::jsonb, 'Kill switch: when true, booking/payment creation is blocked platform-wide.'),
  ('payments_enabled', 'true'::jsonb, 'Kill switch: when false, new payment attempts are blocked.'),
  ('payouts_enabled', 'true'::jsonb, 'Kill switch: when false, new payouts cannot be created.'),
  ('platform_name', '"Into Nepal"'::jsonb, 'Centralized brand name (target §35) — read by frontend/emails instead of a hardcoded string.'),
  ('support_email', '"support@intonepal.com"'::jsonb, 'Centralized support contact (target §35/§43) — placeholder pending the real domain being confirmed.')
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_public_select" on public.platform_settings;
create policy "platform_settings_public_select"
  on public.platform_settings for select
  using (true);
  -- Intentional USING (true) — the old system had exactly one legitimate
  -- case for this (AUDIT_REPORT.md noted it explicitly as acceptable: "the
  -- client needs to know if maintenance mode is on"), and it's preserved
  -- here for the same reason. This table only ever holds non-sensitive
  -- platform configuration, never secrets or PII — verified by inspecting
  -- every key inserted above.

drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write"
  on public.platform_settings for update
  using (public.is_admin())
  with check (public.is_admin());
  -- No insert/delete policy — settings rows are seeded by migrations only;
  -- application code only ever updates existing keys, never adds/removes
  -- them, which is enforced simply by not granting that capability.

-- ── Settlement eligibility check (target §5, exact conditions) ────────────

create or replace function public.is_booking_settlement_eligible(p_booking_id uuid)
returns boolean
language sql
stable
as $$
  select
    b.booking_status = 'completed'
    and b.payment_status = 'paid'
    and b.balance_status = 'paid'
    and b.balance_method = 'into_nepal_platform'
    and b.refund_status = 'none'
    and b.settlement_status in ('pending', 'eligible')
    and v.status = 'approved'
    and a.payout_account_reference is not null
    and b.completed_at is not null
    and b.completed_at + (
      (select (value #>> '{}')::int from public.platform_settings where key = 'settlement_delay_days') || ' days'
    )::interval <= now()
  from public.bookings b
  join public.agencies a on a.id = b.agency_id
  join public.agency_verification v on v.agency_id = a.id
  where b.id = p_booking_id;
$$;

comment on function public.is_booking_settlement_eligible(uuid) is
  'Implements target §5''s exact eligibility conditions: completed, paid both legs, no active refund, agency approved + payout account set, and completed_at + settlement_delay_days (from platform_settings, configurable per target §5/§43) has passed. Does NOT check for open disputes or administrative holds by name — those are represented by settlement_status already being on_hold (previous migration''s state machine), which this function''s "settlement_status in (pending, eligible)" condition already excludes.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;

drop policy if exists "payouts_select_agency" on public.payouts;
create policy "payouts_select_agency"
  on public.payouts for select
  using (public.has_agency_access(agency_id));

drop policy if exists "payouts_finance_admin_all" on public.payouts;
create policy "payouts_finance_admin_all"
  on public.payouts for all
  using (public.is_finance_or_admin())
  with check (public.is_finance_or_admin());
  -- No insert/update policy for agency staff at all — payouts are created
  -- and processed exclusively by FINANCE/admin via the create-payout/
  -- process-payout functions (Phase 19).

drop policy if exists "payout_items_select_agency" on public.payout_items;
create policy "payout_items_select_agency"
  on public.payout_items for select
  using (exists (select 1 from public.payouts p where p.id = payout_items.payout_id and public.has_agency_access(p.agency_id)));

drop policy if exists "payout_items_finance_admin_all" on public.payout_items;
create policy "payout_items_finance_admin_all"
  on public.payout_items for all
  using (public.is_finance_or_admin())
  with check (public.is_finance_or_admin());
