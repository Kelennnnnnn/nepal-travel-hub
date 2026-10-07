-- ============================================================================
-- Into Nepal — migration: frontend-accuracy pass (Prompt 25).
--
-- Follows Prompt 24 (platform_settings/site_content/categories/destinations)
-- and reuses Prompt 22's listing_policy_preview(). Adds the handful of
-- server-side pieces the frontend sweep needs so no page has to hardcode a
-- price, a search filter, or a home-page dataset that the database already
-- knows better than the client does:
--   1. price_preview()      — the per-date, seasonal-pricing-aware price a
--                              listing card/detail page should show.
--   2. search_listings()    — replaces the frontend's string-interpolated
--                              PostgREST .or() filter (a search containing
--                              a comma or parenthesis breaks or alters that
--                              filter) with parameterized full-text + trigram
--                              search.
--   3. home_sections()      — replaces loading 100 published listings
--                              client-side just to build four home-page tabs
--                              and a difficulty-level breakdown.
--   4. season_templates     — admin-managed seasonal-pricing suggestions
--                              (the frontend's old hardcoded Winter template
--                              built an end date BEFORE its start date).
--   5. agency_commitments   — lets an agency opt into specific partner
--                              standards (porter welfare, plastic-free
--                              routes, etc.) instead of the homepage
--                              asserting those as guarantees Into Nepal, a
--                              marketplace, has no way to enforce.
-- ============================================================================

-- ── 1. price_preview() ──────────────────────────────────────────────────────
-- The public counterpart to resolve_unit_price() (Prompt 20, "truly
-- internal" — zero grants, not even service_role). Reached here via owner
-- privilege, same pattern as listing_policy_preview() reaching format_
-- policy_sentences(). Mirrors create_booking_hold()'s own fee math exactly
-- (product_value, fee_percent, platform_fee, agency_balance) so the preview
-- a traveler sees before booking can never drift from what they're actually
-- charged.

create or replace function public.price_preview(p_listing_id uuid, p_date date, p_pax integer default 1)
returns table(
  unit_price          numeric,
  product_value       numeric,
  reservation_fee     numeric,
  balance             numeric,
  amount_due_now      numeric,
  currency            text,
  payment_requirement text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_listing      public.listings;
  v_unit_price   numeric;
  v_fee_percent  numeric;
begin
  if p_pax is null or p_pax < 1 then
    raise exception 'INVALID_PAX' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_unit_price := public.resolve_unit_price(p_listing_id, p_date);

  v_fee_percent := coalesce(public.get_setting_numeric('reservation_fee_percent'), 15);

  unit_price          := v_unit_price;
  product_value       := v_unit_price * p_pax;
  reservation_fee     := round(product_value * v_fee_percent / 100, 2);
  balance             := product_value - reservation_fee;
  amount_due_now      := case when v_listing.payment_requirement = 'full_online' then product_value else reservation_fee end;
  currency            := v_listing.currency;
  payment_requirement := v_listing.payment_requirement;
  return next;
end;
$$;

comment on function public.price_preview(uuid, date, integer) is
  'Public, not-yet-booked preview of what create_booking_hold() would actually charge for this listing/date/pax — resolves seasonal_pricing/price_overrides via resolve_unit_price() instead of the frontend showing listings.base_price unconditionally. No login required (same as listing_policy_preview).';

revoke all on function public.price_preview(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.price_preview(uuid, date, integer) to anon, authenticated;

-- ── 2. search_listings() ────────────────────────────────────────────────────
-- Replaces src/lib/queries.ts's `query.or(\`title.ilike.%${search}%,...\`)` —
-- special characters in `search` (commas, parentheses, dots) are PostgREST
-- filter-syntax metacharacters, so an unescaped value there doesn't just fail
-- to match, it can change which OR-clauses PostgREST parses out of the
-- string entirely. Every argument here is a bound parameter — there is no
-- string concatenation into SQL text anywhere in this function.

alter table public.listings
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index idx_listings_search_vector on public.listings using gin (search_vector);

comment on column public.listings.search_vector is
  'Generated tsvector for search_listings() — title weighted above location above description. Trigram indexes on title/location (idx_listings_title_trgm/idx_listings_location_trgm, migration 4) back the similarity() fallback for typo-tolerant matches a plain tsquery would miss.';

create or replace function public.search_listings(
  p_query          text default null,
  p_category       text default null,
  p_location       text default null,
  p_price_min      numeric default null,
  p_price_max      numeric default null,
  p_difficulties   text[] default null,
  p_duration_range  text default null,
  p_sort           text default 'newest',
  p_limit          integer default 20,
  p_offset         integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit   integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset  integer := greatest(0, coalesce(p_offset, 0));
  v_tsquery tsquery;
  v_result  jsonb;
begin
  if p_query is not null and btrim(p_query) <> '' then
    v_tsquery := websearch_to_tsquery('english', p_query);
  end if;

  -- One statement, one CTE scope: `matched` must be visible to BOTH the
  -- row subquery and the count subquery below — splitting this into two
  -- separate `select ... into` statements (as an earlier draft of this
  -- function did) would re-scope the CTE to only the first of them and
  -- raise "relation matched does not exist" on the second.
  with matched as (
    select l.*
    from public.listings l
    where l.status = 'published'
      and public.is_agency_publicly_approved(l.agency_id)
      and (p_category is null or l.category = p_category)
      and (p_location is null or l.location ilike '%' || p_location || '%')
      and (p_price_min is null or l.base_price >= p_price_min)
      and (p_price_max is null or l.base_price <= p_price_max)
      and (p_difficulties is null or l.difficulty = any(p_difficulties))
      and (
        p_duration_range is null or p_duration_range = '' or (
          case p_duration_range
            when '1'   then l.duration_days = 1
            when '2-3' then l.duration_days between 2 and 3
            when '4-7' then l.duration_days between 4 and 7
            when '8+'  then l.duration_days >= 8
            else true
          end
        )
      )
      and (
        p_query is null or btrim(p_query) = '' or (
          l.search_vector @@ v_tsquery
          or l.title % p_query
          or l.location % p_query
        )
      )
  )
  select jsonb_build_object(
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'description', m.description, 'images', m.images,
        'location', m.location, 'duration', m.duration_label, 'duration_days', m.duration_days,
        'price', m.base_price, 'rating', m.rating, 'review_count', m.review_count,
        'category', m.category, 'agency_id', m.agency_id, 'max_participants', m.max_participants,
        'featured', m.featured, 'status', m.status, 'difficulty', m.difficulty, 'created_at', m.created_at
      ))
      from (
        select *
        from matched
        order by
          case when p_sort = 'price_asc'  then base_price end asc,
          case when p_sort = 'price_desc' then base_price end desc,
          case when p_sort = 'rating'     then rating end desc,
          created_at desc
        limit v_limit offset v_offset
      ) m
    ), '[]'::jsonb),
    'total', (select count(*) from matched)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.search_listings(text, text, text, numeric, numeric, text[], text, text, integer, integer) is
  'Parameterized replacement for the frontend''s string-interpolated .or() search filter. websearch_to_tsquery handles multi-word/quoted queries; the % trigram fallback (pg_trgm, already enabled — migration 20260917000021) catches close misspellings a tsquery match would miss. Published + publicly-approved-agency listings only, same predicate as listings_public_select_published RLS (this function is SECURITY DEFINER and bypasses RLS, so it must restate that predicate itself). p_limit is clamped to 50 regardless of what is requested.';

revoke all on function public.search_listings(text, text, text, numeric, numeric, text[], text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_listings(text, text, text, numeric, numeric, text[], text, text, integer, integer) to anon, authenticated;

-- ── 3. home_sections() ──────────────────────────────────────────────────────
-- Replaces src/pages/Index.tsx's usePublishedListings({ pageSize: 100 }) —
-- loading 100 published listings client-side just to build four tabs and a
-- per-difficulty breakdown. Same tab definitions FeaturedAdventures.tsx/
-- AdventureFramework.tsx already used (best-seller = featured or >=20
-- reviews, remote = Wildlife/Mountaineering/Expert, cultural = Cultural
-- category) — only WHERE that filtering runs has moved, not what it means.

create or replace function public.home_sections()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select l.*
    from public.listings l
    where l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  ),
  row_json as (
    select b.id, b.featured, b.review_count, b.rating, b.category, b.difficulty,
      jsonb_build_object(
        'id', b.id, 'title', b.title, 'description', b.description, 'images', b.images,
        'location', b.location, 'duration', b.duration_label, 'duration_days', b.duration_days,
        'price', b.base_price, 'rating', b.rating, 'review_count', b.review_count,
        'category', b.category, 'agency_id', b.agency_id, 'max_participants', b.max_participants,
        'featured', b.featured, 'status', b.status, 'difficulty', b.difficulty, 'created_at', b.created_at
      ) as j
    from base b
  ),
  tab_all as (
    select j from row_json order by rating * review_count desc limit 6
  ),
  tab_best_sellers as (
    select j from row_json where featured or review_count >= 20 order by rating * review_count desc limit 6
  ),
  tab_remote as (
    select j from row_json where category in ('Wildlife', 'Mountaineering') or difficulty = 'Expert' order by rating * review_count desc limit 6
  ),
  tab_cultural as (
    select j from row_json where category = 'Cultural' order by rating * review_count desc limit 6
  ),
  diff_counts as (
    select difficulty, count(*) as cnt, min(location) as example_location
    from base
    where difficulty is not null
    group by difficulty
  )
  select jsonb_build_object(
    'tabs', jsonb_build_object(
      'all', coalesce((select jsonb_agg(j) from tab_all), '[]'::jsonb),
      'best_sellers', coalesce((select jsonb_agg(j) from tab_best_sellers), '[]'::jsonb),
      'remote', coalesce((select jsonb_agg(j) from tab_remote), '[]'::jsonb),
      'cultural', coalesce((select jsonb_agg(j) from tab_cultural), '[]'::jsonb)
    ),
    'difficulty_counts', coalesce((
      select jsonb_object_agg(difficulty, jsonb_build_object('count', cnt, 'example_location', example_location))
      from diff_counts
    ), '{}'::jsonb)
  );
$$;

comment on function public.home_sections() is
  'Everything the home page needs in one call instead of fetching 100 published listings client-side (Index.tsx used to call usePublishedListings({ pageSize: 100 }) just to build these same four tabs and a difficulty breakdown in JS). Each tab capped at 6 rows server-side.';

revoke all on function public.home_sections() from public, anon, authenticated;
grant execute on function public.home_sections() to anon, authenticated;

-- ── 4. season_templates ──────────────────────────────────────────────────────
-- Replaces src/pages/agency/AgencyAvailability.tsx's hardcoded SEASON_
-- TEMPLATES array, whose "Winter (Dec – Feb)" entry built
-- `${currentYear}-12-01` -> `${currentYear}-02-28` — an end date BEFORE its
-- start date, rejected by seasonal_pricing's end_date >= start_date check.
-- start_mmdd/end_mmdd store month-day only; turning a template into a real
-- start_date/end_date for a specific year (including rolling the end date
-- into the NEXT year when end_mmdd < start_mmdd, e.g. Winter) is the
-- frontend's job, same as it always was — this table only fixes WHERE the
-- template data lives, not where the year arithmetic happens.

create table public.season_templates (
  id                   uuid primary key default gen_random_uuid(),
  label                text not null,
  start_mmdd           text not null check (start_mmdd ~ '^\d{2}-\d{2}$'),
  end_mmdd             text not null check (end_mmdd ~ '^\d{2}-\d{2}$'),
  suggested_multiplier numeric(4,2),
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.season_templates is
  'Admin-managed seasonal-pricing suggestions shown to an agency when adding seasonal_pricing for a listing. suggested_multiplier is a SUGGESTION only — the agency chooses and confirms the actual price; nothing here writes to seasonal_pricing directly.';

create trigger set_updated_at_season_templates
  before update on public.season_templates
  for each row execute function public.set_updated_at();

insert into public.season_templates (label, start_mmdd, end_mmdd, suggested_multiplier, sort_order) values
  ('Autumn Peak (Oct – Nov)',    '10-01', '11-30', 1.5, 1),
  ('Spring Peak (Mar – May)',    '03-01', '05-31', 1.4, 2),
  ('Winter (Dec – Feb)',         '12-01', '02-28', 1.2, 3),
  ('Monsoon Off-Peak (Jun – Aug)', '06-01', '08-31', 0.8, 4);

alter table public.season_templates enable row level security;

create policy "season_templates_public_select"
  on public.season_templates for select
  using (true);

create policy "season_templates_admin_write"
  on public.season_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. agency_commitments ────────────────────────────────────────────────────
-- Lets an agency opt into specific partner standards (porter welfare limits,
-- plastic-free routes, etc.) instead of the home page asserting those as
-- guarantees Into Nepal — a marketplace with no operational control over any
-- agency's trips — has no way to actually enforce. The commitment
-- definitions themselves (key/title/description) live in site_content's
-- community_impact.commitments array; this table only records which
-- agencies have committed to which key, so a badge can be shown honestly.

create table public.agency_commitments (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  commitment_key text not null,
  committed_at   timestamptz not null default now(),
  committed_by   uuid references auth.users(id),
  unique (agency_id, commitment_key)
);

comment on table public.agency_commitments is
  'Which site_content community_impact.commitments[].key values a given agency has opted into. Public select so a traveler-facing badge can be shown; only the agency''s own manager+ staff (or an admin) can add/remove its rows.';

create index idx_agency_commitments_agency on public.agency_commitments (agency_id);

alter table public.agency_commitments enable row level security;

create policy "agency_commitments_public_select"
  on public.agency_commitments for select
  using (true);

create policy "agency_commitments_staff_manage_own"
  on public.agency_commitments for all
  using (public.has_agency_access(agency_id, 'manager') or public.is_admin())
  with check (public.has_agency_access(agency_id, 'manager') or public.is_admin());

-- committed_by is always the verified caller, never trusted from the
-- client payload (same "never trust client-supplied actor" rule as every
-- other *_by/actor_id column in this schema) — looked up against auth.users
-- rather than a bare `auth.uid()` assignment so a caller whose uid doesn't
-- resolve to a real row (service-role/fixture-seeding contexts included)
-- gets NULL here instead of tripping the committed_by -> auth.users FK.
create or replace function public.guard_agency_commitment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.committed_by := (select id from auth.users where id = auth.uid());
  return new;
end;
$$;

create trigger guard_agency_commitment_insert
  before insert on public.agency_commitments
  for each row execute function public.guard_agency_commitment_insert();

-- ── 6. platform_settings: support_hours ──────────────────────────────────────
-- TopBar/Contact/FAQ/CancellationPolicy all separately hardcoded "Sun–Fri,
-- 9am–6pm NPT" — one more setting so there's exactly one place to change it.

insert into public.platform_settings (key, value, description, value_type, sensitivity) values
  ('support_hours', '"Sun–Fri, 9am–6pm NPT"'::jsonb, 'Displayed support-hours string — TopBar, Contact, FAQ, Cancellation Policy all read this instead of hardcoding it.', 'string', 'normal')
on conflict (key) do nothing;

-- ── 7. site_content: move more hardcoded copy into admin-managed rows ───────
-- FAQ answers keep the exact wording already shipped (Prompt 24 rewrote
-- these to match the real reservation-fee model) — only WHERE they live
-- changes, from a hardcoded array in FAQ.tsx to this row, with {key}
-- placeholders the frontend substitutes from usePlatformSettings() at
-- render time (so a later fee-percent change is reflected without a
-- content edit).

insert into public.site_content (key, value) values
  ('faq', '[
    {"q": "What is {platform_name}?", "a": "{platform_name} is a marketplace that connects travelers with verified local travel agencies across Nepal. We make it easy to discover, compare, and book trekking, tours, and cultural experiences — all through one trusted platform."},
    {"q": "How do I book an activity?", "a": "Browse activities on our Activities page, select the one you want, choose your trip date and number of guests, then pay a {reservation_fee_percent}% reservation fee to secure your spot. The remaining balance is paid according to the listing''s own payment terms. You''ll receive a booking confirmation email once your reservation fee is paid."},
    {"q": "What is the cancellation policy?", "a": "The reservation fee is fully refundable if you cancel more than {fee_free_cancel_hours_day} hours before a single-day activity''s start time, or {fee_free_cancel_hours_multiday} hours before a multi-day trip''s start time. After that window, the reservation fee is non-refundable. Any balance paid in advance follows the agency''s own cancellation policy, shown on the listing before you book. If the agency cancels, you receive a full refund."},
    {"q": "Is my payment secure?", "a": "Yes. All payments are processed through our payment provider. We never store your full card details. You can pay using any major credit or debit card."},
    {"q": "How are agencies verified?", "a": "Every agency on our platform goes through a manual verification process. They must submit their Tourism License (issued by the Nepal Tourism Board or Ministry of Tourism), PAN/VAT Certificate, and business insurance. Our team reviews each application before granting access to list activities."},
    {"q": "Do I need a permit for trekking in Nepal?", "a": "Most trekking areas in Nepal require permits — the most common are the TIMS card (Trekkers'' Information Management System) and restricted area permits for regions like Upper Mustang or Dolpo. The agency you book with will advise you on the exact permits required for your chosen route and can often arrange them on your behalf."},
    {"q": "Are there group discounts available?", "a": "Some agencies offer group pricing. You can check the listing details page or contact the agency directly through the platform to ask about group rates. We''re working on a built-in group booking feature that will be available soon."},
    {"q": "How do I contact support?", "a": "You can reach our support team by emailing {support_email} or by using the contact form on our Contact page. We''re available {support_hours} and typically respond within one business day."}
  ]'::jsonb),
  ('about_team', '[
    {"name": "Kelen Dahal", "role": "Founder & CEO", "initials": "KD"}
  ]'::jsonb),
  ('home_quick_picks', '[
    {"label": "High Passes", "href": "/activities?difficulty=Challenging,Difficult,Expert"},
    {"label": "Teahouse Treks", "href": "/activities?category=Trekking"},
    {"label": "Summit Peaks", "href": "/activities?category=Mountaineering"},
    {"label": "Cultural Tours", "href": "/activities?category=Cultural"},
    {"label": "Rafting Trips", "href": "/activities?category=Rafting"}
  ]'::jsonb),
  ('topbar_announcements', '["100% Locally-Led Adventures", "Verified Local Agencies Only"]'::jsonb)
on conflict (key) do nothing;

-- community_impact already exists (Prompt 24) — extend it with a
-- `commitments` array framed as standards Into Nepal ASKS agencies to
-- commit to, not guarantees a marketplace has no way to enforce. The old
-- hardcoded copy claimed "Porter Welfare Guarantee" and "we book direct
-- with family-run lodges" as facts about every single trip; these keys
-- are instead opt-in (see agency_commitments above) and the frontend must
-- only badge an agency that actually committed.
update public.site_content
set value = value || jsonb_build_object('commitments', '[
    {"key": "porter_welfare", "title": "Porter & Guide Welfare Standard", "description": "We ask every partner agency to commit to fair wages, reasonable load limits for porters, and insurance coverage for their support staff."},
    {"key": "low_plastic", "title": "Low-Plastic Routes", "description": "We ask partner agencies to minimise single-use plastic on their trips — refillable water stations and no-trace waste practices where possible."},
    {"key": "local_lodging", "title": "Local, Family-Run Lodging", "description": "We ask partner agencies to prioritise independent, family-run teahouses and lodges over large chains when they have a choice."}
  ]'::jsonb)
where key = 'community_impact';

-- ── 8. Extend audit C1's exposure-guard allowlist (cumulative pattern) ─────

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
      'compute_traveler_cancellation', 'traveler_cancel_booking', 'agency_cancel_booking',
      'traveler_reschedule', 'traveler_choose_refund',
      'agency_mark_no_show', 'traveler_dispute_no_show', 'traveler_report_agency_no_show',
      'admin_resolve_dispute', 'booking_policy_summary', 'listing_policy_preview',
      'admin_booking_timeline',
      'admin_audit_entity_types',
      -- Prompt 25 additions: public, not-yet-booked previews and read-only
      -- aggregation RPCs — no different in kind from listing_policy_preview
      -- above, just newer.
      'price_preview', 'search_listings', 'home_sections'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
