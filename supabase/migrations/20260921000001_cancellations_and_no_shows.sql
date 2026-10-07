-- ============================================================================
-- Into Nepal — Phase 22: Cancellation / no-show rules and refund DECISIONS
--
-- The platform owns the 15% reservation fee, the agency owns the 85%
-- balance. Every function in this migration DECIDES who owes the traveler
-- what and writes that decision down as a refund_records row — nothing here
-- ever calls a payment provider. A platform-side decision
-- (payer_side='platform') is pending_provider until the real refund job
-- (a later prompt) moves it; an agency-side decision (payer_side='agency')
-- is agency_owed with a 7-day due_by until the agency actually settles it
-- out of band — recovering an unsettled agency-owed amount from the agency's
-- security deposit is explicitly a later payments-phase job (agency_
-- penalties.amount is where that recovery job will look).
--
-- Read first: Prompt 20 migration (20260919000001, booking_quotes'
-- fee_refund_rule/cancellation_policy_snapshot/start_at/end_at snapshots),
-- Prompt 21 migration (20260920000001, cancel_booking_internal's minimal
-- stand-in — fully replaced here with the real fee+balance math), Prompt 4
-- (request_booking_cancellation/agency_set_trip_status, migration
-- 20260917000008 — request_booking_cancellation is NOT removed, see its own
-- comment below for why it still exists alongside traveler_cancel_booking).
-- ============================================================================

-- ── 0. bookings: no-show dispute deadline ───────────────────────────────────

alter table public.bookings add column no_show_dispute_deadline timestamptz;

comment on column public.bookings.no_show_dispute_deadline is
  'Set by agency_mark_no_show() to now()+48h. traveler_dispute_no_show()/traveler_report_agency_no_show() must be called before this passes. A no_show booking whose deadline passes with no dispute simply stays no_show forever (final) — no sweep touches it.';

-- ── 1. refund_records: extend Prompt 21's minimal stand-in with the real
--    shape (kind/payer_side/due_by/updated_at/provider_ref + the richer
--    status graph + the idempotency unique constraint). Backfill: every
--    existing row was created by Prompt 21's cancel_booking_internal, which
--    only ever refunded the platform-side reservation fee — kind=
--    'reservation_fee'/payer_side='platform' is the correct backfill for
--    100% of them, so a temporary default (dropped immediately after,
--    same "set only by the server, never implicit going forward" pattern
--    as every other such backfill in this schema) is safe here. ───────────

alter table public.refund_records
  add column kind         text not null default 'reservation_fee',
  add column payer_side   text not null default 'platform',
  add column due_by       timestamptz,
  add column updated_at   timestamptz not null default now(),
  add column provider_ref text;

alter table public.refund_records
  alter column kind drop default,
  alter column payer_side drop default;

alter table public.refund_records
  add constraint chk_refund_records_kind check (kind in ('reservation_fee', 'balance')),
  add constraint chk_refund_records_payer_side check (payer_side in ('platform', 'agency'));

alter table public.refund_records drop constraint refund_records_status_check;
alter table public.refund_records add constraint refund_records_status_check check (
  status in ('pending_provider', 'processing', 'succeeded', 'failed', 'agency_owed', 'settled_by_agency', 'offset_from_deposit')
);

comment on constraint refund_records_status_check on public.refund_records is
  'pending_provider/processing/succeeded/failed: the platform-side lifecycle (payer_side=platform), moved along by the real refund-processing job a later prompt builds. agency_owed/settled_by_agency/offset_from_deposit: the agency-side lifecycle (payer_side=agency) — agency_owed until the agency pays the traveler directly and support/finance marks it settled_by_agency, or until an unsettled amount is recovered from the agency''s security deposit (offset_from_deposit), also later-prompt jobs.';

alter table public.refund_records
  add constraint uq_refund_records_booking_kind_reason unique (booking_id, kind, reason_code);

comment on constraint uq_refund_records_booking_kind_reason on public.refund_records is
  'The idempotency guarantee every function in this migration relies on: calling cancel_booking_internal() (or anything that calls it) twice for the same booking+kind+reason_code creates the refund_records row once, via ON CONFLICT DO NOTHING at every insert site below.';

create trigger set_updated_at
  before update on public.refund_records
  for each row execute function public.set_updated_at();

create policy "refund_records_agency_select"
  on public.refund_records for select
  using (exists (select 1 from public.bookings b where b.id = refund_records.booking_id and public.has_agency_access(b.agency_id)));

-- ── 2. agency_strikes: widen `kind` to cover every strike-worthy event this
--    migration adds (Prompt 21 only ever had 'no_response'). agency_
--    penalties: the financial twin of a strike — the fee amount the
--    platform refunded that the agency is on the hook for, recovered from
--    the security deposit once that mechanism exists (a later prompt). ────

alter table public.agency_strikes drop constraint agency_strikes_kind_check;
alter table public.agency_strikes add constraint agency_strikes_kind_check
  check (kind in ('no_response', 'agency_cancelled', 'agency_no_show'));

create table public.agency_penalties (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  booking_id uuid references public.bookings(id),
  kind       text not null check (kind in ('agency_cancelled', 'agency_no_show', 'no_response')),
  amount     numeric(12,2) not null check (amount >= 0),
  status     text not null default 'open' check (status in ('open')),
  created_at timestamptz not null default now()
);

comment on table public.agency_penalties is
  'The reservation fee the platform refunded on the agency''s account (agency cancelled, agency no-showed, or never responded in time). status is deliberately a single value for now — "how this actually gets recovered from the security deposit" is a later payments-phase job, not built here, same reasoning as this migration''s header. Always paired with an agency_strikes row of the same kind, inserted by the same caller in the same transaction.';

create index idx_agency_penalties_agency on public.agency_penalties (agency_id, created_at desc);

alter table public.agency_penalties enable row level security;

create policy "agency_penalties_staff_select"
  on public.agency_penalties for select
  using (public.has_agency_access(agency_id));

create policy "agency_penalties_admin_all"
  on public.agency_penalties for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. cancel_booking_internal() — re-created with the real fee+balance
--    refund math (Prompt 21's version always refunded 100% of whatever was
--    paid as a single platform-side record; this version splits fee vs.
--    balance at their own percentages and routes the balance refund to the
--    agency, per this migration's header). Still internal only — zero
--    grants, including service_role; reached exclusively via another
--    SECURITY DEFINER function's owner privilege. Idempotent: a second call
--    on an already-cancelled booking is a no-op (and even if that guard were
--    somehow bypassed, uq_refund_records_booking_kind_reason plus the ON
--    CONFLICT DO NOTHING below stop a duplicate refund row either way). ────
-- Dropped (not just replaced) first: the new signature has 5 arguments,
-- not 4 — CREATE OR REPLACE with a different argument list creates a
-- second, OVERLOADED function rather than replacing the old one, which
-- would leave Prompt 21's original 4-arg version still live (and still
-- granted to nobody, but still a second, divergent copy of "the one place
-- a booking becomes cancelled" — exactly the kind of drift this schema's
-- "re-create in full" convention exists to prevent).
drop function if exists public.cancel_booking_internal(uuid, text, text, numeric);

create or replace function public.cancel_booking_internal(
  p_booking_id            uuid,
  p_cancelled_by          text,
  p_reason_code           text,
  p_fee_refund_percent    numeric,
  p_balance_refund_percent numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      public.bookings;
  v_quote        public.booking_quotes;
  v_fee_paid     boolean;
  v_fee_amount   numeric;
  v_balance_amount numeric;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.booking_status = 'cancelled' then
    return; -- idempotent no-op
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if v_quote.id is not null and v_quote.inventory_reservation_id is not null then
    perform public.release_reservation(v_quote.inventory_reservation_id, 'cancelled');
  end if;
  update public.booking_quotes set status = 'cancelled' where id = v_booking.quote_id and status = 'active';

  -- in_progress has no direct ->cancelled edge in the state graph (by
  -- design — a trip already underway shouldn't vanish in one step); every
  -- other source status this migration's callers ever pass in (confirmed,
  -- awaiting_agency_confirmation, cancel_requested, expired, disputed) does
  -- have one, so this is the only two-step case needed.
  if v_booking.booking_status = 'in_progress' then
    update public.bookings set booking_status = 'cancel_requested' where id = p_booking_id;
  end if;

  update public.bookings
  set booking_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_cancelled_by,
      cancellation_reason_code = p_reason_code
  where id = p_booking_id;

  select exists(select 1 from public.payment_events where booking_id = p_booking_id and kind = 'reservation_fee') into v_fee_paid;

  if v_fee_paid then
    if p_fee_refund_percent > 0 then
      v_fee_amount := round(v_quote.platform_fee * p_fee_refund_percent / 100, 2);
      insert into public.refund_records (booking_id, kind, payer_side, amount, currency, reason_code, status)
      values (p_booking_id, 'reservation_fee', 'platform', v_fee_amount, v_quote.currency, p_reason_code, 'pending_provider')
      on conflict (booking_id, kind, reason_code) do nothing;
    end if;

    if v_quote.payment_requirement = 'full_online' and p_balance_refund_percent > 0 then
      v_balance_amount := round(v_quote.agency_balance * p_balance_refund_percent / 100, 2);
      insert into public.refund_records (booking_id, kind, payer_side, amount, currency, reason_code, status, due_by)
      values (p_booking_id, 'balance', 'agency', v_balance_amount, v_quote.currency, p_reason_code, 'agency_owed', now() + interval '7 days')
      on conflict (booking_id, kind, reason_code) do nothing;
    end if;
  end if;

  perform public.record_booking_event(
    p_booking_id, 'BOOKING_CANCELLED',
    jsonb_build_object(
      'cancelled_by', p_cancelled_by, 'reason_code', p_reason_code,
      'fee_refund_percent', p_fee_refund_percent, 'fee_refund_amount', v_fee_amount,
      'balance_refund_percent', p_balance_refund_percent, 'balance_refund_amount', v_balance_amount
    )
  );

  -- A generic, universally-applicable BOOKING_CANCELLED notification for
  -- every path EXCEPT the two Prompt 21 paths that already emit their own
  -- richer, specifically-worded domain event with a tested dispatch-
  -- notifications handler (agency decline -> BOOKING_DECLINED_BY_AGENCY,
  -- confirmation timeout -> BOOKING_AGENCY_TIMEOUT) — emitting both here
  -- would double-notify the traveler for the exact same cancellation.
  if p_reason_code not in ('agency_declined', 'agency_no_response') then
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_CANCELLED', 'booking', p_booking_id, jsonb_build_object(
      'cancelled_by', p_cancelled_by, 'reason_code', p_reason_code,
      'fee_refund_amount', coalesce(v_fee_amount, 0), 'balance_refund_amount', coalesce(v_balance_amount, 0),
      'currency', v_quote.currency
    ));
  end if;
end;
$$;

comment on function public.cancel_booking_internal(uuid, text, text, numeric, numeric) is
  'The one place a booking actually becomes cancelled with refund decisions attached. Fee refund is a percentage of quote.platform_fee (payer_side=platform, pending_provider); balance refund only applies when payment_requirement=full_online and is a percentage of quote.agency_balance (payer_side=agency, agency_owed, due in 7 days) — a fee_only booking never had a balance paid through the platform, so there is nothing to refund on that side regardless of percentage. Strikes/penalties are NOT this function''s job — callers that need one (agency_cancel_booking, expire_agency_confirmations, admin_resolve_dispute) insert it themselves, in the same transaction, right after calling this.';

revoke all on function public.cancel_booking_internal(uuid, text, text, numeric, numeric) from public, anon, authenticated, service_role;

-- ── 3b. Prompt 21's three callers of the old 4-arg cancel_booking_internal
--    re-created with the new 5-arg call (100, 100 everywhere — every one of
--    these paths already meant "refund everything that was paid", now
--    expressed as fee and balance separately instead of one blended
--    percent). Nothing else about their bodies changes except
--    expire_agency_confirmations(), which also gains the agency_penalties
--    row this migration's header says every strike-worthy event should
--    have (Prompt 21 only ever inserted the strike). ───────────────────────

create or replace function public.mark_reservation_fee_paid(
  p_booking_id   uuid,
  p_provider     text,
  p_provider_ref text,
  p_amount       numeric,
  p_currency     text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_event_id  uuid;
  v_booking             public.bookings;
  v_quote               public.booking_quotes;
  v_departure_date      date;
  v_date_status         text;
  v_new_reservation_id  uuid;
  v_hold_expired        boolean;
  v_result_status       text;
begin
  select id into v_existing_event_id from public.payment_events
  where provider = p_provider and provider_ref = p_provider_ref;

  if v_existing_event_id is not null then
    select booking_status into v_result_status from public.bookings where id = p_booking_id;
    return v_result_status;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.booking_status not in ('pending_payment', 'payment_processing', 'expired') then
    raise exception 'BOOKING_NOT_PAYABLE' using errcode = 'P0001', detail = v_booking.booking_status;
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if p_amount <> v_quote.amount_due_now or p_currency <> v_quote.currency then
    insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
    values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());
    return v_booking.booking_status;
  end if;

  insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
  values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());

  if v_booking.payment_status = 'unpaid' then
    update public.bookings set payment_status = 'pending' where id = p_booking_id;
  end if;
  update public.bookings set payment_status = 'processing' where id = p_booking_id and payment_status = 'pending';
  update public.bookings set payment_status = 'paid' where id = p_booking_id and payment_status = 'processing';

  select d.departure_date into v_departure_date from public.departures d where d.id = v_booking.departure_id;
  v_hold_expired := v_booking.booking_status = 'expired' or v_quote.status = 'expired' or v_quote.expires_at < now();

  if v_hold_expired then
    v_date_status := public.is_date_bookable(v_booking.listing_id, v_departure_date, v_booking.participant_count);

    if v_date_status = 'open' then
      v_new_reservation_id := public.hold_inventory(v_booking.departure_id, v_booking.participant_count, 30);
      update public.inventory_reservations set booking_id = p_booking_id where id = v_new_reservation_id;
      update public.booking_quotes
        set inventory_reservation_id = v_new_reservation_id, status = 'active', expires_at = now() + interval '30 minutes'
        where id = v_booking.quote_id;
      v_quote.inventory_reservation_id := v_new_reservation_id;

      if v_booking.booking_status <> 'payment_processing' then
        update public.bookings set booking_status = 'payment_processing' where id = p_booking_id;
      end if;
    else
      perform public.cancel_booking_internal(p_booking_id, 'system', 'paid_after_expiry', 100, 100);
      perform public.record_booking_event(p_booking_id, 'RESERVATION_FEE_PAID', jsonb_build_object('provider', p_provider, 'amount', p_amount, 'currency', p_currency));
      return 'cancelled';
    end if;
  else
    if v_booking.booking_status = 'pending_payment' then
      update public.bookings set booking_status = 'payment_processing' where id = p_booking_id;
    end if;
  end if;

  perform public.confirm_reservation(v_quote.inventory_reservation_id, p_booking_id);
  update public.booking_quotes set status = 'consumed' where id = v_booking.quote_id and status = 'active';

  if v_quote.confirmation_mode = 'instant' then
    update public.bookings set booking_status = 'confirmed' where id = p_booking_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_CONFIRMED', 'booking', p_booking_id, '{}'::jsonb);
    v_result_status := 'confirmed';
  else
    update public.bookings
    set booking_status = 'awaiting_agency_confirmation', agency_confirm_deadline = now() + interval '24 hours'
    where id = p_booking_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AWAITING_AGENCY', 'booking', p_booking_id, '{}'::jsonb);
    v_result_status := 'awaiting_agency_confirmation';
  end if;

  perform public.record_booking_event(
    p_booking_id, 'RESERVATION_FEE_PAID',
    jsonb_build_object('provider', p_provider, 'amount', p_amount, 'currency', p_currency)
  );

  return v_result_status;
end;
$$;

comment on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) is
  'Called only by the payments-phase webhook after signature verification. Never expose to clients. Idempotent on (p_provider, p_provider_ref); rejects an amount/currency mismatch against the frozen quote without confirming (but still records the event); re-reserves capacity for a hold that expired before payment arrived, cancelling with a full fee+balance refund (Phase 22''s cancel_booking_internal) if that capacity is gone.';

revoke all on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) to service_role;

create or replace function public.agency_respond_to_booking(
  p_booking_id uuid, p_accept boolean, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_booking.agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if v_booking.booking_status <> 'awaiting_agency_confirmation' then
    raise exception 'NOT_AWAITING_CONFIRMATION' using errcode = 'P0001';
  end if;

  if v_booking.agency_confirm_deadline < now() then
    raise exception 'DEADLINE_PASSED' using errcode = 'P0001';
  end if;

  if p_accept then
    update public.bookings set booking_status = 'confirmed' where id = p_booking_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_CONFIRMED', 'booking', p_booking_id, '{}'::jsonb);
    perform public.record_booking_event(p_booking_id, 'AGENCY_ACCEPTED', '{}'::jsonb);
  else
    if p_reason is null or char_length(p_reason) < 10 or char_length(p_reason) > 500 then
      raise exception 'INVALID_REASON: decline reason must be 10-500 characters' using errcode = 'P0001';
    end if;
    perform public.cancel_booking_internal(p_booking_id, 'agency', 'agency_declined', 100, 100);
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_DECLINED_BY_AGENCY', 'booking', p_booking_id, jsonb_build_object('reason', p_reason));
    perform public.record_booking_event(p_booking_id, 'AGENCY_DECLINED', jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

comment on function public.agency_respond_to_booking(uuid, boolean, text) is
  'Manager+ of the booking''s agency only (staff may view, never respond — has_agency_access(..., ''manager'') enforces this). Accept requires still being before agency_confirm_deadline; decline requires a 10-500 character reason and goes through cancel_booking_internal() for a full fee+balance refund.';

revoke all on function public.agency_respond_to_booking(uuid, boolean, text) from public, anon;
grant execute on function public.agency_respond_to_booking(uuid, boolean, text) to authenticated;

create or replace function public.respond_via_token(p_token text, p_accept boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash text;
  v_row        public.booking_action_tokens;
  v_booking    public.bookings;
begin
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_row from public.booking_action_tokens where token_hash = v_token_hash for update;
  if v_row.id is null then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;
  if v_row.used_at is not null then
    raise exception 'TOKEN_ALREADY_USED' using errcode = 'P0001';
  end if;
  if v_row.expires_at < now() then
    raise exception 'TOKEN_EXPIRED' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings where id = v_row.booking_id for update;
  if v_booking.id is null or v_booking.booking_status <> 'awaiting_agency_confirmation' then
    raise exception 'NOT_AWAITING_CONFIRMATION' using errcode = 'P0001';
  end if;
  if v_booking.agency_confirm_deadline < now() then
    raise exception 'DEADLINE_PASSED' using errcode = 'P0001';
  end if;

  update public.booking_action_tokens set used_at = now() where id = v_row.id;

  if p_accept then
    update public.bookings set booking_status = 'confirmed' where id = v_booking.id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_CONFIRMED', 'booking', v_booking.id, '{}'::jsonb);
    perform public.record_booking_event(v_booking.id, 'AGENCY_ACCEPTED', jsonb_build_object('via', 'token', 'token_id', v_row.id));
  else
    if p_reason is null or char_length(p_reason) < 10 or char_length(p_reason) > 500 then
      raise exception 'INVALID_REASON: decline reason must be 10-500 characters' using errcode = 'P0001';
    end if;
    perform public.cancel_booking_internal(v_booking.id, 'agency', 'agency_declined', 100, 100);
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_DECLINED_BY_AGENCY', 'booking', v_booking.id, jsonb_build_object('reason', p_reason));
    perform public.record_booking_event(v_booking.id, 'AGENCY_DECLINED', jsonb_build_object('via', 'token', 'token_id', v_row.id));
  end if;
end;
$$;

comment on function public.respond_via_token(text, boolean, text) is
  'The one-tap accept/decline link''s backing RPC. The token IS the credential (no login required) — grant to anon is deliberate; rate limiting against abuse is the edge function wrapper''s job. The booking acted on is derived entirely from the token row, never a client-supplied booking id.';

revoke all on function public.respond_via_token(text, boolean, text) from public;
grant execute on function public.respond_via_token(text, boolean, text) to anon, authenticated;

create or replace function public.expire_agency_confirmations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select id from public.bookings
    where booking_status = 'awaiting_agency_confirmation'
      and agency_reminder_sent_at is null
      and agency_confirm_deadline > now()
      and agency_confirm_deadline - now() <= interval '12 hours'
    for update skip locked
  loop
    update public.bookings set agency_reminder_sent_at = now() where id = v_row.id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AGENCY_REMINDER', 'booking', v_row.id, '{}'::jsonb);
  end loop;

  for v_row in
    select id, agency_id, quote_id from public.bookings
    where booking_status = 'awaiting_agency_confirmation' and agency_confirm_deadline < now()
    for update skip locked
  loop
    perform public.cancel_booking_internal(v_row.id, 'system', 'agency_no_response', 100, 100);
    insert into public.agency_strikes (agency_id, booking_id, kind) values (v_row.agency_id, v_row.id, 'no_response');
    insert into public.agency_penalties (agency_id, booking_id, kind, amount)
    select v_row.agency_id, v_row.id, 'no_response', q.platform_fee from public.booking_quotes q where q.id = v_row.quote_id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AGENCY_TIMEOUT', 'booking', v_row.id, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_agency_confirmations() is
  'pg_cron, every 5 minutes. Reminders fire once per booking (agency_reminder_sent_at dedups); timeouts cancel with a full fee+balance refund, record an agency_strikes row AND an agency_penalties row (Phase 22 — the fee amount recoverable from the agency''s security deposit), and emit BOOKING_AGENCY_TIMEOUT. FOR UPDATE SKIP LOCKED, idempotent.';

revoke all on function public.expire_agency_confirmations() from public, anon, authenticated, service_role;

-- ── 4. compute_cancellation_refund_internal() / compute_traveler_
--    cancellation() — the "what will I get back" preview, and the exact
--    same math traveler_cancel_booking() and agency_cancel_booking()'s
--    traveler_request branch apply. Split in two so the public, ownership-
--    checked wrapper and an agency-staff-initiated "on the traveler's
--    behalf" cancellation can share one implementation without either
--    bypassing the other's auth check. ───────────────────────────────────

create or replace function public.compute_cancellation_refund_internal(p_booking_id uuid)
returns table(fee_refund_percent integer, balance_refund_percent integer, free_until timestamptz, explanation text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quote             public.booking_quotes;
  v_free_cancel_hours numeric;
  v_free_until        timestamptz;
  v_days_before       numeric;
  v_tier              jsonb;
  v_balance_percent   integer;
  v_fee_percent       integer;
  v_explanation       text;
begin
  select q.* into v_quote
  from public.bookings b join public.booking_quotes q on q.id = b.quote_id
  where b.id = p_booking_id;

  if v_quote.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_free_cancel_hours := (v_quote.fee_refund_rule ->> 'free_cancel_hours')::numeric;
  v_free_until := v_quote.start_at - (v_free_cancel_hours || ' hours')::interval;

  if now() < v_free_until then
    v_fee_percent := 100;
    if v_quote.payment_requirement = 'full_online' then
      v_balance_percent := 100;
      v_explanation := format(
        'Free cancellation until %s (Nepal time) — your reservation fee and the full balance are refunded in full.',
        to_char(v_free_until at time zone 'Asia/Kathmandu', 'HH12:MI AM, DD Mon')
      );
    else
      v_balance_percent := 0;
      v_explanation := format(
        'Free cancellation until %s (Nepal time) — your reservation fee is refunded in full.',
        to_char(v_free_until at time zone 'Asia/Kathmandu', 'HH12:MI AM, DD Mon')
      );
    end if;
  else
    v_fee_percent := 0;
    v_balance_percent := 0;

    if v_quote.payment_requirement = 'full_online' then
      v_days_before := extract(epoch from (v_quote.start_at - now())) / 86400.0;
      for v_tier in select * from jsonb_array_elements(v_quote.cancellation_policy_snapshot -> 'tiers') loop
        if v_days_before >= (v_tier ->> 'days')::numeric then
          v_balance_percent := (v_tier ->> 'refund_percent')::numeric;
          exit;
        end if;
      end loop;
      v_explanation := format(
        'Past the free-cancellation window: the reservation fee is non-refundable, and %s%% of the balance is refunded per the listing''s cancellation policy.',
        v_balance_percent
      );
    else
      v_explanation := 'Past the free-cancellation window: the reservation fee is non-refundable.';
    end if;
  end if;

  return query select v_fee_percent, v_balance_percent, v_free_until, v_explanation;
end;
$$;

comment on function public.compute_cancellation_refund_internal(uuid) is
  'Pure function of the booking''s QUOTE SNAPSHOT (fee_refund_rule, cancellation_policy_snapshot, start_at, payment_requirement) and now() — never the current listing, which may have changed since. No ownership check (internal only, zero grants) — compute_traveler_cancellation() below is the ownership-checked, client-reachable wrapper.';

revoke all on function public.compute_cancellation_refund_internal(uuid) from public, anon, authenticated, service_role;

create or replace function public.compute_traveler_cancellation(p_booking_id uuid)
returns table(fee_refund_percent integer, balance_refund_percent integer, free_until timestamptz, explanation text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.bookings b where b.id = p_booking_id and b.traveler_id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return query select * from public.compute_cancellation_refund_internal(p_booking_id);
end;
$$;

comment on function public.compute_traveler_cancellation(uuid) is
  'The checkout/booking-page "you''ll get back NPR X" preview. Own booking only. Read-only — computing this never creates a refund_records row; only traveler_cancel_booking() actually cancelling does.';

revoke all on function public.compute_traveler_cancellation(uuid) from public, anon;
grant execute on function public.compute_traveler_cancellation(uuid) to authenticated;

-- ── 5. traveler_cancel_booking() — supersedes request_booking_cancellation
--    (migration 20260917000008) for every NORMAL cancellation: that
--    function only ever moved a booking to cancel_requested and stopped,
--    deliberately, because no refund logic existed yet when it was built.
--    It is NOT removed or altered here (rule: never edit an existing
--    migration) — it remains the path for a "special request to support"
--    after start_at, or any case this function''s own guards reject (e.g. a
--    pending_payment booking, which still correctly raises NOT_CANCELLABLE
--    from that function, since nothing has been paid yet to refund). ──────

create or replace function public.traveler_cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
  v_refund  record;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.booking_status not in ('confirmed', 'awaiting_agency_confirmation') then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;
  if now() >= v_quote.start_at then
    raise exception 'ALREADY_STARTED' using errcode = 'P0001';
  end if;

  select * into v_refund from public.compute_cancellation_refund_internal(p_booking_id);

  perform public.cancel_booking_internal(p_booking_id, 'traveler', 'traveler_cancelled', v_refund.fee_refund_percent, v_refund.balance_refund_percent);

  perform public.record_booking_event(p_booking_id, 'TRAVELER_CANCELLED', jsonb_build_object('reason', left(coalesce(p_reason, ''), 1000)));
end;
$$;

comment on function public.traveler_cancel_booking(uuid, text) is
  'The real traveler-initiated cancellation, with refund decisions attached via compute_cancellation_refund_internal(). Own booking only, only from confirmed/awaiting_agency_confirmation, only before the quote''s start_at.';

revoke all on function public.traveler_cancel_booking(uuid, text) from public, anon;
grant execute on function public.traveler_cancel_booking(uuid, text) to authenticated;

-- ── 6. booking_disruptions + agency_cancel_booking() ────────────────────────

create table public.booking_disruptions (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  reason_code     text not null check (reason_code in ('conditions_weather', 'conditions_flight', 'conditions_safety')),
  note            text,
  offered_at      timestamptz not null default now(),
  traveler_choice text check (traveler_choice in ('reschedule', 'refund')),
  resolved_at     timestamptz,
  choice_deadline timestamptz not null,
  created_by      uuid references auth.users(id)
);

comment on table public.booking_disruptions is
  'An agency-initiated "we cannot run this as planned" report for genuine operating conditions (weather/flight/safety) — not a fault-based cancellation, so it never creates an agency_strikes/agency_penalties row. The traveler picks a free date change or a full refund via traveler_reschedule()/traveler_choose_refund(); expire_disruption_choices() defaults to a full refund if choice_deadline passes unanswered.';

create index idx_booking_disruptions_booking on public.booking_disruptions (booking_id);
create index idx_booking_disruptions_open on public.booking_disruptions (choice_deadline) where resolved_at is null;

alter table public.booking_disruptions enable row level security;

create policy "booking_disruptions_traveler_select"
  on public.booking_disruptions for select
  using (exists (select 1 from public.bookings b where b.id = booking_disruptions.booking_id and b.traveler_id = auth.uid()));

create policy "booking_disruptions_agency_select"
  on public.booking_disruptions for select
  using (exists (select 1 from public.bookings b where b.id = booking_disruptions.booking_id and public.has_agency_access(b.agency_id)));

create policy "booking_disruptions_admin_all"
  on public.booking_disruptions for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.agency_cancel_booking(p_booking_id uuid, p_reason_code text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
  v_refund  record;
begin
  if p_reason_code not in ('agency_unavailable', 'conditions_weather', 'conditions_flight', 'conditions_safety', 'traveler_request') then
    raise exception 'INVALID_REASON_CODE' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_booking.agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if v_booking.booking_status <> 'confirmed' then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if p_reason_code = 'agency_unavailable' then
    perform public.cancel_booking_internal(p_booking_id, 'agency', 'agency_unavailable', 100, 100);
    insert into public.agency_penalties (agency_id, booking_id, kind, amount)
    values (v_booking.agency_id, p_booking_id, 'agency_cancelled', v_quote.platform_fee);
    insert into public.agency_strikes (agency_id, booking_id, kind)
    values (v_booking.agency_id, p_booking_id, 'agency_cancelled');
    perform public.record_booking_event(p_booking_id, 'AGENCY_CANCELLED', jsonb_build_object('reason', left(coalesce(p_reason, ''), 1000)));

  elsif p_reason_code in ('conditions_weather', 'conditions_flight', 'conditions_safety') then
    insert into public.booking_disruptions (booking_id, reason_code, note, choice_deadline, created_by)
    values (p_booking_id, p_reason_code, left(coalesce(p_reason, ''), 1000), least(v_quote.start_at, now() + interval '72 hours'), auth.uid());

    update public.bookings set booking_status = 'cancel_requested' where id = p_booking_id;

    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_DISRUPTED', 'booking', p_booking_id, jsonb_build_object('reason_code', p_reason_code, 'note', p_reason));
    perform public.record_booking_event(p_booking_id, 'DISRUPTION_REPORTED', jsonb_build_object('reason_code', p_reason_code));

  else -- 'traveler_request': the agency cancelling ON BEHALF OF the traveler
    select * into v_refund from public.compute_cancellation_refund_internal(p_booking_id);
    perform public.cancel_booking_internal(p_booking_id, 'agency', 'traveler_request_via_agency', v_refund.fee_refund_percent, v_refund.balance_refund_percent);
    perform public.record_booking_event(p_booking_id, 'AGENCY_CANCELLED_FOR_TRAVELER', jsonb_build_object('actor', auth.uid(), 'reason', left(coalesce(p_reason, ''), 1000)));
  end if;
end;
$$;

comment on function public.agency_cancel_booking(uuid, text, text) is
  'Manager+ of the booking''s agency, only from confirmed. agency_unavailable is a fault-based cancellation (full refund + strike + penalty). conditions_weather/_flight/_safety are NOT fault-based — they open a booking_disruptions row and move the booking to cancel_requested, leaving the actual outcome (reschedule or refund) to the traveler via traveler_reschedule()/traveler_choose_refund(). traveler_request applies the same math as a traveler-initiated cancellation (compute_cancellation_refund_internal), but audited as agency-initiated.';

revoke all on function public.agency_cancel_booking(uuid, text, text) from public, anon;
grant execute on function public.agency_cancel_booking(uuid, text, text) to authenticated;

-- ── 7. Disruption choices: reschedule (free date change, same price) or
--    refund — plus the deadline sweep that defaults to a refund. ───────────
--
-- guard_booking_immutable_fields (audit H2, migration 20260917000008) hard-
-- blocks quote_id/departure_id from ever changing on an UPDATE that isn't
-- service_role/admin — correct for every path except this one: a reschedule
-- genuinely needs to move the booking onto a new departure with a new quote
-- row (the old one stays, immutably, as the historical record of what was
-- originally booked). Re-created in full with one narrow, explicitly-
-- flagged exception rather than weakening the guard generally.

create or replace function public.guard_booking_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
  v_reschedule_in_progress boolean :=
    coalesce(nullif(current_setting('app.booking_reschedule_in_progress', true), '')::boolean, false);
begin
  if v_is_service_role or public.is_admin() then
    return new;
  end if;

  if (new.quote_id is distinct from old.quote_id or new.departure_id is distinct from old.departure_id)
     and not v_reschedule_in_progress then
    raise exception 'IMMUTABLE_FIELD_CHANGE' using errcode = 'P0001';
  end if;

  if new.agency_id is distinct from old.agency_id
     or new.traveler_id is distinct from old.traveler_id
     or new.participant_count is distinct from old.participant_count
     or new.booking_ref is distinct from old.booking_ref
     or new.created_at is distinct from old.created_at
  then
    raise exception 'IMMUTABLE_FIELD_CHANGE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_booking_immutable_fields() is
  'Audit H2, extended by Phase 22''s traveler_reschedule(): quote_id/departure_id may change ONLY while app.booking_reschedule_in_progress is set (transaction-local, set by traveler_reschedule() immediately before its one UPDATE and never readable by any client — it is a GUC, not a column). Every other immutable field, and quote_id/departure_id for every other caller, is blocked exactly as before.';

drop trigger if exists guard_booking_immutable_fields on public.bookings;
create trigger guard_booking_immutable_fields
  before update on public.bookings
  for each row execute function public.guard_booking_immutable_fields();

create or replace function public.traveler_reschedule(p_booking_id uuid, p_new_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking        public.bookings;
  v_quote          public.booking_quotes;
  v_disruption     public.booking_disruptions;
  v_listing        public.listings;
  v_date_status    text;
  v_new_departure  uuid;
  v_new_reservation uuid;
  v_new_quote_id   uuid;
  v_new_start_at   timestamptz;
  v_new_end_at     timestamptz;
  v_old_item       public.quote_items;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_disruption from public.booking_disruptions
  where booking_id = p_booking_id and resolved_at is null
  order by offered_at desc limit 1 for update;
  if v_disruption.id is null then
    raise exception 'NO_OPEN_DISRUPTION' using errcode = 'P0001';
  end if;

  v_date_status := public.is_date_bookable(v_booking.listing_id, p_new_date, v_booking.participant_count);
  if v_date_status <> 'open' then
    raise exception 'DATE_NOT_BOOKABLE' using errcode = 'P0001', detail = v_date_status;
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;
  select * into v_listing from public.listings where id = v_booking.listing_id;
  select * into v_old_item from public.quote_items where quote_id = v_quote.id and item_type = 'base_product' limit 1;

  if v_quote.inventory_reservation_id is not null then
    perform public.release_reservation(v_quote.inventory_reservation_id, 'cancelled');
  end if;

  v_new_departure := public.ensure_departure(v_booking.listing_id, p_new_date);
  v_new_reservation := public.hold_inventory(v_new_departure, v_booking.participant_count, 30);
  update public.inventory_reservations set booking_id = p_booking_id where id = v_new_reservation;
  perform public.confirm_reservation(v_new_reservation, p_booking_id);

  v_new_start_at := (p_new_date + v_listing.default_start_time) at time zone 'Asia/Kathmandu';
  v_new_end_at := v_new_start_at + (ceil(v_listing.duration_days)::int || ' days')::interval;

  -- Price is NOT re-derived from resolve_unit_price() for the new date —
  -- the traveler keeps the originally-quoted amounts exactly, copied
  -- verbatim from the old quote, only the date/departure/reservation move.
  insert into public.booking_quotes (
    listing_id, departure_id, agency_id, traveler_id, participant_count,
    product_value, platform_fee_percent, platform_fee, agency_balance, currency,
    cancellation_policy_snapshot, inventory_reservation_id, status, expires_at,
    confirmation_mode, payment_requirement, amount_due_now, start_at, end_at,
    no_show_grace_minutes, fee_refund_rule
  ) values (
    v_booking.listing_id, v_new_departure, v_booking.agency_id, v_booking.traveler_id, v_booking.participant_count,
    v_quote.product_value, v_quote.platform_fee_percent, v_quote.platform_fee, v_quote.agency_balance, v_quote.currency,
    v_quote.cancellation_policy_snapshot, v_new_reservation, 'consumed', v_new_start_at,
    v_quote.confirmation_mode, v_quote.payment_requirement, v_quote.amount_due_now, v_new_start_at, v_new_end_at,
    v_quote.no_show_grace_minutes, v_quote.fee_refund_rule
  ) returning id into v_new_quote_id;

  insert into public.quote_items (quote_id, item_type, description, unit_price, quantity, line_total)
  values (v_new_quote_id, 'base_product', coalesce(v_old_item.description, v_listing.title), coalesce(v_old_item.unit_price, 0), v_booking.participant_count, v_quote.product_value);

  perform set_config('app.booking_reschedule_in_progress', 'true', true);
  update public.bookings
  set quote_id = v_new_quote_id, departure_id = v_new_departure, booking_status = 'confirmed'
  where id = p_booking_id;

  update public.booking_disruptions
  set traveler_choice = 'reschedule', resolved_at = now()
  where id = v_disruption.id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_RESCHEDULED', 'booking', p_booking_id, jsonb_build_object('new_date', p_new_date));
  perform public.record_booking_event(p_booking_id, 'TRAVELER_RESCHEDULED', jsonb_build_object('new_date', p_new_date));
end;
$$;

comment on function public.traveler_reschedule(uuid, date) is
  'Resolves an open booking_disruptions row by moving the booking to a new, genuinely-open date at the EXACT SAME price (never re-priced) — releases the old reservation, holds+confirms a new one, and creates a new booking_quotes row (the old one is left untouched as history). Own booking, with an open disruption, only.';

revoke all on function public.traveler_reschedule(uuid, date) from public, anon;
grant execute on function public.traveler_reschedule(uuid, date) to authenticated;

create or replace function public.traveler_choose_refund(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking    public.bookings;
  v_disruption public.booking_disruptions;
  v_refund     record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_disruption from public.booking_disruptions
  where booking_id = p_booking_id and resolved_at is null
  order by offered_at desc limit 1 for update;
  if v_disruption.id is null then
    raise exception 'NO_OPEN_DISRUPTION' using errcode = 'P0001';
  end if;

  update public.booking_disruptions set traveler_choice = 'refund', resolved_at = now() where id = v_disruption.id;

  select v_quote.payment_requirement into v_refund from public.booking_quotes v_quote where v_quote.id = v_booking.quote_id;
  perform public.cancel_booking_internal(p_booking_id, 'traveler', 'disruption_refund', 100, 100);
  perform public.record_booking_event(p_booking_id, 'TRAVELER_CHOSE_REFUND', '{}'::jsonb);
end;
$$;

comment on function public.traveler_choose_refund(uuid) is
  'Resolves an open booking_disruptions row with a full (100%/100%) refund — a genuine operating-conditions disruption is never the traveler''s fault, so this bypasses compute_cancellation_refund_internal''s window/tier math entirely. Own booking, with an open disruption, only.';

revoke all on function public.traveler_choose_refund(uuid) from public, anon;
grant execute on function public.traveler_choose_refund(uuid) to authenticated;

create or replace function public.expire_disruption_choices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select id, booking_id from public.booking_disruptions
    where resolved_at is null and choice_deadline < now()
    for update skip locked
  loop
    update public.booking_disruptions set traveler_choice = 'refund', resolved_at = now() where id = v_row.id;
    perform public.cancel_booking_internal(v_row.booking_id, 'system', 'disruption_refund_auto', 100, 100);
    perform public.record_booking_event(v_row.booking_id, 'DISRUPTION_AUTO_REFUNDED', '{}'::jsonb);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.expire_disruption_choices() is
  'pg_cron, every 15 minutes. A disruption whose choice_deadline passes with no traveler choice defaults to a full refund, never a silent hold. FOR UPDATE SKIP LOCKED, idempotent.';

revoke all on function public.expire_disruption_choices() from public, anon, authenticated, service_role;

select cron.schedule(
  'expire-disruption-choices',
  '*/15 * * * *',
  $$select public.expire_disruption_choices();$$
);

-- ── 8. No-show (both options): agency_mark_no_show() records it with NO
--    refund at all (the platform keeps the fee; a full_online balance stays
--    with the agency; a cash-on-day balance was simply never collected).
--    traveler_dispute_no_show()/traveler_report_agency_no_show() open a
--    booking_disputes row; admin_resolve_dispute() is the only way one
--    closes. ───────────────────────────────────────────────────────────────

create table public.booking_disputes (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  opened_by    uuid not null references auth.users(id),
  kind         text not null check (kind in ('no_show', 'agency_no_show')),
  statement    text not null check (char_length(statement) between 20 and 2000),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  resolution   text check (resolution in ('uphold_no_show', 'traveler_was_present_agency_failed', 'partial')),
  resolved_by  uuid references auth.users(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.booking_disputes is
  'kind=no_show: the traveler disputes being marked no_show (agency_mark_no_show()). kind=agency_no_show: the traveler reports the AGENCY never showed up. Either way, only admin_resolve_dispute() (support/admin) closes one — status starts and stays ''open'' until it does.';

create index idx_booking_disputes_booking on public.booking_disputes (booking_id);
create index idx_booking_disputes_open on public.booking_disputes (created_at) where status = 'open';

alter table public.booking_disputes enable row level security;

create policy "booking_disputes_traveler_select"
  on public.booking_disputes for select
  using (exists (select 1 from public.bookings b where b.id = booking_disputes.booking_id and b.traveler_id = auth.uid()));

create policy "booking_disputes_agency_select"
  on public.booking_disputes for select
  using (exists (select 1 from public.bookings b where b.id = booking_disputes.booking_id and public.has_agency_access(b.agency_id)));

create policy "booking_disputes_support_admin_select"
  on public.booking_disputes for select
  using (public.is_support_or_admin());

create policy "booking_disputes_admin_all"
  on public.booking_disputes for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.agency_mark_no_show(p_booking_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_booking.agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if v_booking.booking_status not in ('confirmed', 'in_progress') then
    raise exception 'NOT_MARKABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if now() < v_quote.start_at + (v_quote.no_show_grace_minutes || ' minutes')::interval then
    raise exception 'GRACE_PERIOD_NOT_ELAPSED' using errcode = 'P0001';
  end if;
  if now() > v_quote.end_at + interval '24 hours' then
    raise exception 'NO_SHOW_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  update public.bookings
  set booking_status = 'no_show', no_show_dispute_deadline = now() + interval '48 hours'
  where id = p_booking_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_NO_SHOW', 'booking', p_booking_id, jsonb_build_object('note', p_note));
  perform public.record_booking_event(p_booking_id, 'MARKED_NO_SHOW', jsonb_build_object('note', left(coalesce(p_note, ''), 1000)));
end;
$$;

comment on function public.agency_mark_no_show(uuid, text) is
  'Manager+ only, only between start_at+grace and end_at+24h (NO_SHOW_WINDOW_CLOSED outside it, GRACE_PERIOD_NOT_ELAPSED before it). Creates NO refund_records at all, by design — the platform keeps the fee and, for a full_online booking, the agency keeps the balance; a cash-on-day balance was simply never collected. Opens a 48-hour dispute window (no_show_dispute_deadline).';

revoke all on function public.agency_mark_no_show(uuid, text) from public, anon;
grant execute on function public.agency_mark_no_show(uuid, text) to authenticated;

create or replace function public.traveler_dispute_no_show(p_booking_id uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_dispute_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.booking_status <> 'no_show' then
    raise exception 'NOT_DISPUTABLE' using errcode = 'P0001';
  end if;
  if v_booking.no_show_dispute_deadline is null or now() > v_booking.no_show_dispute_deadline then
    raise exception 'DISPUTE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if p_statement is null or char_length(p_statement) < 20 or char_length(p_statement) > 2000 then
    raise exception 'INVALID_STATEMENT: must be 20-2000 characters' using errcode = 'P0001';
  end if;

  update public.bookings set booking_status = 'disputed' where id = p_booking_id;

  insert into public.booking_disputes (booking_id, opened_by, kind, statement)
  values (p_booking_id, auth.uid(), 'no_show', p_statement)
  returning id into v_dispute_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_DISPUTE_OPENED', 'booking', p_booking_id, jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'no_show'));
  perform public.record_booking_event(p_booking_id, 'DISPUTE_OPENED', jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'no_show'));
end;
$$;

comment on function public.traveler_dispute_no_show(uuid, text) is
  'Own booking, only from no_show, only before no_show_dispute_deadline. Moves the booking to disputed (no_show -> disputed is a valid edge) pending admin_resolve_dispute().';

revoke all on function public.traveler_dispute_no_show(uuid, text) from public, anon;
grant execute on function public.traveler_dispute_no_show(uuid, text) to authenticated;

create or replace function public.traveler_report_agency_no_show(p_booking_id uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_quote   public.booking_quotes;
  v_dispute_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_booking.booking_status not in ('confirmed', 'in_progress') then
    raise exception 'NOT_DISPUTABLE' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;
  if now() < v_quote.start_at + (v_quote.no_show_grace_minutes || ' minutes')::interval then
    raise exception 'GRACE_PERIOD_NOT_ELAPSED' using errcode = 'P0001';
  end if;
  if now() > v_quote.end_at + interval '48 hours' then
    raise exception 'REPORT_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if p_statement is null or char_length(p_statement) < 20 or char_length(p_statement) > 2000 then
    raise exception 'INVALID_STATEMENT: must be 20-2000 characters' using errcode = 'P0001';
  end if;

  update public.bookings set booking_status = 'disputed' where id = p_booking_id;

  insert into public.booking_disputes (booking_id, opened_by, kind, statement)
  values (p_booking_id, auth.uid(), 'agency_no_show', p_statement)
  returning id into v_dispute_id;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_DISPUTE_OPENED', 'booking', p_booking_id, jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'agency_no_show'));
  perform public.record_booking_event(p_booking_id, 'DISPUTE_OPENED', jsonb_build_object('dispute_id', v_dispute_id, 'kind', 'agency_no_show'));
end;
$$;

comment on function public.traveler_report_agency_no_show(uuid, text) is
  'The traveler-initiated mirror of agency_mark_no_show(): "the AGENCY never showed up." Own booking, only from confirmed/in_progress, only between start_at+grace and end_at+48h.';

revoke all on function public.traveler_report_agency_no_show(uuid, text) from public, anon;
grant execute on function public.traveler_report_agency_no_show(uuid, text) to authenticated;

create or replace function public.admin_resolve_dispute(
  p_dispute_id          uuid,
  p_resolution          text,
  p_fee_refund_percent  numeric default null,
  p_note                text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.booking_disputes;
  v_booking public.bookings;
begin
  if not public.is_support_or_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if p_resolution not in ('uphold_no_show', 'traveler_was_present_agency_failed', 'partial') then
    raise exception 'INVALID_RESOLUTION' using errcode = 'P0001';
  end if;

  select * into v_dispute from public.booking_disputes where id = p_dispute_id for update;
  if v_dispute.id is null then
    raise exception 'DISPUTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings where id = v_dispute.booking_id for update;

  if p_resolution = 'uphold_no_show' then
    if v_dispute.kind = 'no_show' then
      update public.bookings set booking_status = 'no_show' where id = v_booking.id;
    else
      -- agency_no_show kind: "uphold" reads as "the agency-no-show claim is
      -- not upheld" — the trip genuinely happened, so the booking simply
      -- resumes (disputed -> confirmed is a valid edge).
      update public.bookings set booking_status = 'confirmed' where id = v_booking.id;
    end if;

  elsif p_resolution = 'traveler_was_present_agency_failed' then
    perform public.cancel_booking_internal(v_booking.id, 'admin', 'agency_no_show_dispute_upheld', 100, 100);
    insert into public.agency_penalties (agency_id, booking_id, kind, amount)
    select v_booking.agency_id, v_booking.id, 'agency_no_show', q.platform_fee
    from public.booking_quotes q where q.id = v_booking.quote_id;
    insert into public.agency_strikes (agency_id, booking_id, kind)
    values (v_booking.agency_id, v_booking.id, 'agency_no_show');

  else -- 'partial'
    if p_fee_refund_percent is null or p_fee_refund_percent < 0 or p_fee_refund_percent > 100 then
      raise exception 'INVALID_FEE_REFUND_PERCENT' using errcode = 'P0001';
    end if;
    perform public.cancel_booking_internal(v_booking.id, 'admin', 'dispute_partial_resolution', p_fee_refund_percent, p_fee_refund_percent);
  end if;

  update public.booking_disputes
  set status = 'resolved', resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id;

  perform public.record_audit_log(
    auth.uid(), 'dispute_resolved', 'booking_disputes', p_dispute_id::text,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'resolved', 'resolution', p_resolution, 'note', p_note, 'fee_refund_percent', p_fee_refund_percent)
  );
end;
$$;

comment on function public.admin_resolve_dispute(uuid, text, numeric, text) is
  'support/admin only. uphold_no_show: confirms the no_show stands (kind=no_show) or dismisses an agency_no_show report (kind=agency_no_show, booking resumes). traveler_was_present_agency_failed: the agency genuinely failed — full refund + agency_penalties + agency_strikes, regardless of dispute kind. partial: admin-chosen percentage applied to both fee and balance, no penalty/strike (a good-faith compromise, not a fault finding). Audited in the same transaction via record_audit_log().';

revoke all on function public.admin_resolve_dispute(uuid, text, numeric, text) from public, anon;
grant execute on function public.admin_resolve_dispute(uuid, text, numeric, text) to authenticated;

-- ── 9. complete_finished_bookings() — 15-minute auto-complete sweep ─────────

create or replace function public.complete_finished_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select b.id from public.bookings b
    join public.booking_quotes q on q.id = b.quote_id
    where b.booking_status in ('confirmed', 'in_progress')
      and q.end_at + interval '24 hours' < now()
      and not exists (select 1 from public.booking_disputes bd where bd.booking_id = b.id and bd.status = 'open')
    for update of b skip locked
  loop
    update public.bookings set booking_status = 'completed', completed_at = now() where id = v_row.id;
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_COMPLETED', 'booking', v_row.id, '{}'::jsonb);
    perform public.record_booking_event(v_row.id, 'AUTO_COMPLETED', '{}'::jsonb);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.complete_finished_bookings() is
  'pg_cron, every 15 minutes. confirmed/in_progress bookings whose quote end_at is more than 24 hours in the past, with no open dispute, become completed (making them reviewable — reviews_insert''s own check already requires booking_status=completed). A no_show booking is never touched here: once its 48h dispute window passes unused it simply stays no_show forever, final.';

revoke all on function public.complete_finished_bookings() from public, anon, authenticated, service_role;

select cron.schedule(
  'complete-finished-bookings',
  '*/15 * * * *',
  $$select public.complete_finished_bookings();$$
);

-- ── 10. agency_set_trip_status(): no_show removed — agency_mark_no_show()
--    is now the only path to that status, with its own grace/window checks
--    this function never had. ──────────────────────────────────────────────

create or replace function public.agency_set_trip_status(p_booking_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  if p_status not in ('in_progress', 'completed') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select agency_id into v_agency_id from public.bookings where id = p_booking_id for update;

  if v_agency_id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = 'P0001';
  end if;

  update public.bookings
  set booking_status = p_status,
      completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_booking_id;

  perform public.record_booking_event(p_booking_id, 'TRIP_STATUS_' || upper(p_status), '{}'::jsonb);
end;
$$;

comment on function public.agency_set_trip_status(uuid, text) is
  'Audit H2, narrowed by Phase 22: p_status no longer accepts ''no_show'' — agency_mark_no_show() (this migration) is the only path there now, since it enforces the grace-period/window checks this function never had. guard_booking_status_transition still validates the actual edge is legal.';

revoke all on function public.agency_set_trip_status(uuid, text) from public, anon;
grant execute on function public.agency_set_trip_status(uuid, text) to authenticated;

-- ── 11. Plain-language policy text ──────────────────────────────────────────

create or replace function public.format_policy_sentences(
  p_free_cancel_hours    integer,
  p_start_at             timestamptz,
  p_no_show_grace_minutes integer,
  p_payment_requirement  text,
  p_cancellation_policy  jsonb
)
returns text[]
language plpgsql
stable
as $$
declare
  v_free_until timestamptz := p_start_at - (p_free_cancel_hours || ' hours')::interval;
  v_sentences  text[] := array[]::text[];
  v_tier       jsonb;
begin
  v_sentences := v_sentences || format(
    'Free cancellation until %s (Nepal time) — your reservation fee is refunded in full.',
    to_char(v_free_until at time zone 'Asia/Kathmandu', 'HH12:MI AM, DD Mon')
  );
  v_sentences := v_sentences || format(
    'Cancel after that, or don''t show up (after a %s-minute grace period), and the reservation fee is non-refundable.',
    p_no_show_grace_minutes
  );

  if p_payment_requirement = 'full_online' then
    for v_tier in select * from jsonb_array_elements(p_cancellation_policy -> 'tiers') loop
      v_sentences := v_sentences || format(
        'If you''re paying the full amount online: cancel %s+ day%s before and get %s%% of the total price back.',
        (v_tier ->> 'days')::int, case when (v_tier ->> 'days')::int = 1 then '' else 's' end, (v_tier ->> 'refund_percent')::int
      );
    end loop;
  end if;

  -- Explicitly cast: an untyped string literal on the right of || resolves
  -- to the anyarray||anyarray overload (and then fails trying to parse it
  -- as curly-brace array syntax) unless it's unambiguously text, unlike
  -- the format()-returned values above which are already typed text.
  v_sentences := v_sentences || 'If the operator cancels for weather, flight, or safety reasons, you can change your date for free or get a full refund.'::text;

  return v_sentences;
end;
$$;

comment on function public.format_policy_sentences(integer, timestamptz, integer, text, jsonb) is
  'Shared sentence-builder behind booking_policy_summary()/listing_policy_preview() — internal only (no grants), kept as one implementation so the two callers can never drift in wording.';

revoke all on function public.format_policy_sentences(integer, timestamptz, integer, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.booking_policy_summary(p_booking_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quote public.booking_quotes;
  v_ok    boolean;
begin
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id and (b.traveler_id = auth.uid() or public.has_agency_access(b.agency_id) or public.is_admin())
  ) into v_ok;
  if not v_ok then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select q.* into v_quote from public.bookings b join public.booking_quotes q on q.id = b.quote_id where b.id = p_booking_id;

  return public.format_policy_sentences(
    (v_quote.fee_refund_rule ->> 'free_cancel_hours')::integer, v_quote.start_at, v_quote.no_show_grace_minutes,
    v_quote.payment_requirement, v_quote.cancellation_policy_snapshot
  );
end;
$$;

comment on function public.booking_policy_summary(uuid) is
  'Plain-language cancellation/no-show policy for an EXISTING booking, built entirely from its quote''s frozen snapshot — never the current listing, which may have changed since. Shown on the booking/checkout page. Own booking (traveler), the booking''s agency, or admin.';

revoke all on function public.booking_policy_summary(uuid) from public, anon;
grant execute on function public.booking_policy_summary(uuid) to authenticated;

create or replace function public.listing_policy_preview(p_listing_id uuid, p_date date, p_pax integer default null)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_free_cancel_hours integer;
  v_start_at timestamptz;
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_start_at := (p_date + v_listing.default_start_time) at time zone 'Asia/Kathmandu';

  select (value::text)::integer into v_free_cancel_hours
  from public.platform_settings
  where key = case when v_listing.duration_days <= 1 then 'fee_free_cancel_hours_day' else 'fee_free_cancel_hours_multiday' end;
  v_free_cancel_hours := coalesce(v_free_cancel_hours, case when v_listing.duration_days <= 1 then 24 else 168 end);

  return public.format_policy_sentences(
    v_free_cancel_hours, v_start_at, v_listing.no_show_grace_minutes,
    v_listing.payment_requirement, v_listing.cancellation_policy
  );
end;
$$;

comment on function public.listing_policy_preview(uuid, date, integer) is
  'Same plain-language policy text, computed from the CURRENT listing config for a not-yet-booked date/pax — shown on checkout BEFORE payment. p_pax is accepted for a stable signature alongside booking_policy_summary/get_bookable_dates but not currently used in the text itself (the policy does not vary by group size). Public — no login required to preview a policy before booking.';

revoke all on function public.listing_policy_preview(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.listing_policy_preview(uuid, date, integer) to anon, authenticated;

-- ── 12. Extend audit C1's exposure-guard allowlist ──────────────────────────

create or replace function public.audit_definer_exposure()
returns table(function_name text, arguments text, executable_by text[])
language sql
stable
as $$
  select
    p.proname::text,
    pg_get_function_identity_arguments(p.oid),
    array_remove(array[
      case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
      case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end
    ], null)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      'request_booking_cancellation', 'agency_set_trip_status',
      'respond_to_review', 'is_own_review',
      'replace_agency_document',
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency',
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster',
      'save_agency_draft', 'submit_agency_application',
      'delete_my_account',
      'admin_user_directory', 'admin_user_stats',
      'cron_health',
      'apply_blackout_preset', 'agency_close_date', 'get_bookable_dates',
      'create_booking_hold', 'release_booking_hold', 'get_booking_hold_status',
      'agency_respond_to_booking', 'respond_via_token', 'booking_summary_for_token',
      'suggest_alternatives',
      -- Phase 22 additions: all re-derive ownership/role/window-validity from
      -- live data (the quote snapshot or has_agency_access/is_support_or_
      -- admin), never trusting a client-supplied id or percentage alone.
      'compute_traveler_cancellation', 'traveler_cancel_booking', 'agency_cancel_booking',
      'traveler_reschedule', 'traveler_choose_refund',
      'agency_mark_no_show', 'traveler_dispute_no_show', 'traveler_report_agency_no_show',
      'admin_resolve_dispute', 'booking_policy_summary', 'listing_policy_preview'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
