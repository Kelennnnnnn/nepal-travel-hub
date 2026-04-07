-- ============================================================
-- Auto-upgrade user role when agency application status changes
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================
-- This trigger automatically updates the user's auth metadata
-- when an admin approves or rejects an agency application.
-- No Edge Function needed — it runs inside the database.

CREATE OR REPLACE FUNCTION public.on_agency_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When approved: upgrade user role to "agency"
  IF NEW.status = 'verified' AND (OLD.status IS NULL OR OLD.status != 'verified') THEN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || '{"role": "agency"}'::jsonb
    WHERE id = NEW.user_id;
  END IF;

  -- When rejected: reset user role back to "user"
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || '{"role": "user"}'::jsonb
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists, then create
DROP TRIGGER IF EXISTS on_agency_status_change ON public.agency_applications;
CREATE TRIGGER on_agency_status_change
  AFTER UPDATE ON public.agency_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.on_agency_status_change();
