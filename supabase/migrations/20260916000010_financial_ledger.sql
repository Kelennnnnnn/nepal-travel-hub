-- ============================================================================
-- Into Nepal — migration 10 of N: Financial Ledger
--
-- PHASE_1_ARCHITECTURE.md §3.7. The single most important new table in this
-- entire redesign. The old system had NOTHING equivalent — no
-- financial_ledger existed at all; audit_log recorded status transitions
-- (what changed) but never a structured, reconstructable record of WHERE
-- money actually went. This table is designed to make target §9's
-- non-negotiable rules literally true, not just documented as intent:
-- "NEVER overwrite historical financial records. NEVER simply edit a paid
-- amount. Use: original entry + adjustment/reversal/refund entry."
-- ============================================================================

create table public.financial_ledger (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid references public.bookings(id),  -- nullable: payouts
                        -- can reference multiple bookings via payout_items
                        -- (next migration) rather than one ledger row per
                        -- booking; a PAYOUT entry_type row may have no single
                        -- booking_id
  agency_id          uuid references public.agencies(id),   -- denormalized for
                        -- fast "what does this agency's ledger look like"
                        -- queries — always populated when booking_id is
  entry_type         text not null check (entry_type in (
                        'product_value', 'into_nepal_revenue', 'agency_funds_collected',
                        'agency_payable', 'refund', 'payout', 'adjustment'
                      )),
  amount             numeric(12,2) not null,   -- signed: positive = credit
                        -- toward the referenced party, negative = debit/reversal.
                        -- NOT constrained to > 0 — a REFUND entry is a negative
                        -- amount against the original AGENCY_FUNDS_COLLECTED
                        -- entry it compensates, per target §9's worked example.
  currency           char(3) not null,
  related_payment_id uuid references public.payments(id),
  related_refund_id  uuid references public.refunds(id),
  related_payout_id  uuid,  -- FK added in the Settlement & Payouts migration
                              -- (payouts doesn't exist yet at this point in
                              -- the migration order)
  description        text not null default '',
  created_by         text not null default 'system',  -- 'system' for
                        -- automated entries, or an admin user_id (as text,
                        -- for a simple audit trail) for manual ADJUSTMENT
                        -- entries — target §9/§43: "financial/business
                        -- settings must be versioned/audited," same
                        -- discipline applies to manual ledger entries.
  created_at         timestamptz not null default now()
  -- Deliberately NO updated_at column. There is nothing to update.
);

comment on table public.financial_ledger is
  'The immutable financial source of truth (target §9). Every other financial view (agency_earnings, admin reports) is a derived SUM over this table, never an independent number. Corrections are always a NEW compensating row, never an edit to an existing one — enforced below by revoking UPDATE/DELETE from every role.';

create index idx_financial_ledger_booking on public.financial_ledger (booking_id);
create index idx_financial_ledger_agency on public.financial_ledger (agency_id, entry_type);
create index idx_financial_ledger_entry_type on public.financial_ledger (entry_type);

-- ── Immutability, enforced at the privilege layer, not just by convention ──
-- Revoke UPDATE/DELETE from PUBLIC (which cascades to every role that
-- doesn't have an explicit, separate grant) so that literally no one —
-- not the table owner's default privileges, not a future careless migration
-- that adds a policy without thinking, not an admin via the client SDK —
-- can modify or remove a row here, ever, through normal SQL privileges.
-- Only INSERT is possible, and only for roles explicitly granted it below.

alter table public.financial_ledger enable row level security;

drop policy if exists "financial_ledger_select_agency" on public.financial_ledger;
create policy "financial_ledger_select_agency"
  on public.financial_ledger for select
  using (public.has_agency_access(agency_id));

drop policy if exists "financial_ledger_select_finance_admin" on public.financial_ledger;
create policy "financial_ledger_select_finance_admin"
  on public.financial_ledger for select
  using (public.is_finance_or_admin());

-- No INSERT policy exists for any client role at all (agency staff, admin
-- via the browser, anyone) — every ledger entry is written by a
-- service_role-authenticated server function (confirm-booking,
-- process-refund, process-payout), which bypasses RLS by design. This is
-- the mechanism, not just a stated intention, behind "financial events are
-- auditable" — there is no path to a ledger row that didn't originate from
-- one of those specific, reviewable functions.

-- Explicit belt-and-suspenders: Supabase grants ALL privileges (including
-- UPDATE/DELETE/TRUNCATE) directly to anon/authenticated/service_role on
-- every public-schema table by default — confirmed by inspecting
-- information_schema.table_privileges against the local instance while
-- building this migration; a bare `REVOKE ... FROM PUBLIC` does NOT touch
-- these direct grants, since PUBLIC is a separate pseudo-role. The revoke
-- below targets the three real roles explicitly, so even a service_role-
-- authenticated edge function (which bypasses RLS policies entirely) is
-- still structurally unable to UPDATE/DELETE a ledger row at the privilege
-- layer — RLS bypass and table-privilege grants are independent mechanisms
-- in Postgres, and this table intentionally relies on the latter, not RLS,
-- for its immutability guarantee.
revoke update, delete, truncate on public.financial_ledger from anon, authenticated, service_role;
grant insert, select on public.financial_ledger to service_role;
grant select on public.financial_ledger to authenticated;
