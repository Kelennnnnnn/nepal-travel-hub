-- PROMPT 0-3: Bank Details — Separate secure table (not user_metadata / JWT)
-- Run this in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.agency_bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  account_number_encrypted TEXT NOT NULL DEFAULT '',
  routing_swift TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agency_user_id)
);

ALTER TABLE public.agency_bank_details ENABLE ROW LEVEL SECURITY;

-- Agency can read/update their own bank details
DROP POLICY IF EXISTS "agency_read_own_bank" ON public.agency_bank_details;
CREATE POLICY "agency_read_own_bank"
  ON public.agency_bank_details FOR SELECT
  USING (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "agency_insert_own_bank" ON public.agency_bank_details;
CREATE POLICY "agency_insert_own_bank"
  ON public.agency_bank_details FOR INSERT
  WITH CHECK (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "agency_update_own_bank" ON public.agency_bank_details;
CREATE POLICY "agency_update_own_bank"
  ON public.agency_bank_details FOR UPDATE
  USING (auth.uid() = agency_user_id);

-- Admin can read all (for payout processing)
DROP POLICY IF EXISTS "admin_read_all_bank" ON public.agency_bank_details;
CREATE POLICY "admin_read_all_bank"
  ON public.agency_bank_details FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

DROP TRIGGER IF EXISTS set_bank_updated_at ON public.agency_bank_details;
CREATE TRIGGER set_bank_updated_at
  BEFORE UPDATE ON public.agency_bank_details
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
