-- Tests for Prompt 24's admin-managed-data migration (supabase/migrations/
-- 20260923000001_admin_managed_data.sql): the platform_settings type/
-- bounds/sensitivity system, get_setting_numeric(), and that deactivating
-- a category never breaks an existing listing's FK.
-- Run via: supabase test db supabase/tests/admin-managed-settings.sql
begin;
create extension if not exists pgtap;

select plan(8);

-- Matches the fixture-seeding convention used by supabase/tests/security/
-- exploits/H2_agency_cannot_confirm_unpaid.sql and others: setting the
-- claims here (before any auth.users rows exist for this sub) is just
-- this suite's established way to seed fixtures unobstructed, not a
-- claim about what a real session could do.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('a9100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-admin@test.com', '{"role": "admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', ''),
  ('a9100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-superadmin@test.com', '{"role": "super_admin"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '');

-- Fixture agency + listing in the 'Trekking' category, so the deactivation
-- check below has a real listing whose category FK must keep resolving.
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('a9a00000-0000-0000-0000-000000000001', 'P24 Test Agency', 'P24 Test Agency', 'p24-test-agency', 'Kathmandu', 'Kathmandu');

insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('a9a10000-0000-0000-0000-000000000001', 'a9a00000-0000-0000-0000-000000000001', 'p24-test-listing', 'P24 Test Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint here.', 'Trekking', 'Solukhumbu', '7 days', 7, 500, 10, 'Easy', 'published');

-- ── get_setting_numeric() ────────────────────────────────────────────────
-- Called here as the connection's ambient (table-owner) role, same as
-- every other call site in this file before the first `set local role` —
-- get_setting_numeric is zero-grant/"truly internal" by design (only a
-- SECURITY DEFINER caller reaches it via owner privilege in production),
-- and actually impersonating a granted-nothing role like service_role to
-- call it directly is not a scenario production code ever exercises.

select is(
  public.get_setting_numeric('reservation_fee_percent'),
  15::numeric,
  'get_setting_numeric reads the seeded reservation_fee_percent'
);

select is(
  public.get_setting_numeric('does_not_exist_at_all'),
  null::numeric,
  'get_setting_numeric returns null for a missing key, never an error'
);

-- ── A plain admin cannot change a financial setting ─────────────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a9100000-0000-0000-0000-000000000001', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'), 'aal', 'aal2')::text, true);

update public.platform_settings set value = '12'::jsonb where key = 'reservation_fee_percent';

select is(
  (select value from public.platform_settings where key = 'reservation_fee_percent'),
  '15'::jsonb,
  'a plain admin cannot change a financial setting -- RLS silently filters the update'
);

reset role;

-- ── A super_admin can, within bounds, and it is versioned ───────────────

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a9100000-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_metadata', json_build_object('role', 'super_admin'), 'aal', 'aal2')::text, true);

update public.platform_settings set value = '12'::jsonb where key = 'reservation_fee_percent';

select is(
  (select value from public.platform_settings where key = 'reservation_fee_percent'),
  '12'::jsonb,
  'a super_admin can change a financial setting'
);

select is(
  (select changed_by from public.platform_settings_history where key = 'reservation_fee_percent' order by created_at desc limit 1),
  'a9100000-0000-0000-0000-000000000002'::uuid,
  'the change is versioned in platform_settings_history with changed_by set to the super_admin'
);

-- ── An out-of-bounds value is rejected by the validation trigger ────────

select throws_ok(
  $$update public.platform_settings set value = '50'::jsonb where key = 'reservation_fee_percent'$$,
  'P0001',
  'INVALID_SETTING_VALUE: reservation_fee_percent must be <= 30',
  'a value above max_value is rejected by guard_platform_settings_value'
);

reset role;

-- ── Deactivating a category never breaks an existing listing's FK ───────

update public.categories set active = false where slug = 'Trekking';

select is(
  (select l.title from public.listings l join public.categories c on c.slug = l.category where l.id = 'a9a10000-0000-0000-0000-000000000001'),
  'P24 Test Listing',
  'an existing listing in a now-deactivated category still joins its category FK'
);

select is(
  (select active from public.categories where slug = 'Trekking'),
  false,
  'the category itself is recorded as inactive'
);

select finish();
rollback;
