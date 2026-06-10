-- ────────────────────────────────────────────────────────────────────────────
-- welcome_email_trigger.sql
--
-- Fires the send-welcome-email edge function exactly once, the moment a user
-- confirms their email address (email_confirmed_at NULL → timestamp).
--
-- Prerequisites:
--   • pg_net extension must be enabled:
--       Dashboard → Database → Extensions → pg_net  ✓
--   • The following two Supabase Vault / app settings must be set:
--       app.supabase_functions_url   e.g. https://<project>.supabase.co/functions/v1
--       app.service_role_key         your SUPABASE_SERVICE_ROLE_KEY secret
--
-- Apply with:
--   supabase db push  (or paste directly into the SQL editor)
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth.trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  _functions_url TEXT;
  _service_key   TEXT;
BEGIN
  -- Only fire when email_confirmed_at goes from NULL to a real timestamp
  IF (OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL) THEN
    RETURN NEW;
  END IF;

  BEGIN
    _functions_url := current_setting('app.supabase_functions_url');
    _service_key   := current_setting('app.service_role_key');
  EXCEPTION WHEN OTHERS THEN
    -- Settings not configured — log and skip rather than hard-failing
    RAISE WARNING 'welcome_email_trigger: app settings not configured, skipping';
    RETURN NEW;
  END;

  PERFORM net.http_post(
    url     := _functions_url || '/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body    := jsonb_build_object(
      'user_id', NEW.id::text,
      'email',   NEW.email,
      'name',    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to auth.users ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;

CREATE TRIGGER on_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.trigger_welcome_email();

-- ────────────────────────────────────────────────────────────────────────────
-- Post-apply checklist
-- ────────────────────────────────────────────────────────────────────────────
-- Run these in the SQL editor to configure the runtime settings
-- (replace the placeholder values with real ones):
--
--   ALTER DATABASE postgres SET "app.supabase_functions_url"
--     = 'https://<your-project-ref>.supabase.co/functions/v1';
--
--   ALTER DATABASE postgres SET "app.service_role_key"
--     = '<your-service-role-key>';
--
-- Then run: SELECT pg_reload_conf();
-- ────────────────────────────────────────────────────────────────────────────
