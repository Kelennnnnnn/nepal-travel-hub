-- Allow admins to view and update all bookings (run in Supabase SQL editor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
      AND policyname = 'admins_manage_all_bookings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admins_manage_all_bookings"
        ON public.bookings
        FOR ALL
        USING (
          (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
        )
        WITH CHECK (
          (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
        );
    $policy$;
  END IF;
END;
$$;
