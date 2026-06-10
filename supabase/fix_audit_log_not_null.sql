-- The financial audit trigger inserts NULL for admin_user_id on automated
-- system events (no human admin involved — e.g. a Stripe webhook flipping a
-- booking to "completed", or the stale-booking reaper cancelling a booking).
-- The original NOT NULL constraint makes every such status change fail with
-- a foreign-key/not-null constraint violation. Run once in the SQL editor.

ALTER TABLE public.audit_log
  ALTER COLUMN admin_user_id DROP NOT NULL;
