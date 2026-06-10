-- Fixes two related findings:
--   1. Race condition: create-payment-intent only SELECTs spots_remaining
--      before charging, so two simultaneous bookings can both pass the
--      check and oversell the same slot.
--   2. spots_remaining is never decremented on booking, and never restored
--      on cancellation/refund — availability drifts from reality over time.
--
-- Fix: an atomic claim function (UPDATE ... WHERE spots_remaining >= n,
-- so the row lock + check + write happen as one statement — no two callers
-- can both succeed for the last spot), plus a trigger that restores spots
-- whenever a booking transitions into "cancelled" from any other status,
-- regardless of whether that came from the traveler, an admin, a refund,
-- or the stale-booking reaper.

-- 1. Atomic "claim N spots" — call via RPC from create-payment-intent
--    BEFORE creating the Stripe PaymentIntent. Raises if unavailable, so
--    the edge function can return a clean 400 without ever charging the card.
CREATE OR REPLACE FUNCTION public.claim_availability_spots(p_availability_id UUID, p_guests INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE public.availability
  SET    spots_remaining = spots_remaining - p_guests
  WHERE  id = p_availability_id
    AND  blocked = false
    AND  spots_remaining >= p_guests
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_SPOTS' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- 2. Counterpart used to give spots back if the claim succeeded but the
--    booking could not be completed (Stripe error, DB insert failure, etc).
CREATE OR REPLACE FUNCTION public.release_availability_spots(p_availability_id UUID, p_guests INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.availability
  SET    spots_remaining = LEAST(spots_remaining + p_guests, spots_total)
  WHERE  id = p_availability_id;
END;
$$;

-- 3. Trigger: whenever a booking moves INTO "cancelled" from some other
--    status, restore its spots. Covers traveler cancellations, admin
--    cancellations, refunds, and the stale-booking reaper uniformly —
--    none of those code paths need to remember to restore spots themselves.
CREATE OR REPLACE FUNCTION public.restore_availability_on_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.availability_id IS NOT NULL THEN
    UPDATE public.availability
    SET    spots_remaining = LEAST(spots_remaining + NEW.guests, spots_total)
    WHERE  id = NEW.availability_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_availability_on_cancel ON public.bookings;
CREATE TRIGGER trg_restore_availability_on_cancel
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.restore_availability_on_cancel();
