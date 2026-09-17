-- ============================================================================
-- Into Nepal — migration 2 of N: Identity
--
-- PHASE_0_FORENSIC_AUDIT.md found `profiles` existed in the old schema but was
-- confirmed dead code (no application code queried it — AUDIT_REPORT.md
-- AUTH-08). PHASE_1_ARCHITECTURE.md §1 resurrects it as the real identity
-- table: a stable place for non-auth identity fields, decoupled from
-- auth.users (which Supabase owns and which should hold credentials/session
-- data, not application-owned profile fields).
--
-- Role continues to live EXCLUSIVELY in auth.users.raw_app_meta_data (via
-- Supabase's admin API), never duplicated onto profiles.role — the old
-- schema's handle_new_user() copying raw_user_meta_data->>'role' into
-- profiles.role was itself a live landmine (AUDIT_REPORT.md AUTH-08): it's
-- not repeated here. profiles has no role column at all.
-- ============================================================================

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  avatar_url    text,
  locale        text not null default 'en',
  -- Data minimization (target §62): only what's needed for booking,
  -- fulfillment, communication. No passport/identity data here — that lives
  -- on booking_guests (per-booking, per-trip), scoped tightly, not on a
  -- long-lived profile.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Application-owned identity data, 1:1 with auth.users. Role is NEVER stored here — it lives only in auth.users.raw_app_meta_data, read via public.current_platform_role().';

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup. Deliberately does NOT touch role in
-- any way (contrast with the old handle_new_user(), which read
-- raw_user_meta_data->>'role' into profiles.role — AUDIT_REPORT.md AUTH-08).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every new user starts as 'traveler'. Role escalation (to agency/admin/etc.)
-- happens exclusively through audited, server-side paths built in later
-- phases (Phase 3 auth, Phase 4 agency onboarding) — never at signup, and
-- never writable by the user themselves. This mirrors the old system's
-- enforce_default_role() trigger (which was correct) but targets
-- raw_app_meta_data directly instead of sanitizing raw_user_meta_data (which
-- is safer: app_metadata was never client-writable to begin with, so there's
-- nothing to "sanitize" — we simply never derive anything security-relevant
-- from user_metadata anywhere in the new system).
create or replace function public.set_default_role_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data is null or new.raw_app_meta_data ->> 'role' is null then
    new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'traveler');
  end if;
  return new;
end;
$$;

drop trigger if exists set_default_role_on_signup on auth.users;
create trigger set_default_role_on_signup
  before insert on auth.users
  for each row execute function public.set_default_role_on_signup();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles for select
  using (public.is_admin() or public.is_support_or_admin());

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all"
  on public.profiles for update
  using (public.is_admin());
