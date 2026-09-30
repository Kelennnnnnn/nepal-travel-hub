-- Fixes audit C3, H1
--
-- H1: current_platform_role() read auth.jwt() -> 'app_metadata' ->> 'role',
-- which is a claim baked into the access token at sign-in/refresh time.
-- Every RLS policy that gates on role (via is_admin() etc., which all
-- compose current_platform_role()) was therefore checking a snapshot up to
-- an hour stale, not the account's real current role — an admin whose role
-- was just revoked, or an account that was just banned, keeps every RLS
-- privilege their old token implies until that token naturally expires.
-- Edge functions were never affected by this (verifyCaller() in
-- supabase/functions/_shared/auth.ts calls auth.getUser(token), which is a
-- live lookup against the Admin API, not a JWT-claim decode) — this
-- migration brings RLS to the same freshness guarantee.
--
-- C3: admin-users' privilege ceiling only checked the role being GRANTED,
-- never the TARGET's current role, so a plain admin could suspend/delete/
-- change_role a super_admin. Fixed in the edge function itself
-- (supabase/functions/admin-users/index.ts, this same prompt) — the SQL
-- piece here is revoke_user_sessions(), which that fix needs to make a
-- suspend/change_role take effect immediately rather than waiting for the
-- target's current access token to expire (the same staleness problem H1
-- fixes for RLS, but for the specific case of a session that's about to be
-- suspended/demoted and needs to be cut off right now, not just see a
-- fresher role on its next query).
-- ============================================================================

-- ── H1: live role lookup ────────────────────────────────────────────────────
-- Same signature, same STABLE/SECURITY DEFINER/search_path as before — only
-- the body changes, from a JWT-claim read to a live auth.users lookup keyed
-- by auth.uid(). SECURITY DEFINER remains required: anon/authenticated have
-- no SELECT grant on auth.users at all, so this function's ability to read
-- it depends entirely on running as its (elevated) owner, not the caller.
create or replace function public.current_platform_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.raw_app_meta_data ->> 'role'
  from auth.users u
  where u.id = auth.uid()
    and (u.banned_until is null or u.banned_until < now());
$$;

comment on function public.current_platform_role() is
  'The caller''s platform-wide role, read LIVE from auth.users.raw_app_meta_data (audit H1 — this used to read the aal.jwt() claim, which could be up to an hour stale after a role change or ban). Returns NULL for an unauthenticated caller, a caller whose auth.users row is missing, or a currently-banned caller (deliberate: a banned account must fail every is_admin()/has_agency_access()/etc check immediately, not just lose its role label). is_authenticated_aal2() is intentionally NOT changed by this migration — AAL legitimately comes from the JWT (it describes what the CURRENT SESSION proved, not a mutable account attribute), and re-deriving it live would defeat MFA''s purpose. One of: traveler, agency, admin, super_admin, support, finance, or NULL.';

-- current_platform_role_unverified() is unchanged (still delegates to
-- current_platform_role() — see migration 1) and picks up this fix for
-- free, since it has no logic of its own beyond that delegation.

-- ── C3: session revocation ──────────────────────────────────────────────────
-- Deleting the auth.sessions row (and, defensively, any auth.refresh_tokens
-- row not already caught by refresh_tokens.session_id's ON DELETE CASCADE
-- to auth.sessions) forces the target to re-authenticate on their very next
-- request — their current access token remains cryptographically valid
-- until it expires, but GoTrue's own session-validity check (not just RLS)
-- rejects it once the session row is gone. This is what makes admin-users'
-- suspend/change_role actions take effect immediately rather than up to an
-- hour later, matching what H1 already guarantees for RLS.
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

comment on function public.revoke_user_sessions(uuid) is
  'Force-expires every active session/refresh token for a user (audit C3). Called by admin-users after suspend/change_role so the change takes effect on the target''s very next request, not whenever their current access token happens to expire. service_role only — this is a blunt, high-impact operation with no legitimate caller outside a trusted server context.';

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;

-- ── H1: wrap zero-argument role-check calls in every RLS policy that uses
--    one, so Postgres evaluates them once per statement (InitPlan) instead
--    of once per row. Only functions taking NO arguments are touched here
--    (is_admin(), is_support_or_admin()) — has_agency_access(agency_id, ...),
--    is_agency_publicly_approved(id), and is_conversation_participant(id)
--    all take an argument that IS a column of the row being filtered, so
--    wrapping them would be semantically wrong (Postgres could cache a
--    per-row-varying result as if it were constant for the whole
--    statement) and they are deliberately left exactly as they were.
--    is_finance_or_admin()/is_super_admin() are not called from any RLS
--    policy in this schema, so there is nothing to wrap for them.
--
--    Every policy below is a rule-2-compliant drop+recreate of a policy
--    originally defined in an earlier migration (named per block) — this
--    migration does not edit those files. The USING/WITH CHECK logic is
--    otherwise byte-for-byte identical to the original; only the is_admin()/
--    is_support_or_admin() calls are wrapped. Design-decision comments
--    explaining WHY each policy exists remain in their original migration
--    files (rule 7 — nothing here changed that reasoning, so it isn't
--    duplicated).
--
--    Policies changed (27): profiles_admin_select_all, profiles_admin_
--    update_all (migration 2) · agencies_admin_all, agency_users_admin_all,
--    agency_documents_admin_all, agency_verification_admin_all, agency_
--    status_history_admin_select (migration 3) · listings_admin_all,
--    listing_images_admin_all, departures_admin_all, blackout_dates_admin_
--    all, seasonal_pricing_admin_all, price_overrides_admin_all (migration
--    4) · inventory_admin_all, inventory_reservations_admin_select
--    (migration 5) · booking_quotes_admin_select, quote_items_admin_select
--    (migration 6) · bookings_select_admin, bookings_admin_all (migration
--    7) · reviews_admin_all (migration 12) · conversations_admin_all,
--    messages_select_admin (migration 13) · domain_events_admin_select,
--    notifications_admin_select (migration 14) · audit_logs_admin_select,
--    platform_settings_history_admin_select (migration 15) · contact_
--    submissions_admin_select (migration 17).

-- migration 2 (identity.sql)
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles for select
  using ((select public.is_admin()) or (select public.is_support_or_admin()));

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all"
  on public.profiles for update
  using ((select public.is_admin()));

-- migration 3 (agency_management.sql)
drop policy if exists "agencies_admin_all" on public.agencies;
create policy "agencies_admin_all"
  on public.agencies for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "agency_users_admin_all" on public.agency_users;
create policy "agency_users_admin_all"
  on public.agency_users for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "agency_documents_admin_all" on public.agency_documents;
create policy "agency_documents_admin_all"
  on public.agency_documents for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "agency_verification_admin_all" on public.agency_verification;
create policy "agency_verification_admin_all"
  on public.agency_verification for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "agency_status_history_admin_select" on public.agency_status_history;
create policy "agency_status_history_admin_select"
  on public.agency_status_history for select
  using ((select public.is_admin()));

-- migration 4 (catalog.sql)
drop policy if exists "listings_admin_all" on public.listings;
create policy "listings_admin_all"
  on public.listings for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "listing_images_admin_all" on public.listing_images;
create policy "listing_images_admin_all"
  on public.listing_images for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "departures_admin_all" on public.departures;
create policy "departures_admin_all"
  on public.departures for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "blackout_dates_admin_all" on public.blackout_dates;
create policy "blackout_dates_admin_all"
  on public.blackout_dates for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "seasonal_pricing_admin_all" on public.seasonal_pricing;
create policy "seasonal_pricing_admin_all"
  on public.seasonal_pricing for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "price_overrides_admin_all" on public.price_overrides;
create policy "price_overrides_admin_all"
  on public.price_overrides for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- migration 5 (inventory.sql)
drop policy if exists "inventory_admin_all" on public.inventory;
create policy "inventory_admin_all"
  on public.inventory for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "inventory_reservations_admin_select" on public.inventory_reservations;
create policy "inventory_reservations_admin_select"
  on public.inventory_reservations for select
  using ((select public.is_admin()));

-- migration 6 (quoting.sql)
drop policy if exists "booking_quotes_admin_select" on public.booking_quotes;
create policy "booking_quotes_admin_select"
  on public.booking_quotes for select
  using ((select public.is_admin()));

drop policy if exists "quote_items_admin_select" on public.quote_items;
create policy "quote_items_admin_select"
  on public.quote_items for select
  using ((select public.is_admin()));

-- migration 7 (booking.sql)
drop policy if exists "bookings_select_admin" on public.bookings;
create policy "bookings_select_admin"
  on public.bookings for select
  using ((select public.is_admin()) or (select public.is_support_or_admin()));

drop policy if exists "bookings_admin_all" on public.bookings;
create policy "bookings_admin_all"
  on public.bookings for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- migration 12 (reviews.sql)
drop policy if exists "reviews_admin_all" on public.reviews;
create policy "reviews_admin_all"
  on public.reviews for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- migration 13 (messaging.sql)
drop policy if exists "conversations_admin_all" on public.conversations;
create policy "conversations_admin_all"
  on public.conversations for all
  using ((select public.is_support_or_admin()))
  with check ((select public.is_support_or_admin()));

drop policy if exists "messages_select_admin" on public.messages;
create policy "messages_select_admin"
  on public.messages for select
  using ((select public.is_support_or_admin()));

-- migration 14 (notifications.sql)
drop policy if exists "domain_events_admin_select" on public.domain_events;
create policy "domain_events_admin_select"
  on public.domain_events for select
  using ((select public.is_admin()));

drop policy if exists "notifications_admin_select" on public.notifications;
create policy "notifications_admin_select"
  on public.notifications for select
  using ((select public.is_admin()));

-- migration 15 (admin_and_audit.sql)
drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
  on public.audit_logs for select
  using ((select public.is_admin()));

drop policy if exists "platform_settings_history_admin_select" on public.platform_settings_history;
create policy "platform_settings_history_admin_select"
  on public.platform_settings_history for select
  using ((select public.is_admin()));

-- migration 17 (wishlists_and_contact.sql)
drop policy if exists "contact_submissions_admin_select" on public.contact_submissions;
create policy "contact_submissions_admin_select"
  on public.contact_submissions for select
  using ((select public.is_support_or_admin()));
