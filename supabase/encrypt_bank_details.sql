-- Enable Vault first: Dashboard > Database > Extensions > supabase_vault

-- Add the column that holds the Vault reference (not the number itself).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agency_bank_details') THEN
    ALTER TABLE public.agency_bank_details
      ADD COLUMN IF NOT EXISTS account_number_secret_id UUID;
  END IF;
END;
$$;

-- Store/update an encrypted bank account for an agency.
CREATE OR REPLACE FUNCTION public.set_bank_account(
  p_agency_id UUID,
  p_account_number TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Only the owner may set their own
  IF auth.uid() <> p_agency_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_secret_id := vault.create_secret(p_account_number, 'bank_acct_' || p_agency_id::text);

  UPDATE public.agency_bank_details
  SET account_number_secret_id = v_secret_id
  WHERE agency_user_id = p_agency_id;
END;
$$;
