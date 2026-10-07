import { supabase } from "@/lib/supabase";
import { invokeEdge } from "@/lib/edge";
import type { Json } from "../../../supabase/schema.types";

/**
 * Typed wrappers for the booking state-transition RPCs (audit H2) and the
 * flexible-date hold/quote/booking-creation RPCs (Phase 20).
 *
 * bookings has no client-writable UPDATE policy at all anymore — every
 * state change goes through one of these SECURITY DEFINER functions, which
 * re-derive ownership/privilege from live tables server-side rather than
 * trusting anything the client sends.
 */

export interface PrimaryGuestInput {
  full_name: string;
  contact_email: string;
  contact_phone: string;
}

export interface BookingHold {
  booking_id: string;
  booking_ref: string;
  hold_expires_at: string;
  product_value: number;
  platform_fee: number;
  agency_balance: number;
  amount_due_now: number;
  currency: string;
  confirmation_mode: string;
  payment_requirement: string;
}

/** Error codes create_booking_hold() can raise, for mapping to UI copy. */
export type BookingHoldErrorCode =
  | "NOT_AUTHENTICATED"
  | "ROLE_CANNOT_BOOK"
  | "INVALID_GUEST"
  | "LISTING_NOT_FOUND"
  | "DATE_NOT_BOOKABLE"
  | "ALREADY_BOOKED"
  | "TOO_MANY_HOLDS";

/**
 * One transaction: validates the date is genuinely open, reserves
 * capacity, freezes a price snapshot, and creates the booking at
 * pending_payment. Never calls a payment provider. Throws a PostgrestError
 * whose `message` is one of BookingHoldErrorCode (and whose `details`
 * carries the get_bookable_dates status for DATE_NOT_BOOKABLE).
 */
export async function createBookingHold(
  listingId: string,
  date: string,
  pax: number,
  primaryGuest: PrimaryGuestInput
): Promise<BookingHold> {
  const { data, error } = await supabase.rpc("create_booking_hold", {
    p_listing_id: listingId,
    p_date: date,
    p_pax: pax,
    p_primary_guest: primaryGuest as unknown as Json,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("create_booking_hold returned no row");
  return row as BookingHold;
}

/** The traveler abandons checkout before paying. Only their own booking, only from pending_payment. */
export async function releaseBookingHold(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("release_booking_hold", { p_booking_id: bookingId });
  if (error) throw error;
}

export interface BookingHoldStatus {
  booking_status: string;
  hold_expires_at: string;
  seconds_remaining: number;
  product_value: number;
  platform_fee: number;
  agency_balance: number;
  amount_due_now: number;
  currency: string;
}

/** Server-computed countdown + amounts, for the checkout page's poll. Own bookings only. */
export async function getBookingHoldStatus(bookingId: string): Promise<BookingHoldStatus> {
  const { data, error } = await supabase.rpc("get_booking_hold_status", { p_booking_id: bookingId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("get_booking_hold_status returned no row");
  return row as BookingHoldStatus;
}

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

// ── Phase 21: post-payment flow ─────────────────────────────────────────

/**
 * Manager+ of the booking's agency only; staff may view but calling this
 * throws INSUFFICIENT_PRIVILEGE. Declining requires a 10-500 character
 * reason. Must be before agency_confirm_deadline (DEADLINE_PASSED otherwise).
 */
export async function agencyRespondToBooking(bookingId: string, accept: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("agency_respond_to_booking", {
    p_booking_id: bookingId,
    p_accept: accept,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export interface AlternativeListing {
  listing_id: string;
  title: string;
  agency_id: string;
  agency_name: string;
  base_price: number;
  rating: number;
  review_count: number;
  images: string[];
}

/** Up to 5 similar, genuinely-bookable listings from other agencies. Own bookings only. Nothing is auto-booked. */
export async function suggestAlternatives(bookingId: string): Promise<AlternativeListing[]> {
  const { data, error } = await supabase.rpc("suggest_alternatives", { p_booking_id: bookingId });
  if (error) throw error;
  return (data ?? []) as unknown as AlternativeListing[];
}

export interface TokenBookingSummary {
  activity_title: string;
  departure_date: string;
  participant_count: number;
  agency_confirm_deadline: string;
  traveler_first_name: string;
}

/** The /r/:token page's only data source. Works without login — the token is the credential. */
export async function bookingSummaryForToken(token: string): Promise<TokenBookingSummary> {
  const { data, error } = await supabase.rpc("booking_summary_for_token", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("booking_summary_for_token returned no row");
  return row as TokenBookingSummary;
}

/**
 * Accept/decline via the booking-token-response edge function (not a
 * direct RPC call) — the function adds an IP rate limit (20/hour) on top
 * of respond_via_token() itself, same reasoning as every other anon-
 * reachable action in this codebase going through a thin edge-function
 * wrapper rather than a bare RPC call from the browser.
 */
export async function respondToBookingViaToken(token: string, accept: boolean, reason?: string): Promise<void> {
  const { error } = await invokeEdge("booking-token-response", {
    body: { token, accept, reason },
  });
  if (error) throw new Error(error.message);
}

// ── Phase 22: cancellation / no-show / dispute lifecycle ───────────────────

export interface CancellationPreview {
  fee_refund_percent: number;
  balance_refund_percent: number;
  free_until: string;
  explanation: string;
}

/** The "you'll get back NPR X" preview, computed server-side from the quote's frozen snapshot. Own booking only. */
export async function computeTravelerCancellation(bookingId: string): Promise<CancellationPreview> {
  const { data, error } = await supabase.rpc("compute_traveler_cancellation", { p_booking_id: bookingId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("compute_traveler_cancellation returned no row");
  return row as CancellationPreview;
}

/** Actually cancels, applying compute_traveler_cancellation's math. Own booking, confirmed/awaiting_agency_confirmation, before start_at only. */
export async function travelerCancelBooking(bookingId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("traveler_cancel_booking", { p_booking_id: bookingId, p_reason: reason ?? null });
  if (error) throw error;
}

/** Plain-language cancellation/no-show policy sentences for an existing booking, from its quote snapshot. */
export async function bookingPolicySummary(bookingId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("booking_policy_summary", { p_booking_id: bookingId });
  if (error) throw error;
  return (data ?? []) as string[];
}

/** Same policy text, computed from the CURRENT listing config for a not-yet-booked date — shown on checkout before a hold exists. No login required. */
export async function listingPolicyPreview(listingId: string, date: string, pax?: number): Promise<string[]> {
  const { data, error } = await supabase.rpc("listing_policy_preview", { p_listing_id: listingId, p_date: date, p_pax: pax ?? null });
  if (error) throw error;
  return (data ?? []) as string[];
}

/** Resolves an open weather/flight/safety disruption by moving to a new open date at the same price. Own booking only. */
export async function travelerReschedule(bookingId: string, newDate: string): Promise<void> {
  const { error } = await supabase.rpc("traveler_reschedule", { p_booking_id: bookingId, p_new_date: newDate });
  if (error) throw error;
}

/** Resolves an open disruption with a full refund instead of rescheduling. Own booking only. */
export async function travelerChooseRefund(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("traveler_choose_refund", { p_booking_id: bookingId });
  if (error) throw error;
}

/** Disputes being marked a no-show. Own booking, status=no_show, before the 48h deadline only. */
export async function travelerDisputeNoShow(bookingId: string, statement: string): Promise<void> {
  const { error } = await supabase.rpc("traveler_dispute_no_show", { p_booking_id: bookingId, p_statement: statement });
  if (error) throw error;
}

/** Reports the AGENCY never showed up. Own booking, confirmed/in_progress, between start+grace and end+48h only. */
export async function travelerReportAgencyNoShow(bookingId: string, statement: string): Promise<void> {
  const { error } = await supabase.rpc("traveler_report_agency_no_show", { p_booking_id: bookingId, p_statement: statement });
  if (error) throw error;
}

export type AgencyCancelReasonCode = "agency_unavailable" | "conditions_weather" | "conditions_flight" | "conditions_safety" | "traveler_request";

/** Manager+ only, only from confirmed. conditions_* opens a disruption instead of cancelling outright. */
export async function agencyCancelBooking(bookingId: string, reasonCode: AgencyCancelReasonCode, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("agency_cancel_booking", { p_booking_id: bookingId, p_reason_code: reasonCode, p_reason: reason ?? null });
  if (error) throw error;
}

/** Manager+ only, only within the grace-to-end+24h window. Creates no refund records at all. */
export async function agencyMarkNoShow(bookingId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("agency_mark_no_show", { p_booking_id: bookingId, p_note: note ?? null });
  if (error) throw error;
}

export interface OpenDisruption {
  id: string;
  booking_id: string;
  reason_code: string;
  note: string | null;
  choice_deadline: string;
}

/** The traveler's own open (unresolved) disruption for a booking, if any. */
export async function getOpenDisruption(bookingId: string): Promise<OpenDisruption | null> {
  const { data, error } = await supabase
    .from("booking_disruptions")
    .select("id, booking_id, reason_code, note, choice_deadline")
    .eq("booking_id", bookingId)
    .is("resolved_at", null)
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as OpenDisruption | null) ?? null;
}
