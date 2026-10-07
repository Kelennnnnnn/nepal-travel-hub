-- Guards src/lib/catalog.ts's DIFFICULTIES constant against drifting from
-- listings.difficulty's CHECK constraint (supabase/migrations/
-- 20260916000004_catalog.sql) — difficulty is a small, stable enum not
-- worth a full admin-managed table for (unlike category/location, Prompt
-- 24), so this is the "mirrored with a unit test" alternative Prompt 25
-- asked for. If this test ever fails, update BOTH the constraint and
-- src/lib/catalog.ts's DIFFICULTIES array together.
-- Run via: supabase test db supabase/tests/difficulty-enum-matches-frontend.sql
begin;
create extension if not exists pgtap;

select plan(1);

select is(
  pg_get_constraintdef(
    (select oid from pg_constraint where conrelid = 'public.listings'::regclass and conname = 'listings_difficulty_check')
  ),
  $$CHECK ((difficulty = ANY (ARRAY['Easy'::text, 'Moderate'::text, 'Challenging'::text, 'Difficult'::text, 'Expert'::text])))$$,
  'listings.difficulty CHECK constraint matches src/lib/catalog.ts''s DIFFICULTIES exactly, in this order'
);

select finish();
rollback;
