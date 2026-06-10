-- ────────────────────────────────────────────────────────────────────────────
-- agency_application_email_trigger.sql
--
-- Sends the "Agency Application Received" email the moment a new row is
-- inserted into agency_applications (i.e. when an agency submits the form).
--
-- Also adds a trigger for re-submissions (UPDATE where status goes back to
-- 'pending') so the agency gets a receipt when they resubmit after rejection.
--
-- Prerequisites: same as welcome_email_trigger.sql
--   • pg_net extension enabled
--   • app.supabase_functions_url and app.service_role_key configured
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_agency_application_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _functions_url TEXT;
  _service_key   TEXT;
BEGIN
  BEGIN
    _functions_url := current_setting('app.supabase_functions_url');
    _service_key   := current_setting('app.service_role_key');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'agency_application_email_trigger: app settings not configured, skipping';
    RETURN NEW;
  END;

  PERFORM net.http_post(
    url     := _functions_url || '/send-agency-application-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body    := jsonb_build_object(
      'agency_name', NEW.company_name,
      'owner_name',  COALESCE(NEW.owner_name, NEW.company_name),
      'email',       NEW.email
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- Fire on first insert
DROP TRIGGER IF EXISTS on_agency_application_insert ON public.agency_applications;
CREATE TRIGGER on_agency_application_insert
  AFTER INSERT ON public.agency_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_agency_application_email();

-- Fire on re-submission (status set back to pending after rejection)
DROP TRIGGER IF EXISTS on_agency_application_resubmit ON public.agency_applications;
CREATE TRIGGER on_agency_application_resubmit
  AFTER UPDATE OF status ON public.agency_applications
  FOR EACH ROW
  WHEN (OLD.status = 'rejected' AND NEW.status = 'pending')
  EXECUTE FUNCTION public.trigger_agency_application_email();
