import { supabase } from "@/lib/supabase";

/**
 * Typed wrappers for the booking state-transition RPCs (audit H2).
 *
 * bookings has no client-writable UPDATE policy at all anymore — every
 * state change goes through one of these two SECURITY DEFINER functions,
 * which re-derive ownership/privilege from live tables server-side rather
 * than trusting anything the client sends. No booking pages are wired up
 * to these yet (booking UI is still stubbed); this file exists so that
 * work doesn't reach for a direct .from("bookings").update(...) later.
 */

/**
 * Requests cancellation of the caller's own booking. Only valid from
 * booking_status='confirmed' (a pending_payment booking has nothing to
 * refund yet, so it fails NOT_CANCELLABLE). Moves the booking to
 * cancel_requested only — actual cancellation, inventory release, and any
 * refund are the payments phase's responsibility, not this call's.
 */
export async function requestBookingCancellation(bookingId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("request_booking_cancellation", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw error;
}

export type TripStatus = "in_progress" | "completed" | "no_show";

/**
 * Moves a booking through fulfillment (confirmed -> in_progress ->
 * completed, or -> no_show). Requires manager+ access to the booking's
 * agency; the existing booking_status transition trigger still enforces
 * the legal edges (e.g. confirmed -> completed directly is still
 * rejected — in_progress is not skippable).
 */
export async function agencySetTripStatus(bookingId: string, status: TripStatus): Promise<void> {
  const { error } = await supabase.rpc("agency_set_trip_status", {
    p_booking_id: bookingId,
    p_status: status,
  });
  if (error) throw error;
}
