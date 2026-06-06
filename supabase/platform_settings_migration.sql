-- Single source of truth for platform-wide flags and config.
-- Commission rate is 15 % (flat). Change via platform_settings — no redeploy needed.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.platform_settings (key, value) VALUES
  ('payments_enabled',  'true'::jsonb),
  ('maintenance_mode',  'false'::jsonb),
  ('payouts_enabled',   'true'::jsonb),
  ('commission_rate',   '15'::jsonb),
  ('platform_name',     '"Yatra Nepal"'::jsonb),
  ('contact_email',     '"hello@yatranepal.com"'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read flags (the client needs to know if maintenance mode is on)
CREATE POLICY "public_read_settings"
  ON public.platform_settings FOR SELECT
  USING (true);

-- Only admins can change them
CREATE POLICY "admin_write_settings"
  ON public.platform_settings FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Helper to read a setting from edge functions / SQL
CREATE OR REPLACE FUNCTION public.get_setting(p_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT value FROM public.platform_settings WHERE key = p_key;
$$;
