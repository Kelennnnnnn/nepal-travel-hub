import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { sendEmail } from "../_shared/email.ts";
import {
  bookingCancellationEmail,
  bookingCancelledAgencyEmail,
} from "../_shared/emailTemplates.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  const userRole = caller.user_metadata?.role as string | undefined;

  try {
    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "booking_id is required" }, 400);
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        id,
        payment_intent_id,
        total_amount,
        trip_date,
        status,
        payment_status,
        traveler_id,
        traveler_name,
        traveler_email,
        booking_ref,
        listings (
          title,
          agency_id
        )
      `)
      .eq("id", booking_id)
      .single();

    if (error || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    if (userRole !== "admin" && booking.traveler_id !== caller.id) {
      return json({ error: "Not authorized" }, 403);
    }

    if (booking.status === "cancelled") {
      return json({ error: "Booking is already cancelled" }, 400);
    }

    const daysUntilTrip = Math.floor(
      (new Date(booking.trip_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    let refundPercentage = 0;
    if (daysUntilTrip >= 7) refundPercentage = 100;
    else if (daysUntilTrip >= 3) refundPercentage = 50;

    const refundAmountDollars = booking.total_amount * refundPercentage / 100;
    const refundAmountCents = Math.round(refundAmountDollars * 100);

    const listingData = booking.listings as { title: string; agency_id: string } | null;
    const activityTitle = listingData?.title ?? "Activity";
    const agencyId = listingData?.agency_id ?? null;
    const bookingRef = booking.booking_ref ?? `YN-${booking.id.slice(0, 8).toUpperCase()}`;

    if (refundAmountCents === 0 || booking.payment_status !== "paid") {
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Cancelled by traveler (no refund — less than 3 days notice)",
        })
        .eq("id", booking_id);

      await sendCancellationEmails({
        supabaseAdmin,
        booking: { ...booking, booking_ref: bookingRef },
        activityTitle,
        agencyId,
        refundAmount: 0,
        refundPercentage: 0,
      });

      return json({ success: true, refundAmount: 0, message: "Booking cancelled. No refund applicable." });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

    const refund = await stripe.refunds.create(
      { payment_intent: booking.payment_intent_id, amount: refundAmountCents },
      { idempotencyKey: `refund_${booking.id}` }
    );

    await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        payment_status: refundPercentage === 100 ? "refunded" : "paid",
        cancellation_reason: `Cancelled by traveler (${refundPercentage}% refund)`,
      })
      .eq("id", booking_id);

    await sendCancellationEmails({
      supabaseAdmin,
      booking: { ...booking, booking_ref: bookingRef },
      activityTitle,
      agencyId,
      refundAmount: refundAmountDollars,
      refundPercentage,
    });

    return json({
      success: true,
      refundAmount: refundAmountDollars,
      refundPercentage,
      stripeRefundId: refund.id,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

async function sendCancellationEmails(opts: {
  supabaseAdmin: ReturnType<typeof createClient>;
  booking: {
    traveler_name: string | null;
    traveler_email: string | null;
    booking_ref: string;
  };
  activityTitle: string;
  agencyId: string | null;
  refundAmount: number;
  refundPercentage: number;
}) {
  const { supabaseAdmin, booking, activityTitle, agencyId, refundAmount, refundPercentage } = opts;

  // Always email the traveler
  if (booking.traveler_email) {
    const { subject, html } = bookingCancellationEmail({
      travelerName: booking.traveler_name ?? "Traveler",
      bookingRef: booking.booking_ref,
      activityTitle,
      reason: refundPercentage > 0
        ? `${refundPercentage}% refund ($${refundAmount.toFixed(2)}) will be processed within 5–10 business days.`
        : "No refund applicable (less than 3 days notice).",
    });
    await sendEmail({ to: booking.traveler_email, subject, html });
  }

  // Email agency if they have booking_cancel notifications enabled
  if (agencyId) {
    const [agencyResult, prefsResult] = await Promise.all([
      supabaseAdmin
        .from("agency_applications")
        .select("company_name, email")
        .eq("user_id", agencyId)
        .maybeSingle(),
      supabaseAdmin
        .from("notification_preferences")
        .select("booking_cancel")
        .eq("user_id", agencyId)
        .maybeSingle(),
    ]);

    const agency = agencyResult.data;
    const prefs = prefsResult.data;

    if (agency?.email && prefs?.booking_cancel !== false) {
      const { subject, html } = bookingCancelledAgencyEmail({
        agencyName: agency.company_name ?? "Agency",
        bookingRef: booking.booking_ref,
        activityTitle,
        travelerName: booking.traveler_name ?? "A traveler",
        refundAmount,
        refundPercentage,
      });
      await sendEmail({ to: agency.email, subject, html });
    }
  }
}
