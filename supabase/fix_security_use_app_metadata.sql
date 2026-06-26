-- SECURITY FIX: Move role checks from user_metadata → app_metadata
--
-- user_metadata (raw_user_meta_data) is USER-EDITABLE via supabase.auth.updateUser().
-- Any authenticated user could run:
--   supabase.auth.updateUser({ data: { role: 'admin' } })
-- and bypass every policy below. app_metadata (raw_app_meta_data) is ONLY
-- writable via the Admin API (service role key) — never by the user.
--
-- Run this once in Supabase Dashboard → SQL Editor.
-- After running, deploy updated edge functions and frontend.

-- ── 1. agency_applications ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_read_all"   ON public.agency_applications;
DROP POLICY IF EXISTS "admins_update_all" ON public.agency_applications;

CREATE POLICY "admins_read_all" ON public.agency_applications
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_update_all" ON public.agency_applications
  FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 2. bookings ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_select_all_bookings"  ON public.bookings;
DROP POLICY IF EXISTS "admins_update_all_bookings"  ON public.bookings;
DROP POLICY IF EXISTS "admins_manage_all_bookings"  ON public.bookings;

CREATE POLICY "admins_select_all_bookings" ON public.bookings
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_update_all_bookings" ON public.bookings
  FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_manage_all_bookings" ON public.bookings
  FOR ALL
  USING    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 3. payouts ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_manage_payouts" ON public.payouts;

CREATE POLICY "admin_manage_payouts" ON public.payouts
  FOR ALL
  USING    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 4. agency_bank_details ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_read_all_bank" ON public.agency_bank_details;

CREATE POLICY "admin_read_all_bank" ON public.agency_bank_details
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 5. audit_log ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_read_audit"   ON public.audit_log;
DROP POLICY IF EXISTS "admin_insert_audit" ON public.audit_log;

CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_insert_audit" ON public.audit_log
  FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 6. profiles ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 7. reviews ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_manage_all_reviews" ON public.reviews;

CREATE POLICY "admins_manage_all_reviews" ON public.reviews
  FOR ALL
  USING    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 8. platform_settings ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_write_settings" ON public.platform_settings;

CREATE POLICY "admin_write_settings" ON public.platform_settings
  FOR ALL
  USING    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 9. Fix financial-fields trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lock_booking_financial_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;

  NEW.payment_status    := OLD.payment_status;
  NEW.total_amount      := OLD.total_amount;
  NEW.commission_rate   := OLD.commission_rate;
  NEW.commission_amount := OLD.commission_amount;
  NEW.net_payout        := OLD.net_payout;
  NEW.price_per_person  := OLD.price_per_person;
  NEW.payment_intent_id := OLD.payment_intent_id;
  NEW.traveler_id       := OLD.traveler_id;
  NEW.agency_id         := OLD.agency_id;
  NEW.listing_id        := OLD.listing_id;
  RETURN NEW;
END;
$$;

-- ── 10. Migrate existing roles to app_metadata ─────────────────────────────
-- Copies 'admin' and 'agency' role values from user_metadata → app_metadata
-- for all existing users. Safe to run multiple times (idempotent merge).

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', raw_user_meta_data ->> 'role')
WHERE raw_user_meta_data ->> 'role' IN ('admin', 'agency');

-- ── 11. Harden signup trigger ──────────────────────────────────────────────
-- The old enforce_default_role wrote role:'user' into user_metadata on INSERT.
-- Since user_metadata is no longer trusted for security, that's irrelevant.
-- Drop it to avoid confusion; role defaults to null (= "user") in app_metadata.

DROP TRIGGER IF EXISTS enforce_default_role_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_default_role();
