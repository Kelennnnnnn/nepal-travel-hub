-- ============================================================================
-- Into Nepal — Phase 21: Post-payment flow (everything after the reservation
-- fee is paid, except the payment itself)
--
-- mark_reservation_fee_paid() is the ONE function the future NIC Asia
-- webhook will call, after its own signature verification, as service_role.
-- It is never exposed to any client role. Everything else here (agency
-- accept/decline, one-tap token links, the confirmation-deadline sweep,
-- alternatives) is reachable from that single entry point's two outcomes:
-- instant-confirm, or awaiting_agency_confirmation.
--
-- Prompt 22 (refunds/strikes-as-a-feature) has not run yet — refund_records,
-- agency_strikes, and cancel_booking_internal() are built here as minimal,
-- genuinely-used versions (not placeholders) that Prompt 22 extends, per
-- this prompt's own instruction.
-- ============================================================================

-- ── 0. bookings: reminder-dedup column ──────────────────────────────────────

alter table public.bookings add column agency_reminder_sent_at timestamptz;

-- ── 1. payment_events — the idempotency ledger for every webhook call ──────

create table public.payment_events (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id),
  provider      text not null,
  provider_ref  text not null,
  kind          text not null check (kind in ('reservation_fee')),
  amount        numeric(12,2) not null check (amount >= 0),
  currency      char(3) not null,
  received_at   timestamptz not null default now(),
  raw           jsonb,
  created_at    timestamptz not null default now(),
  unique (provider, provider_ref)
);

comment on table public.payment_events is
  'One row per (provider, provider_ref) the webhook has ever seen — the idempotency key for mark_reservation_fee_paid(). A replayed webhook call for a provider_ref already recorded here is a no-op that returns the booking''s current status unchanged, never a second confirm.';

create index idx_payment_events_booking on public.payment_events (booking_id);

alter table public.payment_events enable row level security;

create policy "payment_events_finance_admin_select"
  on public.payment_events for select
  using (public.is_finance_or_admin());

-- ── 2. refund_records (Prompt 22 stand-in) ──────────────────────────────────

create table public.refund_records (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id),
  amount       numeric(12,2) not null check (amount >= 0),
  currency     char(3) not null,
  reason_code  text not null,
  status       text not null default 'pending_provider' check (status in ('pending_provider', 'processing', 'refunded', 'failed')),
  created_at   timestamptz not null default now()
);

comment on table public.refund_records is
  'Minimal stand-in built ahead of Prompt 22 (same pattern this schema already uses elsewhere — e.g. seasonal_pricing/price_overrides built in migration 6 ahead of Phase 8''s real pricing engine). Rows are created only by cancel_booking_internal() below. Prompt 22''s actual refund-processing job is what moves status away from pending_provider — nothing here does that yet.';

create index idx_refund_records_booking on public.refund_records (booking_id);

alter table public.refund_records enable row level security;

create policy "refund_records_finance_admin_select"
  on public.refund_records for select
  using (public.is_finance_or_admin());

create policy "refund_records_traveler_select"
  on public.refund_records for select
  using (exists (select 1 from public.bookings b where b.id = refund_records.booking_id and b.traveler_id = auth.uid()));

-- ── 3. agency_strikes ────────────────────────────────────────────────────────

create table public.agency_strikes (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  booking_id  uuid references public.bookings(id),
  kind        text not null check (kind in ('no_response')),
  created_at  timestamptz not null default now()
);

comment on table public.agency_strikes is
  'One row per confirmation-deadline timeout. No auto-suspension on any threshold yet (deliberate — see this migration''s prompt) — the admin dashboard shows a warning badge at 3+ strikes in 90 days and nothing more.';

create index idx_agency_strikes_agency on public.agency_strikes (agency_id, created_at desc);

alter table public.agency_strikes enable row level security;

create policy "agency_strikes_staff_select"
  on public.agency_strikes for select
  using (public.has_agency_access(agency_id));

create policy "agency_strikes_admin_all"
  on public.agency_strikes for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. booking_action_tokens — one-tap accept/decline links ─────────────────

create table public.booking_action_tokens (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  token_hash  text not null unique,
  purpose     text not null check (purpose in ('agency_accept_decline')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.booking_action_tokens is
  'Minted by the notification worker (dispatch-notifications, service_role) when a BOOKING_AWAITING_AGENCY email/SMS/WhatsApp goes out — 32 random bytes, only the sha-256 hash is ever stored, same discipline as agency_invitations.token_hash. No client policy exists at all; every access goes through respond_via_token()/booking_summary_for_token() (SECURITY DEFINER, bypass RLS via owner privilege) or the service-role worker that creates them.';

create index idx_booking_action_tokens_booking on public.booking_action_tokens (booking_id);

alter table public.booking_action_tokens enable row level security;

-- ── 5. guard_booking_status_transition: two new edges for the late-payment
--    path (Phase 20's "expired": [] gains both an exit to cancelled and, if
--    the capacity can still be re-reserved, a path back into the normal
--    payment_processing flow). Re-created in full. ──────────────────────────

create or replace function public.guard_booking_status_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('booking_status', old.booking_status, new.booking_status, $j$
    {
      "draft":                        ["pending_payment", "expired"],
      "pending_payment":              ["payment_processing", "expired", "cancelled"],
      "payment_processing":           ["confirmed", "awaiting_agency_confirmation", "pending_payment", "expired"],
      "awaiting_agency_confirmation": ["confirmed", "cancelled"],
      "confirmed":                    ["in_progress", "completed", "cancelled", "no_show", "disputed", "cancel_requested"],
      "cancel_requested":             ["cancelled", "confirmed"],
      "in_progress":                  ["completed", "no_show", "disputed"],
      "no_show":                      ["disputed", "completed"],
      "disputed":                     ["confirmed", "cancelled", "completed", "no_show"],
      "completed":                    ["disputed"],
      "cancelled":                    [],
      "expired":                      ["cancelled", "payment_processing"]
    }
  $j$::jsonb);
  return new;
end;
$$;

drop trigger if exists guard_booking_status_transition on public.bookings;
create trigger guard_booking_status_transition
  before update of booking_status on public.bookings
  for each row execute function public.guard_booking_status_transition();

-- ── 6. notifications: whatsapp channel, not_configured terminal status ─────

alter table public.notifications drop constraint notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check
  check (channel in ('in_app', 'email', 'sms', 'whatsapp'));

alter table public.notifications drop constraint notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('queued', 'sent', 'failed', 'not_configured'));

comment on constraint notifications_status_check on public.notifications is
  'not_configured (Phase 21): the SMS/WhatsApp provider has no credentials in this environment. Terminal, like sent/failed-at-max-attempts — never retried, never reported to the recipient as a real send.';

-- ── 7. cancel_booking_internal() — the one place a booking actually
--    becomes cancelled with a refund record, used by every cancellation
--    path in this migration (paid-after-expiry, agency decline, deadline
--    timeout). Prompt 22 will extend this with partial-refund cancellation-
--    policy math; for now it always refunds the full reservation fee
--    received so far. Internal only — no grant to any role, including
--    service_role; reached exclusively via another SECURITY DEFINER
--    function's owner privilege. ────────────────────────────────────────────

create or replace function public.cancel_booking_internal(
  p_booking_id     uuid,
  p_cancelled_by   text,
  p_reason_code    text,
  p_refund_percent numeric default 100
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      public.bookings;
  v_quote        public.booking_quotes;
  v_paid_amount  numeric;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  if v_quote.id is not null and v_quote.inventory_reservation_id is not null then
    perform public.release_reservation(v_quote.inventory_reservation_id, 'cancelled');
  end if;
  update public.booking_quotes set status = 'cancelled' where id = v_booking.quote_id and status = 'active';

  update public.bookings
  set booking_status = 'cancelled', cancelled_by = p_cancelled_by, cancellation_reason_code = p_reason_code
  where id = p_booking_id;

  select coalesce(sum(amount), 0) into v_paid_amount
  from public.payment_events
  where booking_id = p_booking_id and kind = 'reservation_fee';

  if v_paid_amount > 0 then
    insert into public.refund_records (booking_id, amount, currency, reason_code, status)
    values (p_booking_id, round(v_paid_amount * p_refund_percent / 100, 2), coalesce(v_quote.currency, 'NPR'), p_reason_code, 'pending_provider');
  end if;

  perform public.record_booking_event(
    p_booking_id, 'BOOKING_CANCELLED',
    jsonb_build_object('cancelled_by', p_cancelled_by, 'reason_code', p_reason_code, 'refund_percent', p_refund_percent)
  );
end;
$$;

revoke all on function public.cancel_booking_internal(uuid, text, text, numeric) from public, anon, authenticated, service_role;

-- ── 8. mark_reservation_fee_paid() ───────────────────────────────────────────
-- Called only by the payments-phase webhook after signature verification.
-- Never expose to clients.

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
  -- a. idempotent on (provider, provider_ref).
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

  -- 'expired' is a valid entry here too: a webhook can legitimately arrive
  -- after the per-minute sweep already flipped a pending_payment booking
  -- to expired — handled below (step c), not rejected outright.
  if v_booking.booking_status not in ('pending_payment', 'payment_processing', 'expired') then
    raise exception 'BOOKING_NOT_PAYABLE' using errcode = 'P0001', detail = v_booking.booking_status;
  end if;

  select * into v_quote from public.booking_quotes where id = v_booking.quote_id;

  -- b. amount/currency must match the frozen quote exactly.
  if p_amount <> v_quote.amount_due_now or p_currency <> v_quote.currency then
    insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
    values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());
    return v_booking.booking_status;
  end if;

  insert into public.payment_events (booking_id, provider, provider_ref, kind, amount, currency, received_at)
  values (p_booking_id, p_provider, p_provider_ref, 'reservation_fee', p_amount, p_currency, now());

  -- d. step payment_status through the graph regardless of what happens
  -- to booking_status below — the money was genuinely received either way.
  if v_booking.payment_status = 'unpaid' then
    update public.bookings set payment_status = 'pending' where id = p_booking_id;
  end if;
  update public.bookings set payment_status = 'processing' where id = p_booking_id and payment_status = 'pending';
  update public.bookings set payment_status = 'paid' where id = p_booking_id and payment_status = 'processing';

  -- c. hold-expiry handling.
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
      -- Capacity genuinely gone (or the date is now full/blocked) — the fee
      -- was paid, so this ends in cancelled + a full refund, not a silent
      -- drop. cancel_booking_internal() reads payment_events itself, so
      -- the event inserted above is already counted.
      perform public.cancel_booking_internal(p_booking_id, 'system', 'paid_after_expiry', 100);
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

  -- e. confirmation_mode branch.
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
  'Called only by the payments-phase webhook after signature verification. Never expose to clients. Idempotent on (p_provider, p_provider_ref); rejects an amount/currency mismatch against the frozen quote without confirming (but still records the event); re-reserves capacity for a hold that expired before payment arrived, cancelling with a full refund record if that capacity is gone.';

revoke all on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_reservation_fee_paid(uuid, text, text, numeric, text) to service_role;

-- ── 9. agency_respond_to_booking() ───────────────────────────────────────────

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
    perform public.cancel_booking_internal(p_booking_id, 'agency', 'agency_declined', 100);
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_DECLINED_BY_AGENCY', 'booking', p_booking_id, jsonb_build_object('reason', p_reason));
    perform public.record_booking_event(p_booking_id, 'AGENCY_DECLINED', jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

comment on function public.agency_respond_to_booking(uuid, boolean, text) is
  'Manager+ of the booking''s agency only (staff may view, never respond — has_agency_access(..., ''manager'') enforces this). Accept requires still being before agency_confirm_deadline; decline requires a 10-500 character reason and goes through cancel_booking_internal() for a full-fee refund.';

revoke all on function public.agency_respond_to_booking(uuid, boolean, text) from public, anon;
grant execute on function public.agency_respond_to_booking(uuid, boolean, text) to authenticated;

-- ── 10. respond_via_token() / booking_summary_for_token() ────────────────────

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

  -- Single-use, marked before acting — a crash mid-action leaves the token
  -- spent rather than replayable, matching every other one-time-token
  -- flow in this schema (agency_invitations).
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
    perform public.cancel_booking_internal(v_booking.id, 'agency', 'agency_declined', 100);
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_DECLINED_BY_AGENCY', 'booking', v_booking.id, jsonb_build_object('reason', p_reason));
    perform public.record_booking_event(v_booking.id, 'AGENCY_DECLINED', jsonb_build_object('via', 'token', 'token_id', v_row.id));
  end if;
end;
$$;

comment on function public.respond_via_token(text, boolean, text) is
  'The one-tap accept/decline link''s backing RPC. The token IS the credential (no login required) — grant to anon is deliberate; rate limiting against abuse is the edge function wrapper''s job (hit_rate_limit(''token:''||ip, ...)), not this function''s. The booking acted on is derived entirely from the token row, never a client-supplied booking id, so a token for booking X structurally cannot act on booking Y.';

revoke all on function public.respond_via_token(text, boolean, text) from public;
grant execute on function public.respond_via_token(text, boolean, text) to anon, authenticated;

create or replace function public.booking_summary_for_token(p_token text)
returns table(
  activity_title       text,
  departure_date       date,
  participant_count    integer,
  agency_confirm_deadline timestamptz,
  traveler_first_name  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token_hash text;
  v_booking_id uuid;
begin
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select bat.booking_id into v_booking_id
  from public.booking_action_tokens bat
  where bat.token_hash = v_token_hash and bat.used_at is null and bat.expires_at > now();

  if v_booking_id is null then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;

  return query
  select l.title, d.departure_date, b.participant_count, b.agency_confirm_deadline,
         split_part(coalesce(g.full_name, ''), ' ', 1)
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  join public.departures d on d.id = b.departure_id
  left join public.booking_guests g on g.booking_id = b.id and g.is_primary
  where b.id = v_booking_id;
end;
$$;

comment on function public.booking_summary_for_token(text) is
  'The /r/:token page''s only data source — deliberately returns nothing beyond activity/date/pax/deadline/first-name-only, never the traveler''s contact details, the agency''s financials, or anything else from the booking row. Works without login (grant includes anon).';

revoke all on function public.booking_summary_for_token(text) from public;
grant execute on function public.booking_summary_for_token(text) to anon, authenticated;

-- ── 11. expire_agency_confirmations() — 5-minute cron sweep ─────────────────

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
  -- Reminders: 12h or less remaining, not yet sent, not yet past deadline
  -- (a booking already past its deadline is handled by the timeout loop
  -- below instead, in the same run).
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

  -- Timeouts.
  for v_row in
    select id, agency_id from public.bookings
    where booking_status = 'awaiting_agency_confirmation' and agency_confirm_deadline < now()
    for update skip locked
  loop
    perform public.cancel_booking_internal(v_row.id, 'system', 'agency_no_response', 100);
    insert into public.agency_strikes (agency_id, booking_id, kind) values (v_row.agency_id, v_row.id, 'no_response');
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values ('BOOKING_AGENCY_TIMEOUT', 'booking', v_row.id, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_agency_confirmations() is
  'pg_cron, every 5 minutes. Reminders fire once per booking (agency_reminder_sent_at dedups); timeouts cancel with a full refund, record an agency_strikes row, and emit BOOKING_AGENCY_TIMEOUT. FOR UPDATE SKIP LOCKED, idempotent — a booking already cancelled by a concurrent run is simply not selected again.';

revoke all on function public.expire_agency_confirmations() from public, anon, authenticated, service_role;

select cron.schedule(
  'expire-agency-confirmations',
  '*/5 * * * *',
  $$select public.expire_agency_confirmations();$$
);

-- ── 12. suggest_alternatives() ───────────────────────────────────────────────

create or replace function public.suggest_alternatives(p_booking_id uuid)
returns table(
  listing_id    uuid,
  title         text,
  agency_id     uuid,
  agency_name   text,
  base_price    numeric,
  rating        numeric,
  review_count  integer,
  images        jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking        public.bookings;
  v_listing        public.listings;
  v_own_district   text;
  v_departure_date date;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null or v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = v_booking.listing_id;
  select d.departure_date into v_departure_date from public.departures d where d.id = v_booking.departure_id;
  select a.district into v_own_district from public.agencies a where a.id = v_listing.agency_id;

  return query
  select l.id, l.title, l.agency_id, a.display_name, l.base_price, l.rating, l.review_count, l.images
  from public.listings l
  join public.agencies a on a.id = l.agency_id
  where l.status = 'published'
    and l.agency_id <> v_listing.agency_id
    and public.is_agency_publicly_approved(l.agency_id)
    and l.category = v_listing.category
    and (similarity(l.location, v_listing.location) > 0.3 or (v_own_district is not null and a.district = v_own_district))
    and public.is_date_bookable(l.id, v_departure_date, v_booking.participant_count) = 'open'
  order by l.rating desc, l.review_count desc
  limit 5;
end;
$$;

comment on function public.suggest_alternatives(uuid) is
  'Up to 5 published listings from OTHER approved agencies, same category, similar location (pg_trgm similarity or same agency district), genuinely bookable for the same date/pax right now. Own bookings only. Nothing is auto-booked — purely informational for the traveler after a decline/timeout.';

revoke all on function public.suggest_alternatives(uuid) from public, anon;
grant execute on function public.suggest_alternatives(uuid) to authenticated;

-- ── 13. Extend audit C1's exposure-guard allowlist ──────────────────────────

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
      -- Phase 21 additions: all re-derive ownership/role/token-validity from
      -- live data, never trusting a client-supplied id alone.
      'agency_respond_to_booking', 'respond_via_token', 'booking_summary_for_token',
      'suggest_alternatives'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
