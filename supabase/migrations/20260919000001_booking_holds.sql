-- ============================================================================
-- Into Nepal — Phase 20: Hold -> quote -> booking creation for flexible dates
--
-- Builds the create_booking_hold() transaction: a traveler picks an open
-- date (Phase 19's get_bookable_dates), this reserves capacity
-- (hold_inventory, migration 5), freezes a price snapshot (booking_quotes),
-- and creates the bookings row at booking_status='pending_payment' — then
-- stops. No payment call exists anywhere in this migration or the frontend
-- it ships with; "Pay reservation fee" is a disabled button until the
-- payments phase exists. Everything here is additive on top of the
-- existing hold_inventory/release_reservation/expire_stale_reservations
-- (migration 5), booking_quotes/expire_stale_quotes (migration 6), and the
-- booking state machine + request_booking_cancellation/agency_set_trip_
-- status RPCs (migrations 7 and 20260917000008).
-- ============================================================================

-- ── 0. Bugfix: get_bookable_dates() double-counted a hold against
--    daily_booking_limit ──────────────────────────────────────────────────
-- Phase 19's 'full' check added "bookings in [active statuses]" to
-- "unexpired held reservations" on the assumption that a held reservation
-- and a booking row were mutually exclusive stand-ins for the same
-- in-flight attempt. create_booking_hold() below proves that assumption
-- wrong: every pending_payment booking it creates has its OWN held
-- reservation (inventory_reservations.booking_id) linked to it in the same
-- transaction, so the original query counted every live hold twice —
-- caught by this migration's own concurrency acceptance test (10 callers
-- against daily_booking_limit=3 let only 2 through, not 3). Re-created in
-- full (only the held-reservations subquery's WHERE gains "ir.booking_id
-- is null") rather than edited in migration 20260918000001.
create or replace function public.get_bookable_dates(
  p_listing_id uuid,
  p_from       date,
  p_to         date,
  p_pax        integer default null,
  p_now        timestamptz default now()
)
returns table(day date, status text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_listing                 record;
  v_agency_bookings_paused  boolean;
  v_unavailable             boolean;
  v_paused                  boolean;
  v_invalid_pax             boolean;
  v_max_date                date;
  v_day                     date;
  v_status                  text;
  v_reason                  text;
  v_day_start               timestamptz;
  v_notice_deadline         timestamptz;
  v_blackout                boolean;
  v_departure_id            uuid;
  v_count                   integer;
begin
  if p_to - p_from > 92 then
    raise exception 'RANGE_TOO_LARGE: range cannot exceed 92 days' using errcode = 'P0001';
  end if;

  select l.agency_id, l.status, l.min_participants, l.max_participants,
         l.min_advance_hours, l.max_advance_days, l.default_start_time,
         l.operating_days, l.daily_booking_limit, l.bookings_paused
    into v_listing
    from public.listings l
    where l.id = p_listing_id;

  if v_listing is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select a.bookings_paused into v_agency_bookings_paused
  from public.agencies a
  where a.id = v_listing.agency_id;

  v_unavailable := v_listing.status <> 'published' or not public.is_agency_publicly_approved(v_listing.agency_id);
  v_paused := v_listing.bookings_paused or coalesce(v_agency_bookings_paused, false);
  v_invalid_pax := p_pax is not null and (p_pax < v_listing.min_participants or p_pax > v_listing.max_participants);
  v_max_date := (p_now at time zone 'Asia/Kathmandu')::date + v_listing.max_advance_days;

  v_day := p_from;
  while v_day <= p_to loop
    v_reason := null;

    if v_unavailable then
      v_status := 'unavailable';
      v_reason := 'This activity is not currently available for booking.';

    elsif v_paused then
      v_status := 'paused';
      v_reason := 'Bookings are temporarily paused.';

    else
      v_day_start := (v_day + v_listing.default_start_time) at time zone 'Asia/Kathmandu';
      v_notice_deadline := v_day_start - (v_listing.min_advance_hours || ' hours')::interval;

      if p_now > v_notice_deadline then
        v_status := 'too_soon';
        v_reason := 'Inside the minimum notice period for this activity.';

      elsif v_day > v_max_date then
        v_status := 'too_far';
        v_reason := 'Beyond how far in advance this activity can be booked.';

      elsif v_listing.operating_days is not null
            and not (extract(isodow from v_day)::smallint = any(v_listing.operating_days)) then
        v_status := 'closed_day';
        v_reason := 'Not a day this activity operates on.';

      else
        v_blackout := exists (
          select 1 from public.blackout_dates bd
          where bd.listing_id = p_listing_id and bd.blackout_date = v_day
        ) or exists (
          select 1 from public.agency_blackout_periods abp
          where abp.agency_id = v_listing.agency_id
            and v_day between abp.start_date and abp.end_date
            and (abp.listing_ids is null or p_listing_id = any(abp.listing_ids))
        );

        if v_blackout then
          v_status := 'blackout';
          v_reason := 'Blocked by a scheduled blackout.';

        elsif v_invalid_pax then
          v_status := 'invalid_pax';
          v_reason := 'Group size is outside this activity''s allowed range.';

        elsif v_listing.daily_booking_limit is not null then
          select d.id into v_departure_id
          from public.departures d
          where d.listing_id = p_listing_id and d.departure_date = v_day;

          if v_departure_id is null then
            v_count := 0;
          else
            select
              (select count(*) from public.bookings b
                where b.departure_id = v_departure_id
                  and b.booking_status in (
                    'pending_payment', 'payment_processing', 'awaiting_agency_confirmation',
                    'confirmed', 'in_progress'
                  ))
              +
              -- "is null" is the fix: a held reservation already linked to
              -- a booking is counted via that booking row above, never
              -- both ways.
              (select count(*) from public.inventory_reservations ir
                join public.inventory inv on inv.id = ir.inventory_id
                where inv.departure_id = v_departure_id
                  and ir.status = 'held' and ir.expires_at > p_now
                  and ir.booking_id is null)
            into v_count;
          end if;

          if v_count >= v_listing.daily_booking_limit then
            v_status := 'full';
            v_reason := 'This date has reached its daily booking limit.';
          else
            v_status := 'open';
          end if;

        else
          v_status := 'open';
        end if;
      end if;
    end if;

    day := v_day;
    status := v_status;
    reason := v_reason;
    return next;

    v_day := v_day + 1;
  end loop;
end;
$$;

-- Grants are unchanged (create or replace preserves ACL across a same-
-- signature replace) but re-stated explicitly, same convention as every
-- other re-created function in this project.
revoke all on function public.get_bookable_dates(uuid, date, date, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.get_bookable_dates(uuid, date, date, integer, timestamptz) to anon, authenticated;

-- ── 1. booking_quotes: server-only snapshot columns ─────────────────────────
-- All NOT NULL with no default — every quote is created exclusively by
-- create_booking_hold() below (there is still no INSERT policy for any
-- client role on this table, migration 6), so there is no existing-row
-- backfill concern and no reason to allow these to ever be absent.

alter table public.booking_quotes
  add column confirmation_mode    text not null default 'instant',
  add column payment_requirement  text not null default 'fee_only',
  add column amount_due_now       numeric(12,2) not null default 0,
  add column start_at             timestamptz not null default now(),
  add column end_at                timestamptz not null default now(),
  add column no_show_grace_minutes integer not null default 30,
  add column fee_refund_rule      jsonb not null default '{"free_cancel_hours": 24}'::jsonb;

-- The defaults above exist only so the ALTER succeeds instantly against a
-- schema with no production rows (confirmed pre-launch, same reasoning as
-- every other migration in this project) — drop them immediately so every
-- FUTURE insert must supply a real value explicitly, matching "set only by
-- the server, never implicit."
alter table public.booking_quotes
  alter column confirmation_mode drop default,
  alter column payment_requirement drop default,
  alter column amount_due_now drop default,
  alter column start_at drop default,
  alter column end_at drop default,
  alter column no_show_grace_minutes drop default,
  alter column fee_refund_rule drop default;

alter table public.booking_quotes
  add constraint chk_booking_quotes_confirmation_mode check (confirmation_mode in ('instant', 'agency_confirm')),
  add constraint chk_booking_quotes_payment_requirement check (payment_requirement in ('fee_only', 'full_online')),
  add constraint chk_booking_quotes_amount_due_now check (amount_due_now > 0),
  add constraint chk_booking_quotes_end_after_start check (end_at > start_at),
  add constraint chk_booking_quotes_no_show_grace check (no_show_grace_minutes between 15 and 60);

comment on column public.booking_quotes.amount_due_now is
  'The fee for payment_requirement=fee_only, or the full product_value for full_online. What the (not-yet-built) payment step actually charges right now.';
comment on column public.booking_quotes.start_at is
  'departure_date + the listing''s default_start_time, resolved in Asia/Kathmandu at quote time — see create_booking_hold()''s comment for why this conversion must happen in that zone specifically.';
comment on column public.booking_quotes.fee_refund_rule is
  'Placeholder shape for Prompt 22''s real cancellation-fee-refund engine: {"free_cancel_hours": n}. Seeded from platform_settings.fee_free_cancel_hours_day/multiday at quote time, frozen here regardless of later setting changes.';

-- platform_settings keys this migration depends on, seeded here so
-- create_booking_hold() has something correct to read from day one (same
-- pattern as reservation_fee_percent/inventory_hold_ttl_minutes, migrations
-- 19 and 1 respectively).
insert into public.platform_settings (key, value, description) values
  ('fee_free_cancel_hours_day', '24'::jsonb, 'Hours before a day-activity''s start_at the reservation fee remains fully refundable on cancellation (Prompt 22 reads/enforces this; for now it is only snapshotted onto booking_quotes.fee_refund_rule).'),
  ('fee_free_cancel_hours_multiday', '168'::jsonb, 'Same as fee_free_cancel_hours_day, for multi-day listings (duration_days > 1).')
on conflict (key) do nothing;

-- ── 2. bookings: new columns ─────────────────────────────────────────────

alter table public.bookings
  add column fee_collection_mode text not null default 'online' check (fee_collection_mode in ('online')),
  add column agency_confirm_deadline timestamptz,
  add column cancelled_by text check (cancelled_by in ('traveler', 'agency', 'admin', 'system')),
  add column cancellation_reason_code text;

comment on column public.bookings.fee_collection_mode is
  'Placeholder for the future trusted-agency "pay at agency" tier (audit H2''s own comment on bookings_paid_before_active already anticipated this column) — only ''online'' exists today; do not add other values until that tier is actually designed.';
comment on column public.bookings.agency_confirm_deadline is
  'Set once a confirmation_mode=agency_confirm booking''s fee is paid and it enters awaiting_agency_confirmation (a later prompt''s job) — null at hold-creation time, before any payment exists to start that clock.';

-- "balance_method = ''into_nepal_platform'' when the quote''s payment_
-- requirement is ''full_online''" is enforced inside create_booking_hold()
-- itself (the only place a booking is ever created), not as a cross-table
-- CHECK constraint — Postgres CHECK constraints cannot reference another
-- table's row at all, so there is no DB-level way to express this as a
-- constraint; a trigger reading booking_quotes would work but would re-run
-- on every booking update for a rule that only matters at creation, so the
-- creation function is the right, narrower place for it.

-- ── 3. Status graph: add awaiting_agency_confirmation ───────────────────────

alter table public.bookings drop constraint bookings_booking_status_check;
alter table public.bookings add constraint bookings_booking_status_check check (
  booking_status in (
    'draft', 'pending_payment', 'payment_processing', 'awaiting_agency_confirmation',
    'confirmed', 'cancel_requested', 'cancelled', 'in_progress', 'completed',
    'no_show', 'disputed', 'expired'
  )
);

alter table public.bookings drop constraint bookings_paid_before_active;
alter table public.bookings add constraint bookings_paid_before_active check (
  booking_status not in ('confirmed', 'in_progress', 'completed', 'awaiting_agency_confirmation', 'no_show')
  or payment_status in ('paid', 'partially_refunded', 'disputed')
);

-- Re-created in full (rule: never edit an existing migration file) with
-- awaiting_agency_confirmation added into the graph, no_show gaining a
-- direct ->completed edge (a no-show who still shows up late, within the
-- grace window, shouldn't have to go through disputed first), and disputed
-- gaining ->no_show (a dispute can resolve by confirming the traveler
-- genuinely didn't show).
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
      "expired":                      []
    }
  $j$::jsonb);
  return new;
end;
$$;

drop trigger if exists guard_booking_status_transition on public.bookings;
create trigger guard_booking_status_transition
  before update of booking_status on public.bookings
  for each row execute function public.guard_booking_status_transition();

-- ── Idempotency / duplicate-booking guard ───────────────────────────────────

create unique index idx_bookings_one_active_per_traveler_departure
  on public.bookings (traveler_id, listing_id, departure_id)
  where booking_status in (
    'pending_payment', 'payment_processing', 'awaiting_agency_confirmation', 'confirmed', 'in_progress'
  );

comment on index idx_bookings_one_active_per_traveler_departure is
  'A traveler can have at most one "live" booking per listing+departure at a time. create_booking_hold() checks this itself first (for a friendlier ALREADY_BOOKED error), but the index is the actual guarantee under concurrency — belt-and-suspenders, same reasoning as every other advisory-lock-backed uniqueness rule in this schema.';

-- ── 4. Price resolution ─────────────────────────────────────────────────────

create or replace function public.resolve_unit_price(p_listing_id uuid, p_date date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric;
begin
  -- price_overrides for that date/departure first — matches either an
  -- override keyed to an already-existing departure, or one keyed
  -- directly to the date before any departure exists yet.
  select po.price into v_price
  from public.price_overrides po
  left join public.departures d on d.id = po.departure_id
  where (d.listing_id = p_listing_id and d.departure_date = p_date)
     or (po.listing_id = p_listing_id and po.override_date = p_date)
  limit 1;
  if v_price is not null then
    return v_price;
  end if;

  select sp.price into v_price
  from public.seasonal_pricing sp
  where sp.listing_id = p_listing_id and p_date between sp.start_date and sp.end_date
  limit 1;
  if v_price is not null then
    return v_price;
  end if;

  select l.base_price into v_price from public.listings l where l.id = p_listing_id;
  return v_price;
end;
$$;

comment on function public.resolve_unit_price(uuid, date) is
  'Per-person price for a listing on a given date: price_overrides (by departure or by date) > seasonal_pricing covering the date > listings.base_price. Internal only — called by create_booking_hold(); no role (not even service_role) has a direct EXECUTE grant, same "truly internal" pattern as ensure_departure()/is_date_bookable() (Phase 19) — an owner-privileged SECURITY DEFINER caller reaches it regardless.';

revoke all on function public.resolve_unit_price(uuid, date) from public, anon, authenticated, service_role;

-- ── 5. create_booking_hold() ────────────────────────────────────────────────

create or replace function public.create_booking_hold(
  p_listing_id     uuid,
  p_date           date,
  p_pax            integer,
  p_primary_guest  jsonb
)
returns table(
  booking_id         uuid,
  booking_ref        text,
  hold_expires_at    timestamptz,
  product_value      numeric,
  platform_fee       numeric,
  agency_balance     numeric,
  amount_due_now     numeric,
  currency           text,
  confirmation_mode  text,
  payment_requirement text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                uuid;
  v_role                text;
  v_full_name           text;
  v_email               text;
  v_phone               text;
  v_listing             public.listings;
  v_status              text;
  v_existing_id         uuid;
  v_existing_ref        text;
  v_existing_quote_id   uuid;
  v_existing_expires    timestamptz;
  v_existing_reservation uuid;
  v_hold_count          integer;
  v_departure_id        uuid;
  v_ttl_minutes         integer;
  v_reservation_id      uuid;
  v_unit_price          numeric;
  v_product_value       numeric;
  v_fee_percent         numeric;
  v_platform_fee        numeric;
  v_agency_balance      numeric;
  v_amount_due_now      numeric;
  v_quote_id            uuid;
  v_expires_at          timestamptz;
  v_start_at            timestamptz;
  v_end_at              timestamptz;
  v_free_cancel_hours   integer;
  v_fee_refund_rule     jsonb;
  v_balance_method      text;
  v_booking_id          uuid;
  v_booking_ref         text;
begin
  -- a. caller must be an authenticated traveler. Unset app_metadata.role is
  -- treated as 'traveler' everywhere else in this schema (e.g. admin_user_
  -- directory/admin_user_stats) — matched here for consistency.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_role := coalesce(public.current_platform_role(), 'traveler');
  if v_role <> 'traveler' then
    raise exception 'ROLE_CANNOT_BOOK' using errcode = 'P0001';
  end if;

  v_full_name := p_primary_guest ->> 'full_name';
  v_email := p_primary_guest ->> 'contact_email';
  v_phone := p_primary_guest ->> 'contact_phone';

  if v_full_name is null or char_length(v_full_name) < 2 or char_length(v_full_name) > 100 then
    raise exception 'INVALID_GUEST: full_name must be 2-100 characters' using errcode = 'P0001';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_GUEST: contact_email is not a valid email address' using errcode = 'P0001';
  end if;
  if v_phone is null or v_phone !~ '^[0-9+()\-[:space:]]{7,20}$' then
    raise exception 'INVALID_GUEST: contact_phone is not a valid phone number' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- b. serialize every hold attempt for this exact listing+date — the only
  -- way daily_booking_limit's count (is_date_bookable -> 'full') stays
  -- correct under concurrent callers, same role an advisory lock already
  -- plays nowhere else in this schema because every other write path here
  -- is keyed by a single row's primary key, not "how many rows currently
  -- exist for this listing+date."
  perform pg_advisory_xact_lock(hashtext(p_listing_id::text || p_date::text)::bigint);

  -- c. the single source of truth for "is this date actually bookable
  -- right now" — Phase 19's own precedence-ordered status.
  v_status := public.is_date_bookable(p_listing_id, p_date, p_pax);
  if v_status <> 'open' then
    raise exception 'DATE_NOT_BOOKABLE' using errcode = 'P0001', detail = v_status;
  end if;

  -- d. idempotency: a still-valid pending_payment hold for this listing+date
  -- is returned unchanged. A pending_payment row whose quote has already
  -- expired (the per-minute sweep just hasn't reached it yet) is expired
  -- right here instead — otherwise it would block the fresh insert below
  -- via idx_bookings_one_active_per_traveler_departure.
  select b.id, b.booking_ref, b.quote_id
    into v_existing_id, v_existing_ref, v_existing_quote_id
  from public.bookings b
  join public.departures d on d.id = b.departure_id
  where b.traveler_id = v_uid and b.listing_id = p_listing_id and d.departure_date = p_date
    and b.booking_status = 'pending_payment'
  for update of b
  limit 1;

  if v_existing_id is not null then
    select q.expires_at into v_existing_expires from public.booking_quotes q where q.id = v_existing_quote_id;

    if v_existing_expires > now() then
      return query
      select b.id, b.booking_ref, q.expires_at, q.product_value, q.platform_fee, q.agency_balance,
             q.amount_due_now, q.currency::text, q.confirmation_mode, q.payment_requirement
      from public.bookings b join public.booking_quotes q on q.id = b.quote_id
      where b.id = v_existing_id;
      return;
    end if;

    select inventory_reservation_id into v_existing_reservation from public.booking_quotes where id = v_existing_quote_id;
    perform public.release_reservation(v_existing_reservation, 'expired');
    update public.booking_quotes set status = 'expired' where id = v_existing_quote_id;
    update public.bookings set booking_status = 'expired' where id = v_existing_id;
    perform public.record_booking_event(v_existing_id, 'HOLD_EXPIRED', '{}'::jsonb);
  end if;

  if exists (
    select 1 from public.bookings b
    join public.departures d on d.id = b.departure_id
    where b.traveler_id = v_uid and b.listing_id = p_listing_id and d.departure_date = p_date
      and b.booking_status in ('payment_processing', 'awaiting_agency_confirmation', 'confirmed', 'in_progress')
  ) then
    raise exception 'ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  -- e. per-traveler abuse limit, across every listing.
  select count(*) into v_hold_count
  from public.bookings b
  join public.booking_quotes q on q.id = b.quote_id
  where b.traveler_id = v_uid and b.booking_status = 'pending_payment' and q.expires_at > now();

  if v_hold_count >= 3 then
    raise exception 'TOO_MANY_HOLDS' using errcode = 'P0001';
  end if;

  -- f. the departure now genuinely needs to exist.
  v_departure_id := public.ensure_departure(p_listing_id, p_date);

  -- g. TTL from platform_settings, clamped 5-30 minutes regardless of what
  -- an admin sets it to.
  select (value::text)::integer into v_ttl_minutes from public.platform_settings where key = 'inventory_hold_ttl_minutes';
  v_ttl_minutes := greatest(5, least(30, coalesce(v_ttl_minutes, 15)));

  v_reservation_id := public.hold_inventory(v_departure_id, p_pax, v_ttl_minutes);
  select expires_at into v_expires_at from public.inventory_reservations where id = v_reservation_id;

  -- h. price/fee computation.
  v_unit_price := public.resolve_unit_price(p_listing_id, p_date);
  v_product_value := v_unit_price * p_pax;

  select (value::text)::numeric into v_fee_percent from public.platform_settings where key = 'reservation_fee_percent';
  v_fee_percent := coalesce(v_fee_percent, 15);
  v_platform_fee := round(v_product_value * v_fee_percent / 100, 2);
  v_agency_balance := v_product_value - v_platform_fee;
  v_amount_due_now := case when v_listing.payment_requirement = 'full_online' then v_product_value else v_platform_fee end;

  v_start_at := (p_date + v_listing.default_start_time) at time zone 'Asia/Kathmandu';
  v_end_at := v_start_at + (ceil(v_listing.duration_days)::int || ' days')::interval;

  select (value::text)::integer into v_free_cancel_hours
  from public.platform_settings
  where key = case when v_listing.duration_days <= 1 then 'fee_free_cancel_hours_day' else 'fee_free_cancel_hours_multiday' end;
  v_fee_refund_rule := jsonb_build_object('free_cancel_hours', coalesce(v_free_cancel_hours, case when v_listing.duration_days <= 1 then 24 else 168 end));

  insert into public.booking_quotes (
    listing_id, departure_id, agency_id, traveler_id, participant_count,
    product_value, platform_fee_percent, platform_fee, agency_balance, currency,
    cancellation_policy_snapshot, inventory_reservation_id, status, expires_at,
    confirmation_mode, payment_requirement, amount_due_now, start_at, end_at,
    no_show_grace_minutes, fee_refund_rule
  ) values (
    p_listing_id, v_departure_id, v_listing.agency_id, v_uid, p_pax,
    v_product_value, v_fee_percent, v_platform_fee, v_agency_balance, v_listing.currency,
    v_listing.cancellation_policy, v_reservation_id, 'active', v_expires_at,
    v_listing.confirmation_mode, v_listing.payment_requirement, v_amount_due_now, v_start_at, v_end_at,
    v_listing.no_show_grace_minutes, v_fee_refund_rule
  ) returning id into v_quote_id;

  insert into public.quote_items (quote_id, item_type, description, unit_price, quantity, line_total)
  values (v_quote_id, 'base_product', v_listing.title, v_unit_price, p_pax, v_product_value);

  -- i. balance_method is decided here, not left to the client: full_online
  -- always routes the balance through the platform too (there is no
  -- balance left to collect any other way once the whole price is paid
  -- upfront); fee_only leaves it null — which online/cash method covers
  -- the agency balance is a traveler choice made later, out of scope here.
  v_balance_method := case when v_listing.payment_requirement = 'full_online' then 'into_nepal_platform' else null end;

  insert into public.bookings as bk (
    quote_id, listing_id, departure_id, agency_id, traveler_id, participant_count,
    booking_status, payment_status, balance_method
  ) values (
    v_quote_id, p_listing_id, v_departure_id, v_listing.agency_id, v_uid, p_pax,
    'pending_payment', 'unpaid', v_balance_method
  ) returning bk.id, bk.booking_ref into v_booking_id, v_booking_ref;

  update public.inventory_reservations set booking_id = v_booking_id where id = v_reservation_id;

  insert into public.booking_guests (booking_id, full_name, contact_email, contact_phone, is_primary)
  values (v_booking_id, v_full_name, v_email, v_phone, true);

  perform public.record_booking_event(v_booking_id, 'HOLD_CREATED', jsonb_build_object('departure_date', p_date, 'participant_count', p_pax));

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('BOOKING_HOLD_CREATED', 'booking', v_booking_id, jsonb_build_object('listing_id', p_listing_id, 'departure_date', p_date));

  return query
  select v_booking_id, v_booking_ref, v_expires_at, v_product_value, v_platform_fee, v_agency_balance,
         v_amount_due_now, v_listing.currency::text, v_listing.confirmation_mode, v_listing.payment_requirement;
end;
$$;

comment on function public.create_booking_hold(uuid, date, integer, jsonb) is
  'One transaction: validates the caller is a traveler and the date is genuinely open (Phase 19''s is_date_bookable), serializes per listing+date via an advisory lock, deduplicates the caller''s own in-flight hold for the same listing+date, enforces a 3-hold-per-traveler cap, creates the departure on demand, reserves capacity, freezes a price snapshot, and leaves the booking at pending_payment. Never calls a payment provider. Authenticated only — agency/admin accounts raise ROLE_CANNOT_BOOK even though they technically hold the authenticated grant, exactly like request_booking_cancellation/agency_set_trip_status re-derive authorization from live data rather than trusting the grant alone.';

revoke all on function public.create_booking_hold(uuid, date, integer, jsonb) from public, anon;
grant execute on function public.create_booking_hold(uuid, date, integer, jsonb) to authenticated;

-- ── 6. release_booking_hold() ────────────────────────────────────────────────

create or replace function public.release_booking_hold(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_reservation_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booking.traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_booking.booking_status <> 'pending_payment' then
    raise exception 'NOT_RELEASABLE' using errcode = 'P0001';
  end if;

  select inventory_reservation_id into v_reservation_id from public.booking_quotes where id = v_booking.quote_id;
  perform public.release_reservation(v_reservation_id, 'released');

  update public.booking_quotes set status = 'cancelled' where id = v_booking.quote_id;
  update public.bookings
  set booking_status = 'cancelled', cancelled_by = 'traveler', cancellation_reason_code = 'abandoned'
  where id = p_booking_id;

  perform public.record_booking_event(p_booking_id, 'HOLD_RELEASED', '{}'::jsonb);
end;
$$;

comment on function public.release_booking_hold(uuid) is
  'The traveler abandons checkout before paying. Only their own booking, only from pending_payment. Releases the reservation (capacity returns immediately, not at TTL expiry), and sets quote/booking to cancelled/cancelled with cancelled_by=traveler.';

revoke all on function public.release_booking_hold(uuid) from public, anon;
grant execute on function public.release_booking_hold(uuid) to authenticated;

-- ── 7. Expiry sweep ──────────────────────────────────────────────────────────

create or replace function public.expire_stale_booking_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  perform public.expire_stale_reservations();
  perform public.expire_stale_quotes();

  for v_row in
    select b.id
    from public.bookings b
    join public.booking_quotes q on q.id = b.quote_id
    where b.booking_status = 'pending_payment' and q.status = 'expired'
    for update of b skip locked
  loop
    update public.bookings set booking_status = 'expired' where id = v_row.id;
    perform public.record_booking_event(v_row.id, 'HOLD_EXPIRED', '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_stale_booking_holds() is
  'Replaces the two independently-scheduled per-minute jobs (expire-stale-inventory-reservations, expire-stale-booking-quotes) with one that chains them and then expires the pending_payment booking riding on top, in that order, in one transaction per booking. FOR UPDATE SKIP LOCKED, idempotent — a booking already expired (or picked up by a concurrent sweep) is simply not selected again.';

revoke all on function public.expire_stale_booking_holds() from public, anon, authenticated, service_role;

select cron.unschedule('expire-stale-inventory-reservations');
select cron.unschedule('expire-stale-booking-quotes');

select cron.schedule(
  'expire-stale-booking-holds',
  '* * * * *',
  $$select public.expire_stale_booking_holds();$$
);

-- ── 8. get_booking_hold_status() ─────────────────────────────────────────────

create or replace function public.get_booking_hold_status(p_booking_id uuid)
returns table(
  booking_status    text,
  hold_expires_at    timestamptz,
  seconds_remaining  integer,
  product_value      numeric,
  platform_fee       numeric,
  agency_balance     numeric,
  amount_due_now     numeric,
  currency           text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_traveler_id uuid;
begin
  select b.traveler_id into v_traveler_id from public.bookings b where b.id = p_booking_id;

  if v_traveler_id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_traveler_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  return query
  select b.booking_status, q.expires_at,
         greatest(0, extract(epoch from (q.expires_at - now())))::integer,
         q.product_value, q.platform_fee, q.agency_balance, q.amount_due_now, q.currency::text
  from public.bookings b
  join public.booking_quotes q on q.id = b.quote_id
  where b.id = p_booking_id;
end;
$$;

comment on function public.get_booking_hold_status(uuid) is
  'Server-computed countdown (seconds_remaining, never the caller''s clock) plus the frozen amounts, for the checkout page''s 15-second poll. Own bookings only.';

revoke all on function public.get_booking_hold_status(uuid) from public, anon;
grant execute on function public.get_booking_hold_status(uuid) to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative — migration
--    20260918000001's version is the most recent before this one). ────────

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
      -- Phase 20 additions: all three re-derive ownership/role from live
      -- tables (never trusting the client-supplied id alone), same
      -- reasoning as every other allowlisted function above.
      'create_booking_hold', 'release_booking_hold', 'get_booking_hold_status'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
