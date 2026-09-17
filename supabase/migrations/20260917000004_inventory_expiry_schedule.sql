-- ============================================================================
-- Into Nepal — Phase 7: Inventory reservation engine — expiry scheduling
--
-- Forensic finding: migration 5's expire_stale_reservations() and migration
-- 6's expire_stale_quotes() both exist and are both correctly written, but
-- NEITHER was ever actually scheduled anywhere — no pg_cron extension, no
-- cron.schedule() call, in any migration. Both functions' own comments say
-- "called on a schedule (pg_cron)", stating an intent that was never
-- carried out. Left as-is, every HELD reservation whose 15-minute TTL
-- passes without a completed payment would sit HELD forever, permanently
-- locking that capacity out of sale — the exact kind of silent, only-
-- visible-under-real-load gap this project's whole redesign exists to
-- close (compare AUDIT_REPORT.md AVAIL-01/AVAIL-02, the old system's
-- double-decrement bug, which was also a "looks correct in the code,
-- wrong in practice" defect).
-- ============================================================================

create extension if not exists pg_cron schema extensions;

-- Runs every minute. hold_inventory()'s default TTL is 15 minutes, so a
-- 1-minute sweep interval reclaims capacity promptly without meaningfully
-- adding load (both swept tables are indexed on (status, expires_at) WHERE
-- status = 'held'/'active' — see migration 5/6 — so an empty sweep is cheap).
select cron.schedule(
  'expire-stale-inventory-reservations',
  '* * * * *',
  $$select public.expire_stale_reservations();$$
);

-- expire_stale_quotes() has no real data yet (booking_quotes is only
-- populated once Phase 9's create-quote function exists), but scheduling it
-- now is harmless (a no-op sweep of an empty table) and means Phase 9 does
-- not also need to remember to add this — consistent with this schema's
-- existing pattern of tables/functions built ahead of the phase that
-- populates them.
select cron.schedule(
  'expire-stale-booking-quotes',
  '* * * * *',
  $$select public.expire_stale_quotes();$$
);
