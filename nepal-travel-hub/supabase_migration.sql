-- ============================================================
-- Agency Applications Table + RLS + Realtime
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.agency_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  pan_number TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT DEFAULT '',
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  license_url TEXT DEFAULT '',
  pan_url TEXT DEFAULT '',
  insurance_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'verified', 'rejected')),
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_agency_applications_user_id ON public.agency_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_applications_status ON public.agency_applications(status);

-- 3. Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.agency_applications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.agency_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable Row Level Security
ALTER TABLE public.agency_applications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Agencies can read their own application
CREATE POLICY "agencies_read_own"
  ON public.agency_applications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Agencies can insert their own application
CREATE POLICY "agencies_insert_own"
  ON public.agency_applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Agencies can update their own application (e.g. resubmit)
CREATE POLICY "agencies_update_own"
  ON public.agency_applications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can read ALL applications
CREATE POLICY "admins_read_all"
  ON public.agency_applications
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Admins can update ALL applications (approve/reject)
CREATE POLICY "admins_update_all"
  ON public.agency_applications
  FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 6. Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_applications;
