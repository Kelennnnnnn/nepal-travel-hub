-- Pen-test finding: "agencies_update_own" on agency_applications has a USING
-- clause but no WITH CHECK, so Postgres reuses USING as the check — meaning an
-- agency can PATCH *any* column on their own application row, including
-- `status`. The on_agency_status_change trigger auto-grants role: 'agency'
-- the moment status becomes 'verified', so an applicant can self-approve and
-- bypass admin review entirely (and the properly-secured upgrade-agency-role
-- edge function) by simply setting their own row's status to 'verified'.
--
-- Fix: keep the ability to resubmit, but make it impossible to ever write a
-- reviewer-only status (verified/rejected/suspended) to your own row.

DROP POLICY IF EXISTS "agencies_update_own" ON public.agency_applications;

CREATE POLICY "agencies_update_own"
  ON public.agency_applications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'in_review'));
