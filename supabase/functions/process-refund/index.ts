import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

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
      .select("id, payment_intent_id, total_amount, trip_date, status, payment_status, traveler_id")
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

    if (booking.status !== "confirmed") {
      return json({ error: "Only confirmed bookings can be cancelled" }, 400);
    }

    const daysUntilTrip = Math.floor(
      (new Date(booking.trip_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilTrip < 0) {
      return json({ error: "Past trips cannot be cancelled" }, 400);
    }

    let refundPercentage = 0;
    if (daysUntilTrip >= 7) refundPercentage = 100;
    else if (daysUntilTrip >= 3) refundPercentage = 50;

    const refundAmountDollars = booking.total_amount * refundPercentage / 100;
    const refundAmountCents = Math.round(refundAmountDollars * 100);

    if (refundAmountCents === 0 || booking.payment_status !== "paid") {
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Cancelled by traveler (no refund)",
        })
        .eq("id", booking_id);

      return json({ success: true, refundAmount: 0, refundPercentage, message: "Booking cancelled. No refund applicable." });
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
