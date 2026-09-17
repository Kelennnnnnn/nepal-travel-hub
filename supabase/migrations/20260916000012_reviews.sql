-- ============================================================================
-- Into Nepal — migration 12 of N: Reviews
--
-- PHASE_1_ARCHITECTURE.md §3 / target §24. Fixes AUDIT_REPORT.md RLS-03 by
-- construction rather than porting it forward: the old system's reviews
-- INSERT policy only checked `auth.uid() = traveler_id`, with the actual
-- "must have a completed booking for this listing" rule enforced only in
-- frontend code — meaning any authenticated user could fabricate a review
-- for any listing via a direct API call. Here, the WITH CHECK clause itself
-- requires a real, owned, completed booking. Also adds review_votes (the old
-- system's "helpful" counter was a bare increment RPC grantable to anon,
-- trivially spammable — AUDIT_REPORT.md flagged this) and review_photos
-- (didn't exist at all previously).
-- ============================================================================

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id),
  agency_id      uuid not null references public.agencies(id),
  booking_id     uuid not null references public.bookings(id),
  traveler_id    uuid not null references auth.users(id),
  rating         integer not null check (rating between 1 and 5),
  title          text,
  comment        text not null,
  traveler_name  text,   -- snapshot at review time, matches old system's
                            -- reasonable pattern
  helpful_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (booking_id)   -- one review per booking (target §24: "Prevent
                          -- duplicate reviews unless explicitly allowed")
);

comment on table public.reviews is
  'helpful_count is denormalized and maintained exclusively by triggers reacting to review_votes inserts/deletes below — never incremented directly by an RPC callable from the client (contrast with the old, spammable increment_review_helpful design).';

create trigger set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create index idx_reviews_listing on public.reviews (listing_id);
create index idx_reviews_agency on public.reviews (agency_id);

create table public.review_votes (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  vote       text not null default 'helpful' check (vote in ('helpful')),
  created_at timestamptz not null default now(),
  unique (review_id, user_id)   -- one vote per user per review — this is
                                   -- what actually prevents the abuse target
                                   -- §24 calls out ("helpful counts cannot be
                                   -- abused by repeatedly calling an
                                   -- increment endpoint")
);

create table public.review_photos (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references public.reviews(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_review_photos_review on public.review_photos (review_id);

-- ── Maintain reviews.helpful_count from review_votes ────────────────────────

create or replace function public.recalc_review_helpful_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reviews
  set helpful_count = (select count(*) from public.review_votes where review_id = coalesce(new.review_id, old.review_id))
  where id = coalesce(new.review_id, old.review_id);
  return coalesce(new, old);
end;
$$;

create trigger recalc_review_helpful_count
  after insert or delete on public.review_votes
  for each row execute function public.recalc_review_helpful_count();

-- ── Maintain listings.rating / review_count (kept from the old system —
--    this trigger's logic was correct there, just re-implemented cleanly) ──

create or replace function public.recalc_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings
  set rating = coalesce((select round(avg(rating), 2) from public.reviews where listing_id = v_listing_id), 0),
      review_count = (select count(*) from public.reviews where listing_id = v_listing_id)
  where id = v_listing_id;
  return coalesce(new, old);
end;
$$;

create trigger recalc_listing_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_listing_rating();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.reviews enable row level security;
alter table public.review_votes enable row level security;
alter table public.review_photos enable row level security;

drop policy if exists "reviews_public_select" on public.reviews;
create policy "reviews_public_select"
  on public.reviews for select
  using (exists (select 1 from public.listings l where l.id = reviews.listing_id and l.status = 'published'));

drop policy if exists "reviews_traveler_insert_eligible_only" on public.reviews;
create policy "reviews_traveler_insert_eligible_only"
  on public.reviews for insert
  with check (
    auth.uid() = traveler_id
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.traveler_id = auth.uid()
        and b.listing_id = reviews.listing_id
        and b.booking_status = 'completed'
    )
  );
  -- THIS is the fix for AUDIT_REPORT.md RLS-03: eligibility (a real,
  -- completed, owned booking matching the reviewed listing) is checked in
  -- the WITH CHECK itself, not just in application code that a direct API
  -- call could bypass.

drop policy if exists "reviews_traveler_update_own" on public.reviews;
create policy "reviews_traveler_update_own"
  on public.reviews for update
  using (auth.uid() = traveler_id)
  with check (auth.uid() = traveler_id);

drop policy if exists "reviews_agency_select_own" on public.reviews;
create policy "reviews_agency_select_own"
  on public.reviews for select
  using (public.has_agency_access(agency_id));

drop policy if exists "reviews_admin_all" on public.reviews;
create policy "reviews_admin_all"
  on public.reviews for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "review_votes_select" on public.review_votes;
create policy "review_votes_select"
  on public.review_votes for select
  using (true);

drop policy if exists "review_votes_insert_own" on public.review_votes;
create policy "review_votes_insert_own"
  on public.review_votes for insert
  with check (auth.uid() = user_id);

drop policy if exists "review_votes_delete_own" on public.review_votes;
create policy "review_votes_delete_own"
  on public.review_votes for delete
  using (auth.uid() = user_id);

drop policy if exists "review_photos_public_select" on public.review_photos;
create policy "review_photos_public_select"
  on public.review_photos for select
  using (exists (select 1 from public.reviews r join public.listings l on l.id = r.listing_id where r.id = review_photos.review_id and l.status = 'published'));

drop policy if exists "review_photos_insert_own" on public.review_photos;
create policy "review_photos_insert_own"
  on public.review_photos for insert
  with check (exists (select 1 from public.reviews r where r.id = review_photos.review_id and r.traveler_id = auth.uid()));
