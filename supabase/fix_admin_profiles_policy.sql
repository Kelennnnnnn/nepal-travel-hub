-- Pen-test finding: "Admins can read all profiles" checks the top-level JWT
-- `role` claim, which is always anon/authenticated/service_role — never the
-- app-level 'admin' role (that lives in user_metadata, per the pattern used
-- by every other admin policy in the codebase). The policy currently fails
-- closed (no admin can use this path), but it's exactly the kind of
-- inconsistency someone "fixes" later by wiring a custom Auth Hook to set the
-- top-level claim — which would create a JWT-forgeable admin check. Align it
-- with the user_metadata pattern now.

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
