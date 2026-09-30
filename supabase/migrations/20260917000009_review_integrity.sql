-- Fixes audit H3
--
-- reviews_traveler_update_own's WITH CHECK only ever verified auth.uid() =
-- traveler_id — every other column (listing_id, booking_id, agency_id,
-- helpful_count, traveler_name) was wide open to the review's own author,
-- who could move their review onto a different listing/agency entirely or
-- directly inflate helpful_count. The INSERT policy required a real,
-- owned, completed booking (that part was already correct — audit RLS-03,
-- migration 12) but never checked the CLIENT-SUPPLIED agency_id against
-- that booking's actual agency, so a traveler could still insert a review
-- attributed to a different agency than the one that ran the trip.
-- listings_staff_manage_own is a broad FOR ALL grant; guard_listing_
-- protected_fields (migration 20260917000002) only ever pinned `featured`,
-- leaving rating/review_count/agency_id directly writable by any agency
-- manager. recalc_listing_rating only recalculated the NEW listing on an
-- UPDATE, silently leaving a stale rating/review_count on whichever
-- listing a review used to belong to. review_votes_select was `using
-- (true)` — every authenticated AND anonymous caller could read every
-- voter's user_id for every review.
-- ============================================================================

-- ── New reviews columns: moderation state (is_flagged/is_featured/
--    hidden_at) and the agency-response replacement for the never-existed
--    admin_note column the frontend was written against. ──────────────────

alter table public.reviews
  add column is_flagged          boolean not null default false,
  add column is_featured         boolean not null default false,
  add column hidden_at           timestamptz,
  add column agency_response     text,
  add column agency_responded_at timestamptz;

alter table public.reviews
  add constraint reviews_agency_response_length check (agency_response is null or char_length(agency_response) <= 2000);

comment on column public.reviews.hidden_at is
  'Moderation soft-hide (audit H3): a hidden review is excluded from reviews_public_select and from recalc_listing_rating''s average/count, but is NOT deleted — visible to admin and to the review''s own agency staff. Hard delete remains available but is restricted to super_admin (see reviews_admin_delete below).';
comment on column public.reviews.agency_response is
  'Replaces the old, never-actually-existent admin_note column the frontend was written against. Editable only via respond_to_review() below (manager+ of the review''s agency) — pinned to OLD for everyone else by guard_review_fields.';

-- ── 1/2. guard_review_fields: the actual authorization boundary for what a
--    review's own author (or anyone else without admin/service_role) can
--    change about it. Silent re-pin, not a raised exception, matching the
--    existing lock_message_content/guard_listing_protected_fields
--    convention — an UPDATE that touches rating/title/comment together
--    with, say, a client-supplied helpful_count should still succeed for
--    the fields it's actually allowed to touch. ────────────────────────────

create or replace function public.guard_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- nullif(..., '') guards against an empty-but-set GUC — see audit H2's
  -- guard_booking_immutable_fields for why a bare ::jsonb cast is unsafe.
  v_is_service_role boolean :=
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role', false);
  v_is_trusted boolean := v_is_service_role or public.is_admin();
begin
  if not v_is_trusted then
    if tg_op = 'INSERT' then
      -- agency_id is never taken from the client — always re-derived from
      -- the booking being reviewed, closing the "review attributed to the
      -- wrong agency" gap. traveler_name is likewise always the current
      -- profile snapshot, never a client-supplied string.
      select b.agency_id into new.agency_id from public.bookings b where b.id = new.booking_id;
      select p.full_name into new.traveler_name from public.profiles p where p.id = auth.uid();
      new.helpful_count := 0;
      new.is_flagged := false;
      new.is_featured := false;
      new.hidden_at := null;
      new.agency_response := null;
      new.agency_responded_at := null;
    else
      new.listing_id := old.listing_id;
      new.booking_id := old.booking_id;
      new.agency_id := old.agency_id;
      new.traveler_id := old.traveler_id;
      new.helpful_count := old.helpful_count;
      new.traveler_name := old.traveler_name;
      new.created_at := old.created_at;
      new.is_flagged := old.is_flagged;
      new.is_featured := old.is_featured;
      new.hidden_at := old.hidden_at;

      -- agency_response/agency_responded_at are the one pair of fields a
      -- non-admin CAN legitimately change here — but only respond_to_review()
      -- below writes them, and only after its own manager+ check, so this
      -- re-derives the same check rather than trusting the caller: a plain
      -- traveler editing their own rating/title/comment always fails this
      -- and gets the fields re-pinned like everything else.
      if not public.has_agency_access(new.agency_id, 'manager') then
        new.agency_response := old.agency_response;
        new.agency_responded_at := old.agency_responded_at;
      end if;
    end if;
  end if;

  if new.comment is not null and char_length(new.comment) not between 10 and 5000 then
    raise exception 'INVALID_COMMENT_LENGTH' using errcode = 'P0001';
  end if;
  if new.title is not null and char_length(new.title) > 150 then
    raise exception 'INVALID_TITLE_LENGTH' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.guard_review_fields() is
  'Audit H3. Non-admin/non-service_role: on INSERT, agency_id/traveler_name are always server-derived (never the client value) and helpful_count/moderation columns are forced to their defaults; on UPDATE, everything except rating/title/comment (and agency_response/agency_responded_at, gated by a live manager+ check) is silently re-pinned to OLD. Skipped entirely for is_admin()/service_role.';

drop trigger if exists guard_review_fields on public.reviews;
create trigger guard_review_fields
  before insert or update on public.reviews
  for each row execute function public.guard_review_fields();

-- ── 2 (cont.). reviews_public_select must also exclude hidden reviews. ─────

drop policy if exists "reviews_public_select" on public.reviews;
create policy "reviews_public_select"
  on public.reviews for select
  using (
    hidden_at is null
    and exists (select 1 from public.listings l where l.id = reviews.listing_id and l.status = 'published')
  );

-- ── Split reviews_admin_all: hard delete is a materially more destructive,
--    harder-to-audit action than flag/feature/hide (an UPDATE), so it's
--    restricted to super_admin specifically rather than every admin. ──────

drop policy if exists "reviews_admin_all" on public.reviews;

create policy "reviews_admin_select"
  on public.reviews for select
  using (public.is_admin());

create policy "reviews_admin_update"
  on public.reviews for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "reviews_admin_delete"
  on public.reviews for delete
  using (public.is_super_admin());

-- ── 3. guard_listing_protected_fields: extend the existing `featured`-only
--    guard to also cover rating/review_count/agency_id. pg_trigger_depth()
--    lets the trigger tell "a real client UPDATE on listings" apart from
--    "recalc_listing_rating's own nested UPDATE, running as a side effect
--    of a write on the UNRELATED reviews table" — the latter is depth 2
--    (1 for recalc_listing_rating's own AFTER-trigger execution, +1 for
--    this BEFORE trigger it then causes to fire on listings), the former
--    is always depth 1 (a direct top-level UPDATE statement on listings
--    itself never runs inside another trigger). ───────────────────────────

create or replace function public.guard_listing_protected_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    new.rating := 0;
    new.review_count := 0;
    return new;
  end if;

  new.featured := old.featured;
  new.rating := old.rating;
  new.review_count := old.review_count;
  new.agency_id := old.agency_id;

  return new;
end;
$$;

comment on function public.guard_listing_protected_fields() is
  'Audit H3 extends this from featured-only to also cover rating/review_count/agency_id — an agency manager''s broad listings_staff_manage_own UPDATE grant could otherwise set its own rating directly. pg_trigger_depth() > 1 exempts recalc_listing_rating''s own nested write (see that function, reviews migration) from this guard — that write is the ONE legitimate non-admin-triggered path that must reach rating/review_count.';

-- ── 4. recalc_listing_rating: recalc BOTH sides of a listing_id change (an
--    admin moving a review, per audit H3's own trigger, is now the only
--    way that can happen at all — reviews_traveler_update_own's WITH CHECK
--    plus guard_review_fields's re-pin both still block it for anyone
--    else, but this stays correct regardless), and exclude hidden reviews
--    from the average/count. ───────────────────────────────────────────────

create or replace function public.recalc_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
begin
  for v_listing_id in
    select distinct x.id from (values (old.listing_id), (new.listing_id)) as x(id)
    where x.id is not null
  loop
    update public.listings
    set rating = coalesce((select round(avg(rating), 2) from public.reviews where listing_id = v_listing_id and hidden_at is null), 0),
        review_count = (select count(*) from public.reviews where listing_id = v_listing_id and hidden_at is null)
    where id = v_listing_id;
  end loop;
  return coalesce(new, old);
end;
$$;

-- ── 5. review_votes_select -> review_votes_select_own: a voter's user_id
--    (who thought this review was helpful) is only visible to that voter
--    themselves, never to the public or to other authenticated users. ─────

drop policy if exists "review_votes_select" on public.review_votes;
create policy "review_votes_select_own"
  on public.review_votes for select
  using (auth.uid() = user_id);

-- ── 6. Can't vote your own review helpful. ──────────────────────────────────
--
-- The ownership check MUST run as a SECURITY DEFINER helper, not a raw
-- EXISTS subquery against reviews directly: reviews is itself RLS-
-- protected (reviews_public_select requires hidden_at is null), so a raw
-- subquery only sees what the voting role can currently SELECT. For a
-- HIDDEN review, that's zero rows regardless of the real traveler_id —
-- NOT EXISTS(...) would then wrongly evaluate true and let the review's
-- own author vote on their own (hidden) review. Same class of fix as
-- has_agency_access()/is_conversation_participant() bypassing RLS on the
-- table THEY check, for the same reason.

create or replace function public.is_own_review(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reviews r where r.id = p_review_id and r.traveler_id = auth.uid()
  );
$$;

revoke execute on function public.is_own_review(uuid) from public;
grant  execute on function public.is_own_review(uuid) to anon, authenticated;

drop policy if exists "review_votes_insert_own" on public.review_votes;
create policy "review_votes_insert_own"
  on public.review_votes for insert
  with check (
    auth.uid() = user_id
    and not public.is_own_review(review_id)
  );

-- ── respond_to_review(): the only way agency_response/agency_responded_at
--    are ever written. Re-derives manager+ access from the review's real,
--    immutable agency_id rather than trusting anything client-supplied. ───

create or replace function public.respond_to_review(p_review_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
begin
  if v_text is not null and char_length(v_text) > 2000 then
    raise exception 'RESPONSE_TOO_LONG' using errcode = 'P0001';
  end if;

  select agency_id into v_agency_id from public.reviews where id = p_review_id;
  if v_agency_id is null then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = 'P0001';
  end if;

  update public.reviews
  set agency_response = v_text,
      agency_responded_at = case when v_text is null then null else now() end
  where id = p_review_id;
end;
$$;

comment on function public.respond_to_review(uuid, text) is
  'Audit H3. The only client-reachable path to reviews.agency_response — manager+ of the review''s real agency_id (re-derived from the row itself, not trusted from the caller). An empty/blank p_text removes the response (agency_response and agency_responded_at both become NULL), matching the existing UI''s Save/Remove toggle.';

revoke execute on function public.respond_to_review(uuid, text) from public, anon;
grant  execute on function public.respond_to_review(uuid, text) to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern — see
--    the C2/H2 migrations' own copies of this same extension). ────────────

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
      -- audit H3 RLS-helper addition: same shape/reasoning as has_agency_access
      -- above — bypasses reviews' own RLS so the check reflects ground truth
      'is_own_review',
      -- audit C2 additions
      'start_conversation', 'add_agency_member_to_conversation', 'conversation_display_names',
      -- audit H2 additions
      'request_booking_cancellation', 'agency_set_trip_status',
      -- audit H3 addition: authenticated-only, re-derives manager+ access
      -- from the review's real agency_id rather than trusting the caller
      'respond_to_review'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
