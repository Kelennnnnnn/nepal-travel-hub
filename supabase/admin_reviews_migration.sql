-- Add admin moderation columns to reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Allow admins to manage all reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'admins_manage_all_reviews'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admins_manage_all_reviews"
        ON public.reviews
        FOR ALL
        USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
    $policy$;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_reviews_flagged ON public.reviews(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON public.reviews(featured) WHERE featured = true;
