-- Fixes audit H5, H6, H7
--
-- H5: review-agency-application pauses an agency's published listings on
-- suspend, but nothing stops the agency from immediately re-publishing one
-- (guard_listing_status_transition allows paused -> published self-service,
-- and neither that trigger nor any public-facing SELECT policy ever checks
-- agency_verification.status). A suspended agency's storefront is fully
-- restorable by the agency itself, and even without republishing, its
-- already-approved-and-still-published listings/departures/inventory/
-- reviews remain publicly visible the whole time regardless of suspension.
-- H6: agencies_staff_update_own is FOR ALL / every column — a manager can
-- change payout_account_reference (redirect settlement funds), legal_name
-- (the verified legal identity the agency was actually approved under), or
-- slug (the public URL identity) via the same broad grant meant for
-- ordinary business-profile edits.
-- H7: departures_staff_manage authorizes off departures.agency_id, a plain
-- client-supplied column on the row being written — not the agency_id of
-- the listing the departure actually belongs to. Agency A can INSERT a
-- departure for agency B's listing_id while supplying agency_id = A,
-- passing the has_agency_access(agency_id) check trivially (it's checking
-- A's own membership), creating a departure — and therefore capacity — on
-- a listing A does not own.
-- ============================================================================

-- ── H6: guard_agency_protected_fields ───────────────────────────────────────

create or replace function public.guard_agency_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
begin
  if v_is_service_role or public.is_admin() then
    return new;
  end if;

  new.payout_account_reference := old.payout_account_reference;
  new.legal_name := old.legal_name;
  new.slug := old.slug;
  new.created_at := old.created_at;

  return new;
end;
$$;

comment on function public.guard_agency_protected_fields() is
  'Audit H6. agencies_staff_update_own is FOR ALL/every column — this pins payout_account_reference (payout redirection fraud), legal_name (the verified legal identity the agency was actually approved under), slug (public URL identity), and created_at for non-admin/non-service_role writers. A verified, audited payout-detail-change flow belongs to the payments phase and is deliberately NOT built here — this migration only closes the current, unverified write path.';

drop trigger if exists guard_agency_protected_fields on public.agencies;
create trigger guard_agency_protected_fields
  before update on public.agencies
  for each row execute function public.guard_agency_protected_fields();

-- ── H5a: guard_listing_status_transition gains an agency-approval gate on
--    entering 'published' — re-created in full (rule 2: never edit an
--    existing migration file), identical to migration 20260917000002's
--    version except for the new block at the end. ─────────────────────────

create or replace function public.guard_listing_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') and not public.is_admin() then
      raise exception 'INSUFFICIENT_PRIVILEGE: cannot create a listing with status %', new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  perform public.assert_valid_transition('listing_status', old.status, new.status, $j$
    {
      "draft":           ["pending_review", "archived"],
      "pending_review":  ["approved", "rejected", "draft"],
      "approved":        ["published", "archived", "pending_review"],
      "published":       ["paused", "archived", "pending_review"],
      "paused":          ["published", "archived", "pending_review"],
      "rejected":        ["pending_review", "archived"],
      "archived":        []
    }
  $j$::jsonb);

  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected')
     and not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE: only an admin may set listing status to %', new.status
      using errcode = '42501';
  end if;

  -- Audit H5: a suspended (or never-approved) agency's own paused ->
  -- published self-service transition (structurally valid per the graph
  -- above) must not actually be reachable — this is the specific bypass
  -- the audit found. admin_suspend_agency()/admin_reinstate_agency() below
  -- are exempt via is_admin() like every other admin path in this trigger.
  if new.status = 'published'
     and not public.is_admin()
     and not public.is_agency_publicly_approved(new.agency_id) then
    raise exception 'AGENCY_NOT_APPROVED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── H5b: public-select policies also require the owning agency to be
--    publicly approved — closes the gap for listings/departures/inventory/
--    reviews that are ALREADY published/live and simply never get
--    re-checked once an agency is suspended after the fact. ──────────────

drop policy if exists "listings_public_select_published" on public.listings;
create policy "listings_public_select_published"
  on public.listings for select
  using (status = 'published' and public.is_agency_publicly_approved(agency_id));

drop policy if exists "listing_images_public_select" on public.listing_images;
create policy "listing_images_public_select"
  on public.listing_images for select
  using (exists (
    select 1 from public.listings l
    where l.id = listing_images.listing_id and l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  ));

drop policy if exists "departures_public_select" on public.departures;
create policy "departures_public_select"
  on public.departures for select
  using (exists (
    select 1 from public.listings l
    where l.id = departures.listing_id and l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  ));

drop policy if exists "inventory_public_select" on public.inventory;
create policy "inventory_public_select"
  on public.inventory for select
  using (exists (
    select 1 from public.departures d join public.listings l on l.id = d.listing_id
    where d.id = inventory.departure_id and l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  ));

drop policy if exists "reviews_public_select" on public.reviews;
create policy "reviews_public_select"
  on public.reviews for select
  using (
    hidden_at is null
    and exists (
      select 1 from public.listings l
      where l.id = reviews.listing_id and l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
    )
  );

drop policy if exists "review_photos_public_select" on public.review_photos;
create policy "review_photos_public_select"
  on public.review_photos for select
  using (exists (
    select 1 from public.reviews r join public.listings l on l.id = r.listing_id
    where r.id = review_photos.review_id and l.status = 'published' and public.is_agency_publicly_approved(l.agency_id)
  ));

-- ── H5d: agency_is_active — while an agency is suspended (or rejected),
--    staff can still SELECT their own data (existing *_staff_select_own /
--    *_select_own policies are untouched) but can no longer WRITE listings/
--    departures/inventory-adjacent rows. "Active" includes every pre-
--    approval onboarding state (draft/submitted/in_review/more_info_
--    required) — only suspended/rejected agencies are blocked, not
--    agencies still going through their first review. ─────────────────────

create or replace function public.agency_is_active(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_verification v
    where v.agency_id = target_agency_id
      and v.status in ('draft', 'submitted', 'in_review', 'more_info_required', 'approved')
  );
$$;

comment on function public.agency_is_active(uuid) is
  'Audit H5d. True unless the agency is suspended or rejected. Added to the WITH CHECK of every agency-staff WRITE policy on listings/departures/inventory-adjacent tables (never to a SELECT policy — a suspended agency can still see its own data) and to set_departure_capacity(), so a suspension actually stops new writes immediately rather than only affecting what''s publicly visible.';

revoke execute on function public.agency_is_active(uuid) from public;
grant  execute on function public.agency_is_active(uuid) to anon, authenticated;

drop policy if exists "listings_staff_manage_own" on public.listings;
create policy "listings_staff_manage_own"
  on public.listings for all
  using (public.has_agency_access(agency_id, 'manager'))
  with check (public.has_agency_access(agency_id, 'manager') and public.agency_is_active(agency_id));

drop policy if exists "blackout_dates_staff_manage" on public.blackout_dates;
create policy "blackout_dates_staff_manage"
  on public.blackout_dates for all
  using (exists (select 1 from public.listings l where l.id = blackout_dates.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = blackout_dates.listing_id and public.has_agency_access(l.agency_id, 'manager') and public.agency_is_active(l.agency_id)));

drop policy if exists "seasonal_pricing_staff_manage" on public.seasonal_pricing;
create policy "seasonal_pricing_staff_manage"
  on public.seasonal_pricing for all
  using (exists (select 1 from public.listings l where l.id = seasonal_pricing.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = seasonal_pricing.listing_id and public.has_agency_access(l.agency_id, 'manager') and public.agency_is_active(l.agency_id)));

drop policy if exists "price_overrides_staff_manage" on public.price_overrides;
create policy "price_overrides_staff_manage"
  on public.price_overrides for all
  using (exists (select 1 from public.listings l where l.id = price_overrides.listing_id and public.has_agency_access(l.agency_id, 'manager')))
  with check (exists (select 1 from public.listings l where l.id = price_overrides.listing_id and public.has_agency_access(l.agency_id, 'manager') and public.agency_is_active(l.agency_id)));

drop policy if exists "departures_staff_manage" on public.departures;
create policy "departures_staff_manage"
  on public.departures for all
  using (public.has_agency_access(agency_id, 'manager'))
  with check (public.has_agency_access(agency_id, 'manager') and public.agency_is_active(agency_id));
  -- Still keyed off departures.agency_id for the USING clause (read access
  -- to existing rows) — H7 below is what makes that column trustworthy
  -- going forward (sync_departure_agency forces it from the listing on
  -- every write), so this WITH CHECK's has_agency_access(agency_id, ...)
  -- is no longer the exploitable check it used to be either.

-- ── H7: sync_departure_agency — departures.agency_id is never taken from
--    the client. Forced from the listing's real agency_id on every insert
--    and update, and listing_id itself can never be reassigned by a non-
--    admin (that would just move the exploit to "which listing this
--    departure is even for"). ──────────────────────────────────────────────

create or replace function public.sync_departure_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_agency_id uuid;
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
begin
  if tg_op = 'UPDATE' and not (v_is_service_role or public.is_admin()) then
    new.listing_id := old.listing_id;
  end if;

  select agency_id into v_listing_agency_id from public.listings where id = new.listing_id;
  if v_listing_agency_id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  new.agency_id := v_listing_agency_id;

  return new;
end;
$$;

comment on function public.sync_departure_agency() is
  'Audit H7. departures.agency_id is denormalized from listings purely for RLS query speed (migration 20260916000004''s own comment) — it must never be an independent, client-trusted value. Always overwritten here from the departure''s actual listing, regardless of what the INSERT/UPDATE statement supplied. listing_id itself is additionally pinned to OLD for non-admin/non-service_role callers on UPDATE, so the exploit cannot be moved to "reassign this departure to someone else''s listing" instead.';

drop trigger if exists sync_departure_agency on public.departures;
create trigger sync_departure_agency
  before insert or update on public.departures
  for each row execute function public.sync_departure_agency();

-- ── set_departure_capacity(): add the agency_is_active gate (H5d) — same
--    function, re-created in full since only the body changes. ───────────

create or replace function public.set_departure_capacity(p_departure_id uuid, p_capacity_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_reserved integer;
begin
  select agency_id into v_agency_id from public.departures where id = p_departure_id;
  if v_agency_id is null then
    raise exception 'DEPARTURE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE: not a manager of this departure''s agency' using errcode = '42501';
  end if;

  if not public.agency_is_active(v_agency_id) then
    raise exception 'AGENCY_SUSPENDED' using errcode = 'P0001';
  end if;

  if p_capacity_total < 0 then
    raise exception 'INVALID_CAPACITY: capacity_total cannot be negative' using errcode = 'P0001';
  end if;

  select coalesce(capacity_held, 0) + coalesce(capacity_confirmed, 0) into v_reserved
  from public.inventory where departure_id = p_departure_id;

  if v_reserved is not null and p_capacity_total < v_reserved then
    raise exception 'CAPACITY_BELOW_RESERVED: % spots are already held or confirmed, cannot set capacity below that', v_reserved
      using errcode = 'P0001';
  end if;

  insert into public.inventory (departure_id, capacity_total)
  values (p_departure_id, p_capacity_total)
  on conflict (departure_id) do update
    set capacity_total = excluded.capacity_total, version = public.inventory.version + 1;
end;
$$;

-- ── Block deleting a departure with any held/confirmed reservation —
--    agencies should set status='cancelled' instead (still lets guard_
--    listing_status_transition-style history stay coherent; a delete would
--    silently orphan/cascade the reservation rows via departures'
--    on-delete-cascade chain, discarding the record of what was actually
--    reserved). ─────────────────────────────────────────────────────────

create or replace function public.guard_departure_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.inventory i
    join public.inventory_reservations ir on ir.inventory_id = i.id
    where i.departure_id = old.id and ir.status in ('held', 'confirmed')
  ) then
    raise exception 'DEPARTURE_HAS_RESERVATIONS' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

comment on function public.guard_departure_delete() is
  'Audit H5/H7 follow-on. A departure with any held or confirmed inventory_reservations cannot be deleted — agencies should set departures.status = ''cancelled'' instead, which leaves the reservation/booking trail intact. Applies regardless of caller, admin included (a data-integrity rule, not an authorization one, matching this schema''s existing transition-guard triggers).';

drop trigger if exists guard_departure_delete on public.departures;
create trigger guard_departure_delete
  before delete on public.departures
  for each row execute function public.guard_departure_delete();

-- ── H5c: admin_suspend_agency() / admin_reinstate_agency() — one
--    transaction each: verification status, listing pause (suspend only),
--    audit log, domain event. Grant to authenticated — the function checks
--    is_admin() itself (same pattern as every other admin-tier SECURITY
--    DEFINER function in this schema), which is what lets the edge
--    function call it as the CALLER's own identity (see that function's
--    own comment for why that matters here specifically). ────────────────

create or replace function public.admin_suspend_agency(p_agency_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  select status into v_current_status from public.agency_verification where agency_id = p_agency_id;
  if v_current_status is null then
    raise exception 'AGENCY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current_status = 'suspended' then
    raise exception 'ALREADY_SUSPENDED' using errcode = 'P0001';
  end if;

  update public.agency_verification
  set status = 'suspended', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
  where agency_id = p_agency_id;

  update public.listings set status = 'paused' where agency_id = p_agency_id and status = 'published';

  perform public.record_audit_log(auth.uid(), 'agency_suspend', 'agency', p_agency_id::text, null, jsonb_build_object('reason', p_reason));

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('AGENCY_SUSPENDED', 'agency', p_agency_id, jsonb_build_object('reason', p_reason));
end;
$$;

comment on function public.admin_suspend_agency(uuid, text) is
  'Audit H5c. Admin-only (checked internally, not just via the grant). Rejects a duplicate suspend call (ALREADY_SUSPENDED) BEFORE any writes happen, so a repeat call produces no second audit row, no second domain event, and — since the edge function returns on this error before sending anything — no second email. Pauses every currently-published listing in the same transaction as the status change, closing the audit H5 gap where those two writes used to happen as separate, non-atomic statements.';

revoke execute on function public.admin_suspend_agency(uuid, text) from public, anon;
grant  execute on function public.admin_suspend_agency(uuid, text) to authenticated;

create or replace function public.admin_reinstate_agency(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  select status into v_current_status from public.agency_verification where agency_id = p_agency_id;
  if v_current_status is null then
    raise exception 'AGENCY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current_status = 'approved' then
    raise exception 'ALREADY_APPROVED' using errcode = 'P0001';
  end if;

  update public.agency_verification
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
  where agency_id = p_agency_id;

  perform public.record_audit_log(auth.uid(), 'agency_reinstate', 'agency', p_agency_id::text, null, null);

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('AGENCY_REINSTATED', 'agency', p_agency_id, '{}'::jsonb);
end;
$$;

comment on function public.admin_reinstate_agency(uuid) is
  'Audit H5c. Admin-only (checked internally). Rejects a duplicate reinstate call (ALREADY_APPROVED) before any writes. Listings are deliberately NOT auto-republished (matches the pre-existing behavior/comment in review-agency-application''s reinstate action) — an agency reinstated after suspension should review and manually republish each listing.';

revoke execute on function public.admin_reinstate_agency(uuid) from public, anon;
grant  execute on function public.admin_reinstate_agency(uuid) to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    the C2/H2/H3/H4 migrations' own copies of this same extension). ──────

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
    and p.prosecdef                                   -- SECURITY DEFINER only
    and p.prorettype <> 'trigger'::regtype              -- trigger functions are never PostgREST RPC-callable, regardless of grants — excluded so this guard stays focused on audit C1's actual exposure surface (anon/authenticated hitting /rest/v1/rpc/<fn>), not flagged as noise requiring its own allowlist entries
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and p.proname not in (
      'current_platform_role', 'current_platform_role_unverified', 'is_authenticated_aal2',
      'is_admin', 'is_super_admin', 'is_finance_or_admin', 'is_support_or_admin',
      'has_agency_access', 'is_agency_publicly_approved', 'is_conversation_participant',
      'capacity_available', 'set_departure_capacity',
      -- audit C2 additions
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      -- audit H2 additions
      'request_booking_cancellation', 'agency_set_trip_status',
      -- audit H3 additions
      'respond_to_review', 'is_own_review',
      -- audit H4 addition
      'replace_agency_document',
      -- audit H5/H7 additions: agency_is_active is an RLS helper (same
      -- shape as has_agency_access); admin_suspend_agency/admin_reinstate_
      -- agency check is_admin() internally, same pattern as every other
      -- admin-tier SECURITY DEFINER function already on this allowlist
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
