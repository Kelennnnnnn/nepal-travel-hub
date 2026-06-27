-- SECURITY FIX: Move role checks from user_metadata → app_metadata
--
-- Uses EXECUTE inside each DO block so the table name is only resolved at
-- runtime (after the IF EXISTS check), not at parse time. This means the
-- script is safe to run even if some tables haven't been created yet.
-- Safe to re-run (idempotent).

-- ── 1. agency_applications ─────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='agency_applications') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_read_all"   ON public.agency_applications $x$;
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_update_all" ON public.agency_applications $x$;
    EXECUTE $x$
      CREATE POLICY "admins_read_all" ON public.agency_applications
        FOR SELECT USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
    EXECUTE $x$
      CREATE POLICY "admins_update_all" ON public.agency_applications
        FOR UPDATE USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 2. bookings ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='bookings') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_select_all_bookings" ON public.bookings $x$;
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_update_all_bookings" ON public.bookings $x$;
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_manage_all_bookings" ON public.bookings $x$;
    EXECUTE $x$
      CREATE POLICY "admins_select_all_bookings" ON public.bookings
        FOR SELECT USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
    EXECUTE $x$
      CREATE POLICY "admins_update_all_bookings" ON public.bookings
        FOR UPDATE USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
    EXECUTE $x$
      CREATE POLICY "admins_manage_all_bookings" ON public.bookings
        FOR ALL
        USING    ((auth.jwt()->'app_metadata'->>'role')='admin')
        WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 3. payouts ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='payouts') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admin_manage_payouts" ON public.payouts $x$;
    EXECUTE $x$
      CREATE POLICY "admin_manage_payouts" ON public.payouts
        FOR ALL
        USING    ((auth.jwt()->'app_metadata'->>'role')='admin')
        WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 4. agency_bank_details ─────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='agency_bank_details') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admin_read_all_bank" ON public.agency_bank_details $x$;
    EXECUTE $x$
      CREATE POLICY "admin_read_all_bank" ON public.agency_bank_details
        FOR SELECT USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 5. audit_log ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='audit_log') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admin_read_audit"   ON public.audit_log $x$;
    EXECUTE $x$ DROP POLICY IF EXISTS "admin_insert_audit" ON public.audit_log $x$;
    EXECUTE $x$
      CREATE POLICY "admin_read_audit" ON public.audit_log
        FOR SELECT USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
    EXECUTE $x$
      CREATE POLICY "admin_insert_audit" ON public.audit_log
        FOR INSERT WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 6. profiles ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='profiles') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles $x$;
    EXECUTE $x$
      CREATE POLICY "Admins can read all profiles" ON public.profiles
        FOR SELECT USING ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 7. reviews ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='reviews') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admins_manage_all_reviews" ON public.reviews $x$;
    EXECUTE $x$
      CREATE POLICY "admins_manage_all_reviews" ON public.reviews
        FOR ALL
        USING    ((auth.jwt()->'app_metadata'->>'role')='admin')
        WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 8. platform_settings ───────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='platform_settings') THEN
    EXECUTE $x$ DROP POLICY IF EXISTS "admin_write_settings" ON public.platform_settings $x$;
    EXECUTE $x$
      CREATE POLICY "admin_write_settings" ON public.platform_settings
        FOR ALL
        USING    ((auth.jwt()->'app_metadata'->>'role')='admin')
        WITH CHECK ((auth.jwt()->'app_metadata'->>'role')='admin')
    $x$;
  END IF;
END $$;

-- ── 9. Fix financial-fields trigger ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='bookings')
  AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='lock_booking_financial_fields') THEN
    EXECUTE $x$
      CREATE OR REPLACE FUNCTION public.lock_booking_financial_fields()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $fn$
      BEGIN
        IF auth.role()='service_role'
           OR (auth.jwt()->'app_metadata'->>'role')='admin' THEN
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
      $fn$
    $x$;
  END IF;
END $$;

-- ── 10. Migrate existing roles to app_metadata (THE CRITICAL STEP) ─────────
-- Copies 'admin' and 'agency' roles from user_metadata → app_metadata.
-- Safe to run multiple times.

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', raw_user_meta_data->>'role')
WHERE raw_user_meta_data->>'role' IN ('admin', 'agency');

-- ── 11. Remove old signup trigger ──────────────────────────────────────────
DROP TRIGGER IF EXISTS enforce_default_role_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_default_role();
