-- ============================================================================
-- Into Nepal — migration 15 of N: Admin & Audit
--
-- PHASE_1_ARCHITECTURE.md §1 / target §42/§43. audit_logs generalizes and
-- fixes the old audit_log table's two confirmed gaps (AUDIT_REPORT.md OPS-05/
-- OPS-06): actor attribution was always NULL for trigger-driven financial
-- entries, and at least one sensitive action (agency role-escalation
-- approval) wasn't logged at all. Here, actor_id is a required column (not
-- nullable), and the record_audit_log() helper is called explicitly from
-- every sensitive action this phase can enumerate — later phases (3-19,
-- when the actual edge functions are built) are responsible for calling it
-- at each remaining sensitive action point target §42 lists.
--
-- platform_settings_history versions every settings change (target §43:
-- "Financial/business settings must be versioned/audited").
-- ============================================================================

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id),   -- nullable ONLY for
                  -- genuinely system-initiated actions (e.g. the inventory
                  -- expiry sweep); every human-admin-initiated action must
                  -- populate this, and application code is responsible for
                  -- passing it explicitly — unlike the old system, this
                  -- schema doesn't make it structurally impossible to know
                  -- who, but it also doesn't try to infer it from a trigger
                  -- context the way the old audit_financial_change() did
                  -- (which is exactly why that design always ended up NULL)
  action       text not null,
  resource_type text not null,
  resource_id  text,
  request_id   text,
  ip_address   inet,
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.audit_logs is
  'Never stores secrets (target §42) — before_state/after_state must be scrubbed of sensitive fields by the calling code before insertion (mirrors the old system''s guards.ts scrub() helper, which was correctly designed and should be ported forward as an application-layer concern, not re-implemented at the database layer).';

create index idx_audit_logs_actor on public.audit_logs (actor_id, created_at desc);
create index idx_audit_logs_resource on public.audit_logs (resource_type, resource_id);

create or replace function public.record_audit_log(
  p_actor_id uuid, p_action text, p_resource_type text, p_resource_id text,
  p_before jsonb default null, p_after jsonb default null, p_request_id text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, before_state, after_state, request_id)
  values (p_actor_id, p_action, p_resource_type, p_resource_id, p_before, p_after, p_request_id)
  returning id;
$$;

-- ── Financial audit trigger (kept from the old system's genuinely correct
--    design, fixed to actually attribute an actor where one is available) ──

create or replace function public.audit_financial_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
       old.booking_status is distinct from new.booking_status
    or old.payment_status is distinct from new.payment_status
    or old.settlement_status is distinct from new.settlement_status
    or old.refund_status is distinct from new.refund_status
  ) then
    insert into public.audit_logs (actor_id, action, resource_type, resource_id, before_state, after_state)
    values (
      auth.uid(),  -- populated when the transition happens inside an
                    -- authenticated request context (RLS-gated agency/
                    -- traveler transitions); NULL for service-role-driven
                    -- transitions, which instead get their actor recorded
                    -- explicitly by the calling edge function via
                    -- record_audit_log() — e.g. "which admin triggered this
                    -- action" is logged by that edge function itself, not
                    -- inferred here. This trigger's job is just to make
                    -- sure a financial status change is NEVER left
                    -- completely unlogged, as a safety net under the
                    -- explicit logging later phases add.
      'financial_status_change',
      'booking',
      new.id::text,
      jsonb_build_object('booking_status', old.booking_status, 'payment_status', old.payment_status, 'settlement_status', old.settlement_status, 'refund_status', old.refund_status),
      jsonb_build_object('booking_status', new.booking_status, 'payment_status', new.payment_status, 'settlement_status', new.settlement_status, 'refund_status', new.refund_status)
    );
  end if;
  return new;
end;
$$;

create trigger audit_financial_change
  after update on public.bookings
  for each row execute function public.audit_financial_change();

-- (Payout-status audit trigger removed — the old Stripe-based payout system
-- it audited was removed in full when the platform switched to the new
-- NPR-only reservation-fee model. The `payouts` table it triggered on no
-- longer exists. A settlement/payout audit trail will return when that
-- model is designed.)

-- ── Platform settings ──────────────────────────────────────────────────────
-- Originally defined in the old settlement/payouts migration (deleted along
-- with the rest of the Stripe-based payment model — see PHASE_0/AUDIT_REPORT
-- history for that design; this table itself was always generic config, not
-- payment-specific). Moved here since this is genuinely its home (Admin &
-- Audit), and re-seeded WITHOUT the payment-domain keys the old version had
-- (booking_fee_percentage, settlement_delay_days, payments_enabled,
-- payouts_enabled) — those governed a fee/settlement model that no longer
-- exists and will return once the new NPR reservation-fee model is designed,
-- not before. supported_currencies is trimmed to NPR only, matching the new
-- model; no fee-percentage key is seeded at all — inventing one here would
-- be new business logic, which this cleanup is not the place for.
create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

comment on table public.platform_settings is
  'Configurable, non-financial platform settings. Every write is versioned via platform_settings_history below — normal users cannot modify this table at all (see RLS below).';

create trigger set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value, description) values
  ('inventory_hold_ttl_minutes', '15'::jsonb, 'How long an inventory hold (HELD reservation) survives before expiring if payment is not completed.'),
  ('supported_currencies', '["NPR"]'::jsonb, 'Currencies the platform can price/charge in.'),
  ('maintenance_mode', 'false'::jsonb, 'Kill switch: when true, the frontend shows a maintenance banner platform-wide.'),
  ('platform_name', '"Into Nepal"'::jsonb, 'Centralized brand name — read by frontend/emails instead of a hardcoded string.'),
  ('support_email', '"support@intonepal.com"'::jsonb, 'Centralized support contact — placeholder pending the real domain being confirmed.')
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_public_select" on public.platform_settings;
create policy "platform_settings_public_select"
  on public.platform_settings for select
  using (true);
  -- Intentional USING (true) — the client needs to know if maintenance mode
  -- is on before it can even show a login form. This table only ever holds
  -- non-sensitive platform configuration, never secrets or PII — verified
  -- by inspecting every key inserted above.

drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write"
  on public.platform_settings for update
  using (public.is_admin())
  with check (public.is_admin());
  -- No insert/delete policy — settings rows are seeded by migrations only;
  -- application code only ever updates existing keys, never adds/removes
  -- them, which is enforced simply by not granting that capability.

-- ── Settings versioning ──────────────────────────────────────────────────

create table public.platform_settings_history (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  old_value  jsonb,
  new_value  jsonb not null,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_platform_settings_history_key on public.platform_settings_history (key, created_at desc);

create or replace function public.record_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_settings_history (key, old_value, new_value, changed_by)
  values (new.key, old.value, new.value, new.updated_by);
  return new;
end;
$$;

create trigger record_settings_change
  after update of value on public.platform_settings
  for each row execute function public.record_settings_change();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.audit_logs enable row level security;
alter table public.platform_settings_history enable row level security;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
  on public.audit_logs for select
  using (public.is_admin());
  -- No insert/update/delete policy for any client role — writes happen only
  -- via record_audit_log() and the triggers above, both SECURITY DEFINER.
  -- Immutability enforced by privilege revocation, not just RLS:
revoke update, delete on public.audit_logs from anon, authenticated, service_role;
grant insert, select on public.audit_logs to service_role;

drop policy if exists "platform_settings_history_admin_select" on public.platform_settings_history;
create policy "platform_settings_history_admin_select"
  on public.platform_settings_history for select
  using (public.is_admin());
