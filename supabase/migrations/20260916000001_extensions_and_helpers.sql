-- ============================================================================
-- Into Nepal — authoritative schema, migration 1 of N
-- Extensions and shared helper functions
--
-- This is the first migration in the new, ordered `supabase/migrations/`
-- sequence that replaces every loose `supabase/*.sql` / `supabase_*.sql` file
-- from the previous architecture (see PHASE_0_FORENSIC_AUDIT.md and
-- PHASE_1_ARCHITECTURE.md for the full rationale). There is no production
-- data to migrate (confirmed pre-launch), so this is a clean-slate schema,
-- not an ALTER-based migration of the old tables.
--
-- Every later migration depends on the helper functions defined here. They
-- exist specifically to close a bug class found in the audit: the old schema
-- repeated the raw expression `(auth.jwt() -> 'app_metadata' ->> 'role') =
-- 'admin'` inline in ~30 separate RLS policies across ~15 files, and several
-- of those files were never updated when the security model changed from
-- user_metadata to app_metadata (AUDIT_REPORT.md RLS-02, AUTH-07). Centralizing
-- the check in one function means there is exactly one place to get it right,
-- and every policy calls the function instead of repeating the JWT expression.
-- ============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- trigram search, used by Catalog search later
create extension if not exists citext;     -- case-insensitive email/slug comparisons

-- ── updated_at trigger (reused pattern from the old schema — it was correct) ──

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger: stamps updated_at = now(). Attach to any table with an updated_at column.';

-- ── Role/authorization helper functions ─────────────────────────────────────
-- All read app_metadata ONLY (never user_metadata, which is client-editable
-- via supabase.auth.updateUser() — AUDIT_REPORT.md AUTH-07/RLS-02). These are
-- STABLE (not IMMUTABLE — auth.jwt() can differ per statement/session) so
-- Postgres can cache the result within a single query but never across
-- queries/sessions.

create or replace function public.current_platform_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role';
$$;

comment on function public.current_platform_role() is
  'The caller''s platform-wide role from the JWT app_metadata claim (server-controlled only). NULL if unauthenticated or role never set. One of: traveler, agency, admin, super_admin, support, finance.';

create or replace function public.is_authenticated_aal2()
returns boolean
language sql
stable
as $$
  -- Authentication-assurance-level check. AUDIT_REPORT.md AUTH-01 found that
  -- admin MFA was enforced only by client-side redirect logic, with nothing
  -- server-side checking the session's AAL — meaning an AAL1 (password-only)
  -- session already carried full admin authorization everywhere.
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- PHASE 3 DECISION (see PHASE_3_AUTH.md): MFA is MANDATORY for every elevated
-- platform role, not optional. is_admin()/is_super_admin()/
-- is_finance_or_admin()/is_support_or_admin() bake in is_authenticated_aal2()
-- directly, rather than leaving each RLS policy to remember to add it — this
-- is the same "one function, one place to get it right" rationale as
-- current_platform_role() itself. An account with an elevated role that has
-- NOT yet enrolled MFA is, correctly, unable to pass any of these checks at
-- all (its session can never reach aal2) — this is deliberate, not a bug:
-- the application layer (Phase 3, AdminLogin.tsx/ProtectedRoute.tsx) is
-- responsible for routing such an account to MFA enrollment before it can do
-- anything, and these functions are what makes that requirement a genuine
-- authorization boundary rather than a polite navigation suggestion.
--
-- Edge functions CANNOT call these Postgres functions directly (they run in
-- Deno, not inside a database session) — they must independently decode the
-- caller's JWT `aal` claim and apply the identical rule. See
-- supabase/functions/_shared/auth.ts, added in Phase 3, which is the
-- TypeScript equivalent of is_authenticated_aal2() and must be kept in sync
-- with it by hand (there is no way to share one implementation across
-- Postgres and Deno here — this is an accepted, documented duplication, not
-- an oversight).

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_platform_role() in ('admin', 'super_admin')
     and public.is_authenticated_aal2();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.current_platform_role() = 'super_admin'
     and public.is_authenticated_aal2();
$$;

create or replace function public.is_finance_or_admin()
returns boolean
language sql
stable
as $$
  -- FINANCE handles settlement/payout/ledger-adjustment actions (target §61);
  -- admins can always act as a superset.
  select public.current_platform_role() in ('finance', 'admin', 'super_admin')
     and public.is_authenticated_aal2();
$$;

create or replace function public.is_support_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_platform_role() in ('support', 'admin', 'super_admin')
     and public.is_authenticated_aal2();
$$;

-- Unelevated role check — no AAL requirement, since travelers/agencies are
-- not required to enroll MFA (target §28/§29 scope this requirement to the
-- admin-tier roles only). Exposed for RLS policies that need to distinguish
-- "signed in as this specific elevated role" from "is the resource owner" in
-- a context where the AAL-gated variant above would be wrong — e.g. nowhere
-- yet in this schema, but reserved rather than inlining role literals again.
create or replace function public.current_platform_role_unverified()
returns text
language sql
stable
as $$
  select public.current_platform_role();
$$;

comment on function public.current_platform_role_unverified() is
  'Same as current_platform_role() — exists only so call sites can express "I am intentionally not requiring AAL2 here" explicitly, rather than looking like a mistaken omission. Prefer is_admin()/is_finance_or_admin()/is_support_or_admin() for anything that actually gates access.';

-- ── Agency membership helper ─────────────────────────────────────────────────
-- Deliberately created here as a forward reference — the agencies/agency_users
-- tables themselves are created in the next migration. Postgres allows a
-- function body referencing a not-yet-existing table only if the function is
-- not actually invoked before the table exists, which is true here (nothing
-- calls this until later migrations' RLS policies do, by which point the
-- table exists). To keep migrations strictly forward-only and avoid this
-- fragility, this function is instead defined in the Agency Management
-- migration (0003) immediately after the agency_users table it depends on —
-- see that file. (This comment intentionally documents the decision so a
-- future reader doesn't go looking for it here.)
