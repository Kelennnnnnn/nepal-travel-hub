-- ============================================================================
-- Into Nepal — migration 17 of N: Wishlists & Contact Submissions
--
-- These two tables are NOT part of the target domain model (PHASE_0's §7 gap
-- table doesn't mention either) and their old design was already correct
-- (PHASE_0_FORENSIC_AUDIT.md §8: "safe to keep and build on"). They're
-- reproduced here, in the new authoritative migration sequence, rather than
-- left behind in a loose file that's being retired — the goal per target
-- §46 is ONE authoritative sequence, not "the new tables plus whatever
-- scraps of the old files still apply."
-- ============================================================================

create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index idx_wishlists_user on public.wishlists (user_id);

alter table public.wishlists enable row level security;

drop policy if exists "wishlists_manage_own" on public.wishlists;
create policy "wishlists_manage_own"
  on public.wishlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      citext not null,
  subject    text not null default '',
  message    text not null,
  status     text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index idx_contact_submissions_email on public.contact_submissions (email, created_at);

alter table public.contact_submissions enable row level security;

drop policy if exists "contact_submissions_no_public_access" on public.contact_submissions;
create policy "contact_submissions_no_public_access"
  on public.contact_submissions for all
  using (false);
  -- Deny-all for every client role, exactly as the old system had it
  -- (correct there too) — the contact-form edge function uses service_role
  -- to bypass RLS for inserts; nothing else ever reads/writes this table.

drop policy if exists "contact_submissions_admin_select" on public.contact_submissions;
create policy "contact_submissions_admin_select"
  on public.contact_submissions for select
  using (public.is_support_or_admin());
