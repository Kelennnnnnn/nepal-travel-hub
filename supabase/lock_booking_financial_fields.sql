-- Pen-test finding: "agencies_update_own_bookings" WITH CHECK validates only
-- `status`. payment_status, total_amount, commission_amount, net_payout,
-- price_per_person, payment_intent_id, traveler_id, agency_id, and listing_id
-- are completely unguarded, and no trigger locks them — an agency can PATCH
-- their own booking to e.g. {payment_status: "paid", net_payout: 50000} and
-- process-payout will later wire that fabricated amount via Stripe Transfer.
--
-- Fix: a BEFORE UPDATE trigger (mirroring the enforce_default_role pattern)
-- that re-pins every financial/identity column to its previous value unless
-- the caller is the service-role (edge functions: create-payment-intent,
-- stripe-webhook, process-payout, cancel-booking, process-refund,
-- reap-stale-bookings, ...) or an admin. `status` is intentionally left
-- alone — agencies are still allowed to transition it per the existing
-- WITH CHECK (confirmed/completed/cancelled).

CREATE OR REPLACE FUNCTION public.lock_booking_financial_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;

  NEW.payment_status    := OLD.payment_status;
  NEW.total_amount      := OLD.total_amount;
  NEW.commission_rate   := OLD.commission_rate;
  NEW.commission_amount := OLD.commission_amount;
  NEW.net_payout        := OLD.net_payout;
  NEW.price_per_person  := OLD.price_per_person;
  NEW.payment_intent_id := OLD.payment_intent_id;
  NEW.traveler_id       := OLD.traveler_id;
  NEW.agency_id         := OLD.agency_id;
  NEW.listing_id        := OLD.listing_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_booking_financial_fields ON public.bookings;
CREATE TRIGGER trg_lock_booking_financial_fields
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.lock_booking_financial_fields();
