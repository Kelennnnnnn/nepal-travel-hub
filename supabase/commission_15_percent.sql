-- Change the platform commission rate from 10 % to 15 %.
-- Run this once in the Supabase SQL editor.
-- create-payment-intent already reads from this table via getCommissionRate(),
-- so no edge-function deploy is required for new bookings.
-- Existing bookings already have commission_amount/net_payout baked in at their
-- original rate and are NOT retroactively changed here.

UPDATE public.platform_settings
SET    value      = '15'::jsonb,
       updated_at = now()
WHERE  key = 'commission_rate';
