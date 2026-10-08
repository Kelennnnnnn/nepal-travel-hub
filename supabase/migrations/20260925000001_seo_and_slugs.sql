-- ============================================================================
-- Into Nepal — migration: SEO/deployment pass (Prompt 26).
--
-- Two pieces:
--   1. listings.slug becomes server-generated (title + a short random
--      suffix), the same robustness agencies.slug already has via
--      save_agency_draft (migration 20260917000013) — the frontend's own
--      slugify() in src/stores/listingsStore.ts was client-only, so a
--      direct API call could insert any slug at all, including one that
--      collides or is offensive. Generated on INSERT only — never on
--      UPDATE, since a listing's slug must stay stable once a link to it
--      exists anywhere (shared, indexed, bookmarked).
--   2. seo_listing(p_slug)/seo_agency(p_slug): minimal, public read-only
--      lookups a Vercel Edge Middleware uses to render link-preview/SEO
--      metadata for crawlers and share-preview bots that don't run the
--      SPA's JavaScript. Published/approved only — same visibility rule
--      as the public site itself, never more.
-- ============================================================================

-- ── 1. listings.slug: server-generated ──────────────────────────────────────

-- A placeholder default (always overwritten by the trigger below before the
-- NOT NULL check runs) purely so `supabase gen types` marks slug as
-- optional in the generated Insert type — the client no longer sends it.
alter table public.listings alter column slug set default '';

create or replace function public.generate_listing_slug()
returns trigger
language plpgsql
as $$
declare
  v_base text;
begin
  v_base := lower(regexp_replace(regexp_replace(coalesce(new.title, ''), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
  new.slug := coalesce(nullif(v_base, ''), 'listing') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  return new;
end;
$$;

comment on function public.generate_listing_slug() is
  'Always generates listings.slug server-side from title + a 6-char random suffix on INSERT, ignoring whatever (if anything) the client sent — mirrors save_agency_draft''s own slug generation (migration 20260917000013) for the same reason: a slug the client fully controls could collide, be empty, or be offensive. Only attached to BEFORE INSERT, never UPDATE, so an existing listing''s URL never changes under it.';

create trigger generate_listing_slug_trigger
  before insert on public.listings
  for each row execute function public.generate_listing_slug();

-- ── 2. seo_listing() / seo_agency() ─────────────────────────────────────────

create or replace function public.seo_listing(p_slug text)
returns table(
  id            uuid,
  slug          text,
  title         text,
  description   text,
  image         text,
  location      text,
  category      text,
  base_price    numeric,
  currency      text,
  duration_label text,
  rating        numeric,
  review_count  integer,
  agency_name   text,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.slug::text, l.title, l.description,
    l.images ->> 0 as image,
    l.location, l.category, l.base_price, l.currency, l.duration_label,
    l.rating, l.review_count, a.display_name, l.updated_at
  from public.listings l
  join public.agencies a on a.id = l.agency_id
  where l.slug = p_slug
    and l.status = 'published'
    and public.is_agency_publicly_approved(l.agency_id)
  limit 1;
$$;

comment on function public.seo_listing(text) is
  'Minimal public lookup for link-preview/SEO metadata (Vercel Edge Middleware, Prompt 26) — same published+approved visibility as listings_public_select_published RLS, restated here because this is SECURITY DEFINER and bypasses RLS. Returns zero rows (never an error) for an unknown, unpublished, or un-approved slug, so the middleware''s caller can treat "no row" as "404".';

revoke all on function public.seo_listing(text) from public, anon, authenticated;
grant execute on function public.seo_listing(text) to anon, authenticated;

create or replace function public.seo_agency(p_slug text)
returns table(
  id           uuid,
  slug         text,
  display_name text,
  description  text,
  city         text,
  district     text,
  website      text,
  listing_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.slug::text, a.display_name, a.description, a.city, a.district, a.website,
    (select count(*)::int from public.listings l where l.agency_id = a.id and l.status = 'published') as listing_count
  from public.agencies a
  where a.slug = p_slug
    and public.is_agency_publicly_approved(a.id)
  limit 1;
$$;

comment on function public.seo_agency(text) is
  'Minimal public lookup for an agency''s link-preview/SEO metadata (Vercel Edge Middleware, Prompt 26) — same visibility as agencies_public_select_approved RLS, restated here because this is SECURITY DEFINER and bypasses RLS. Returns zero rows for an unknown or unapproved slug.';

revoke all on function public.seo_agency(text) from public, anon, authenticated;
grant execute on function public.seo_agency(text) to anon, authenticated;

-- ── 3. sitemap_entries() ─────────────────────────────────────────────────────
-- Backs the /sitemap.xml edge route (Prompt 26) — one call instead of the
-- function making four separate REST round-trips for listings, agencies,
-- categories, and destinations.

create or replace function public.sitemap_entries()
returns table(path text, lastmod timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select '/activities/' || l.slug, l.updated_at
  from public.listings l
  where l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  union all
  select '/agencies/' || a.slug, a.created_at
  from public.agencies a
  where public.is_agency_publicly_approved(a.id)
  union all
  select '/activities?category=' || c.slug, now()
  from public.categories c
  where c.active
  union all
  select '/activities?location=' || d.name, now()
  from public.destinations d
  where d.active;
$$;

comment on function public.sitemap_entries() is
  'Every URL /sitemap.xml should list: published listings (lastmod = updated_at), approved agencies, and active category/destination filter links on /activities. Static marketing pages are added by the sitemap route itself, not here, since they never change.';

revoke all on function public.sitemap_entries() from public, anon, authenticated;
grant execute on function public.sitemap_entries() to anon, authenticated;

-- ── 4. Extend audit C1's exposure-guard allowlist (cumulative pattern) ─────

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
      'price_preview', 'search_listings', 'home_sections',
      -- Prompt 26 additions: public, read-only SEO lookups — same kind of
      -- exposure as listing_policy_preview/home_sections above.
      'seo_listing', 'seo_agency', 'sitemap_entries'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant execute on function public.audit_definer_exposure() to service_role;
