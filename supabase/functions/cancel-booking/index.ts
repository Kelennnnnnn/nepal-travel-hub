import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, data);
    if (!valid) return null;
    return JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // JWT verification — traveler (user) or admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  const userRole = (payload as { user_metadata?: { role?: string } }).user_metadata?.role;
  if (!userRole) {
    return json({ error: "Authentication required" }, 401);
  }

  try {
    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "booking_id is required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch the booking
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, payment_intent_id, total_amount, trip_date, status, payment_status, traveler_id")
      .eq("id", booking_id)
      .single();

    if (error || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    // Verify ownership
    const userId = payload.sub as string;
    if (userRole !== "admin" && booking.traveler_id !== userId) {
      return json({ error: "Not authorized" }, 403);
    }

    if (booking.status === "cancelled") {
      return json({ error: "Booking is already cancelled" }, 400);
    }

    // Calculate refund based on days until trip
    const tripDate = new Date(booking.trip_date);
    const now = new Date();
    const daysUntilTrip = Math.floor((tripDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let refundPercentage = 0;
    if (daysUntilTrip >= 7) {
      refundPercentage = 100;
    } else if (daysUntilTrip >= 3) {
      refundPercentage = 50;
    }

    const refundAmountCents = Math.round(booking.total_amount * refundPercentage * 100);

    if (refundAmountCents === 0 || booking.payment_status !== "paid") {
      // No refund — just cancel
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          cancellation_reason: `Cancelled by traveler (no refund — less than 3 days notice)`,
        })
        .eq("id", booking_id);

      return json({ success: true, refundAmount: 0, message: "Booking cancelled. No refund applicable." });
    }

    // Process Stripe refund
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

    const refund = await stripe.refunds.create({
      payment_intent: booking.payment_intent_id,
      amount: refundAmountCents,
    });

    // Update booking immediately (webhook will also fire for charge.refunded)
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
      refundAmount: booking.total_amount * refundPercentage,
      refundPercentage,
      stripeRefundId: refund.id,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
