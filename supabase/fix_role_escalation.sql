-- PROMPT 0-1: Fix Role Escalation Vulnerability at Sign-Up
-- Run this in Supabase SQL editor to prevent clients from self-assigning admin/agency roles.

CREATE OR REPLACE FUNCTION public.enforce_default_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Always force new users to 'user' role, ignoring client-supplied role
  NEW.raw_user_meta_data = NEW.raw_user_meta_data || '{"role": "user"}'::jsonb;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_default_role_on_signup ON auth.users;
CREATE TRIGGER enforce_default_role_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_default_role();

-- Note: Role upgrades to 'agency' are handled server-side via the
-- upgrade-agency-role edge function (called after admin approval only).
-- Role upgrades to 'admin' must be done manually by a super-admin in the Supabase dashboard.
