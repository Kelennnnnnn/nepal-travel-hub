-- ============================================================================
-- Into Nepal — migration 3 of N: Agency Management
--
-- PHASE_1_ARCHITECTURE.md §3.1. Splits the old agency_applications table
-- (which conflated the business entity, its documents, and its verification
-- status into flat columns on one row) into: agencies (the business entity),
-- agency_users (N:1 staff membership — new capability, old system was
-- strictly 1 auth user = 1 agency), agency_documents (one row per document,
-- with type/status/expiry — old system had 3 fixed url columns),
-- agency_verification (current verification state), and
-- agency_status_history (append-only, new — old system had no immutable
-- record of status transitions at all).
--
-- Non-negotiable rule carried forward from target §66 / §22: "let agency
-- approve itself" — NEVER. Enforced below at the RLS layer: no agency_users
-- row, regardless of role, ever has UPDATE access to agency_verification.status.
-- Only is_admin() does, and only via the audited path built in Phase 4.
-- ============================================================================

create table public.agencies (
  id                     uuid primary key default gen_random_uuid(),
  legal_name             text not null,
  display_name           text not null,
  slug                   citext not null unique,  -- clean URLs, target §34: /agency/<slug>
  description            text not null default '',
  city                   text,
  district               text,
  address                text,
  phone                  text,
  email                  citext,
  website                text,
  -- Opaque, provider-agnostic reference to wherever payout funds actually go.
  -- Deliberately NOT named stripe_account_id (that field is gone — target
  -- §47). Real shape depends on the NIC ASIA settlement model, which is an
  -- open question from PHASE_0_FORENSIC_AUDIT.md §10 — this column exists so
  -- later phases have somewhere to put it without another schema change.
  payout_account_reference text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.agencies is
  'The business entity. Verification status lives on agency_verification, not here — current status is derivable by joining to the latest agency_verification row.';

create trigger set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

create index idx_agencies_slug on public.agencies (slug);

-- ── Agency staff membership (new capability — target §7/§19) ───────────────

create table public.agency_users (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  agency_role  text not null check (agency_role in ('owner', 'manager', 'staff')),
  invited_by   uuid references auth.users(id),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  removed_at   timestamptz,  -- soft-remove: preserves history, never hard-deleted
  unique (agency_id, user_id)
);

comment on table public.agency_users is
  'Links users to agencies, supporting multiple staff per agency (target §7). agency_role is scoped to this agency only — distinct from the platform-wide role in auth.users.app_metadata.';

create index idx_agency_users_agency on public.agency_users (agency_id) where removed_at is null;
create index idx_agency_users_user on public.agency_users (user_id) where removed_at is null;

-- Now that agency_users exists, define the membership helper deferred from
-- migration 1. Every later migration's agency-scoped RLS policies use this
-- instead of repeating the EXISTS(...) subquery inline (same DRY rationale
-- as the role helpers in migration 1).
create or replace function public.has_agency_access(target_agency_id uuid, min_role text default 'staff')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_users au
    where au.agency_id = target_agency_id
      and au.user_id = auth.uid()
      and au.removed_at is null
      and (
        min_role = 'staff'
        or (min_role = 'manager' and au.agency_role in ('manager', 'owner'))
        or (min_role = 'owner' and au.agency_role = 'owner')
      )
  );
$$;

comment on function public.has_agency_access(uuid, text) is
  'True if the caller is an active (non-removed) member of the given agency, at or above min_role (staff < manager < owner). Every agency-scoped RLS policy in this schema uses this instead of a bare agency_id = auth.uid() check, so it works correctly for multi-staff agencies. SECURITY DEFINER + fixed search_path: agency_users'' own RLS policy (agency_users_select_own_agency) calls this same function, so without SECURITY DEFINER, evaluating it triggers RLS on the inner query, which re-invokes this function, causing infinite recursion (Postgres error 42P17 / stack depth limit exceeded). Bypassing RLS here is safe because the function itself enforces the only access rule that matters (au.user_id = auth.uid()).';

-- ── Documents ────────────────────────────────────────────────────────────

create table public.agency_documents (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  document_type    text not null check (document_type in (
                      'business_registration', 'tourism_license', 'pan_certificate',
                      'insurance', 'other'
                    )),
  storage_path     text not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  expires_at       date,
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

comment on table public.agency_documents is
  'One row per KYC/business document, replacing the old flat license_url/pan_url/insurance_url columns. Storage bucket policy is defined in the storage migration and matches this table''s ownership model.';

create index idx_agency_documents_agency on public.agency_documents (agency_id);

-- ── Verification (current state) ────────────────────────────────────────────

create table public.agency_verification (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null unique references public.agencies(id) on delete cascade,
  status             text not null default 'draft' check (status in (
                        'draft', 'submitted', 'in_review', 'more_info_required',
                        'approved', 'suspended', 'rejected'
                      )),
  submitted_at       timestamptz,
  reviewed_by        uuid references auth.users(id),
  reviewed_at        timestamptz,
  rejection_reason   text,
  info_requested_note text,
  updated_at         timestamptz not null default now()
);

comment on table public.agency_verification is
  'Current verification status. Every transition also writes an immutable row to agency_status_history — see the trigger below. Status can NEVER be set to approved/suspended/rejected/more_info_required by the applicant themselves — only by is_admin(), enforced in RLS.';

create trigger set_updated_at
  before update on public.agency_verification
  for each row execute function public.set_updated_at();

-- ── Status history (append-only, new — target §7/§22) ───────────────────────

create table public.agency_status_history (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references auth.users(id),
  reason      text,
  created_at  timestamptz not null default now()
);

comment on table public.agency_status_history is
  'Immutable audit trail of every agency_verification.status transition. INSERT-only — written exclusively by the trigger below, never by application code directly, so it cannot drift from what actually happened to agency_verification.';

create index idx_agency_status_history_agency on public.agency_status_history (agency_id, created_at desc);

create or replace function public.record_agency_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.agency_status_history (agency_id, from_status, to_status, changed_by, reason)
    values (
      new.agency_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      new.reviewed_by,  -- who actioned it, when applicable
      coalesce(new.rejection_reason, new.info_requested_note)
    );
  end if;
  return new;
end;
$$;

create trigger record_agency_status_change
  after insert or update on public.agency_verification
  for each row execute function public.record_agency_status_change();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.agencies enable row level security;
alter table public.agency_users enable row level security;
alter table public.agency_documents enable row level security;
alter table public.agency_verification enable row level security;
alter table public.agency_status_history enable row level security;

-- Phase 5 addition: agencies_public_select_approved's USING clause needs to
-- check agency_verification.status, but that table has NO select policy for
-- anon/traveler at all (deliberately — it holds rejection reasons and
-- internal review notes). A raw EXISTS(select ... from agency_verification
-- ...) subquery runs as the SAME calling role, so it's subject to THAT
-- table's RLS too — meaning it silently sees zero rows for anon/traveler,
-- and the policy always evaluates false for them regardless of the agency's
-- real status. This isn't a hypothetical: it was caught during Phase 5
-- testing, when the public agency-profile page (the one thing this policy
-- exists for) returned an empty result for an agency that was, confirmed
-- via direct SQL, genuinely approved. Same bug class as the has_agency_
-- access()/conversation_participants recursion bugs fixed in Phase 4 — a
-- cross-table RLS dependency that only breaks for a role the author didn't
-- test as. Fixed the same way: a SECURITY DEFINER helper whose internal
-- lookup bypasses RLS, since the helper itself is the intended, narrow
-- public surface ("is this specific agency publicly approved, yes/no") —
-- not a general grant to read agency_verification directly.
create or replace function public.is_agency_publicly_approved(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_verification v
    where v.agency_id = target_agency_id and v.status = 'approved'
  );
$$;

-- agencies: public can read agencies that are approved (for the public
-- agency-profile page); staff can read their own agency regardless of status;
-- admins can read/write all.
drop policy if exists "agencies_public_select_approved" on public.agencies;
create policy "agencies_public_select_approved"
  on public.agencies for select
  using (public.is_agency_publicly_approved(id));

drop policy if exists "agencies_staff_select_own" on public.agencies;
create policy "agencies_staff_select_own"
  on public.agencies for select
  using (public.has_agency_access(id));

drop policy if exists "agencies_staff_update_own" on public.agencies;
create policy "agencies_staff_update_own"
  on public.agencies for update
  using (public.has_agency_access(id, 'manager'))
  with check (public.has_agency_access(id, 'manager'));
  -- Note: this grants write access to business-profile fields (name,
  -- description, contact info) only. It does NOT touch agency_verification
  -- (separate table, separate, stricter policy below) — an agency manager
  -- editing their business description can never touch their own approval
  -- status this way.

drop policy if exists "agencies_admin_all" on public.agencies;
create policy "agencies_admin_all"
  on public.agencies for all
  using (public.is_admin())
  with check (public.is_admin());

-- agency_users: members can see their own agency's roster; owners/managers
-- can manage it; admins can see/manage all.
drop policy if exists "agency_users_select_own_agency" on public.agency_users;
create policy "agency_users_select_own_agency"
  on public.agency_users for select
  using (public.has_agency_access(agency_id));

drop policy if exists "agency_users_manage_own_agency" on public.agency_users;
create policy "agency_users_manage_own_agency"
  on public.agency_users for all
  using (public.has_agency_access(agency_id, 'owner'))
  with check (public.has_agency_access(agency_id, 'owner'));

drop policy if exists "agency_users_admin_all" on public.agency_users;
create policy "agency_users_admin_all"
  on public.agency_users for all
  using (public.is_admin())
  with check (public.is_admin());

-- agency_documents: agency staff can read/upload their own; only admins can
-- review (set status/reviewed_by/rejection_reason) — enforced by NOT granting
-- agency staff an update policy at all (insert + select only).
drop policy if exists "agency_documents_select_own" on public.agency_documents;
create policy "agency_documents_select_own"
  on public.agency_documents for select
  using (public.has_agency_access(agency_id));

drop policy if exists "agency_documents_insert_own" on public.agency_documents;
create policy "agency_documents_insert_own"
  on public.agency_documents for insert
  with check (public.has_agency_access(agency_id, 'manager'));

drop policy if exists "agency_documents_admin_all" on public.agency_documents;
create policy "agency_documents_admin_all"
  on public.agency_documents for all
  using (public.is_admin())
  with check (public.is_admin());

-- agency_verification: staff can READ their own; can INSERT only the very
-- first row (status defaults to 'draft'); UPDATE is admin-only, full stop —
-- this is the actual enforcement of "agency cannot approve itself."
drop policy if exists "agency_verification_select_own" on public.agency_verification;
create policy "agency_verification_select_own"
  on public.agency_verification for select
  using (public.has_agency_access(agency_id));

drop policy if exists "agency_verification_insert_own" on public.agency_verification;
create policy "agency_verification_insert_own"
  on public.agency_verification for insert
  with check (public.has_agency_access(agency_id, 'owner') and status in ('draft', 'submitted'));

drop policy if exists "agency_verification_admin_all" on public.agency_verification;
create policy "agency_verification_admin_all"
  on public.agency_verification for all
  using (public.is_admin())
  with check (public.is_admin());
  -- No UPDATE policy exists for agency staff at all — this is intentional,
  -- not an oversight. Compare to the old system, where the equivalent
  -- protection had to be retrofitted via fix_agency_application_rls.sql
  -- after a self-approval vulnerability was found in production
  -- (PHASE_0_FORENSIC_AUDIT.md §5). Here it's correct from the start because
  -- there is simply no grant to remove.

-- agency_status_history: read-only for agency staff (their own) and admins;
-- no insert/update/delete policy for ANY role — the table is written
-- exclusively by the record_agency_status_change() trigger (SECURITY
-- DEFINER), which bypasses RLS. This is what makes it genuinely immutable
-- from the application's perspective, not just "immutable by convention."
drop policy if exists "agency_status_history_select_own" on public.agency_status_history;
create policy "agency_status_history_select_own"
  on public.agency_status_history for select
  using (public.has_agency_access(agency_id));

drop policy if exists "agency_status_history_admin_select" on public.agency_status_history;
create policy "agency_status_history_admin_select"
  on public.agency_status_history for select
  using (public.is_admin());
