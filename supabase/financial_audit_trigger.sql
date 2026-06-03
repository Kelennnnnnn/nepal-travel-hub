-- Automatic, tamper-resistant logging of financial status changes.
-- Captures old + new values without relying on app code to remember.

CREATE OR REPLACE FUNCTION public.audit_financial_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (
        OLD.status IS DISTINCT FROM NEW.status OR
        OLD.payment_status IS DISTINCT FROM NEW.payment_status)) THEN
    INSERT INTO public.audit_log (admin_user_id, action, entity_type, entity_id, details)
    VALUES (
      NULL,
      'financial_status_change',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'old_status',        OLD.status,
        'new_status',        NEW.status,
        'old_payment_status',OLD.payment_status,
        'new_payment_status',NEW.payment_status,
        'amount',            COALESCE(NEW.total_amount, 0),
        'changed_at',        now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bookings ON public.bookings;
CREATE TRIGGER trg_audit_bookings
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();

-- Payouts trigger — only created if the payouts table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payouts') THEN
    DROP TRIGGER IF EXISTS trg_audit_payouts ON public.payouts;
    CREATE TRIGGER trg_audit_payouts
      AFTER UPDATE ON public.payouts
      FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();
  END IF;
END;
$$;
