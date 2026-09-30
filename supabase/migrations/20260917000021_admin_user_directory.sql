-- Fixes the admin-users edge function's "list" action: it called
-- supabase.auth.admin.listUsers({ perPage: 1000 }) and then filtered by
-- search term AND computed the role/suspension stats entirely in
-- JavaScript, over every user in the project (capped at, and silently
-- truncating past, 1000) — every one of the FULL GoTrue user records was
-- also shipped back to the browser. Replaced with two SECURITY DEFINER
-- RPCs that do the filtering, pagination, and aggregation in Postgres and
-- return only the columns the admin UI actually renders.
-- ============================================================================

-- ── 1. profiles.email — a maintained copy of auth.users.email. Indexing
--    auth.users directly is NOT available to this migration's role (tried:
--    `create index ... on auth.users (lower(email))` fails with "must be
--    owner of table users" — auth.users is owned by supabase_auth_admin,
--    not postgres, even though CREATE TRIGGER on it — used below and
--    already used by handle_new_user()/set_default_role_on_signup() — is
--    allowed). This is exactly the documented fallback: keep a copy on
--    profiles, which this migration DOES own, and index that instead. ────

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

comment on column public.profiles.email is
  'Maintained copy of auth.users.email — kept in sync by handle_new_user() (insert) and sync_profile_email() (update) below. Exists ONLY because an index cannot be added directly to auth.users (not owned by this migration''s role); this column is what idx_profiles_email_lower actually indexes. Never treated as more authoritative than auth.users.email itself.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

comment on function public.sync_profile_email() is
  'Keeps profiles.email current when a user changes their email (auth.users.email itself, via GoTrue''s change-email flow — not something any client ever writes directly). SECURITY DEFINER: the auth.users UPDATE that fires this comes from GoTrue''s own internal service role, which has no write grant on public.profiles.';

drop trigger if exists sync_profile_email on auth.users;
create trigger sync_profile_email
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ── 2. Indexes backing admin_user_directory()'s search ────────────────────

create extension if not exists pg_trgm;

create index if not exists idx_profiles_email_lower
  on public.profiles (lower(email));
create index if not exists idx_profiles_full_name_trgm
  on public.profiles using gin (full_name gin_trgm_ops);

comment on index public.idx_profiles_email_lower is
  'Accelerates admin_user_directory()''s email search for exact/prefix matches (lower(email) = ... or LIKE ''term%''). A leading-wildcard ILIKE (''%term%'', what the function actually runs, for UX consistency with the full_name search) cannot use a plain btree index — upgrade this to a trgm GIN index too if email search performance ever matters at real data volume.';

-- ── 3. admin_user_directory() — filtering, pagination, and shaping all
--    happen here; the edge function passes p_search/p_role/p_limit/
--    p_offset straight through and returns exactly this shape to the
--    client (no more full GoTrue user objects reaching the browser). ──────

create or replace function public.admin_user_directory(
  p_search text default null,
  p_role text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  banned_until timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(p_search), '');
begin
  -- Both checks are listed explicitly per spec even though is_support_or_
  -- admin() is already is_admin()'s superset (admin/super_admin/support,
  -- all requiring aal2) — cheap, and defensive against either helper's
  -- definition narrowing independently in the future.
  if not (public.is_admin() or public.is_support_or_admin()) then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'INVALID_LIMIT: p_limit must be between 1 and 200' using errcode = 'P0001';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'INVALID_OFFSET: p_offset cannot be negative' using errcode = 'P0001';
  end if;

  return query
  with matched as (
    select
      u.id,
      u.email::text as email,
      p.full_name,
      coalesce(u.raw_app_meta_data ->> 'role', 'traveler') as role,
      u.banned_until,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    -- LEFT JOIN, not INNER: a user missing a profiles row (shouldn't
    -- happen now that handle_new_user() always creates one, but could for
    -- an account created before that trigger existed) must still appear
    -- in the admin list, just with full_name/email search limited to
    -- whatever auth.users itself has.
    where (p_role is null or coalesce(u.raw_app_meta_data ->> 'role', 'traveler') = p_role)
      and (
        v_search is null
        or p.full_name ilike '%' || v_search || '%'
        or lower(coalesce(p.email, u.email::text)) like '%' || lower(v_search) || '%'
      )
  )
  select m.id, m.email, m.full_name, m.role, m.banned_until, m.created_at, m.last_sign_in_at,
         count(*) over ()::bigint as total_count
  from matched m
  order by m.created_at desc
  limit p_limit offset p_offset;
end;
$$;

comment on function public.admin_user_directory(text, text, int, int) is
  'Paginated, searchable admin user list — replaces admin-users/index.ts "list" action''s old listUsers({perPage:1000}) + in-JS filter. total_count is the count of rows matching p_search/p_role BEFORE pagination (a window function evaluated over the full filtered set, so every returned row carries the same value) — the caller uses it to compute total pages. Requires is_admin() or is_support_or_admin(); called with the CALLER''s own JWT (not the service-role key), since both of those checks resolve auth.uid() from it.';

revoke execute on function public.admin_user_directory(text, text, int, int) from public, anon;
grant  execute on function public.admin_user_directory(text, text, int, int) to authenticated;

-- ── 4. admin_user_stats() — the dashboard's role-breakdown counters, as
--    one aggregate scan instead of listUsers(1000) + Array.filter() six
--    times over the same in-memory array. ──────────────────────────────

create or replace function public.admin_user_stats()
returns table (
  total bigint,
  travelers bigint,
  agencies bigint,
  admins bigint,
  support bigint,
  finance bigint,
  suspended bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_support_or_admin()) then
    raise exception 'INSUFFICIENT_PRIVILEGE' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint as total,
    count(*) filter (where coalesce(raw_app_meta_data ->> 'role', 'traveler') = 'traveler')::bigint as travelers,
    count(*) filter (where raw_app_meta_data ->> 'role' = 'agency')::bigint as agencies,
    count(*) filter (where raw_app_meta_data ->> 'role' in ('admin', 'super_admin'))::bigint as admins,
    count(*) filter (where raw_app_meta_data ->> 'role' = 'support')::bigint as support,
    count(*) filter (where raw_app_meta_data ->> 'role' = 'finance')::bigint as finance,
    count(*) filter (where banned_until is not null and banned_until > now())::bigint as suspended
  from auth.users;
end;
$$;

comment on function public.admin_user_stats() is
  'Role/suspension breakdown for the admin users dashboard — one aggregate query over auth.users instead of listUsers(1000) + six Array.filter() passes in JS. Same auth requirement and caller-JWT requirement as admin_user_directory().';

revoke execute on function public.admin_user_stats() from public, anon;
grant  execute on function public.admin_user_stats() to authenticated;

-- ── Extend audit C1's exposure-guard allowlist (cumulative pattern) — both
--    new functions do their own internal is_admin()/is_support_or_admin()
--    check and are meant to be called directly by an authenticated admin/
--    support session, same reasoning as set_departure_capacity. ──────────

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
      -- audit H5/H7 additions
      'agency_is_active', 'admin_suspend_agency', 'admin_reinstate_agency',
      -- audit M1 additions
      'remove_agency_member', 'change_agency_member_role', 'agency_team_roster',
      -- onboarding-transaction additions
      'save_agency_draft', 'submit_agency_application',
      -- account-deletion addition: self-scoped to auth.uid(), same pattern
      -- as every other self-checking SECURITY DEFINER function already on
      -- this allowlist
      'delete_my_account',
      -- admin-user-directory additions: each does its own is_admin()/
      -- is_support_or_admin() check internally
      'admin_user_directory', 'admin_user_stats'
    );
$$;

revoke execute on function public.audit_definer_exposure() from public, anon, authenticated;
grant  execute on function public.audit_definer_exposure() to service_role;
