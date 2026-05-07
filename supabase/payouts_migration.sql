-- Add Stripe Connect account ID to agency_applications
ALTER TABLE public.agency_applications
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT DEFAULT '';

-- Payout tracking table
CREATE TABLE IF NOT EXISTS public.payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id    UUID NOT NULL REFERENCES auth.users(id),
  amount            NUMERIC(10,2) NOT NULL,
  stripe_transfer_id TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  booking_ids       UUID[] NOT NULL DEFAULT '{}',
  period_start      DATE,
  period_end        DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Agencies can view their own payouts
CREATE POLICY "agency_read_own_payouts" ON public.payouts
  FOR SELECT USING (auth.uid() = agency_user_id);

-- Admins can manage all payouts
CREATE POLICY "admin_manage_payouts" ON public.payouts
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
