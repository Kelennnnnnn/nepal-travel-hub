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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // JWT verification — any authenticated user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.slice(7);
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const role = (payload as { user_metadata?: { role?: string } }).user_metadata?.role;
  if (!role) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const {
      listing_id,
      agency_id,
      traveler_id,
      trip_date,
      guests,
      price_per_person,
      total_amount,
      traveler_name,
      traveler_email,
      traveler_phone,
      special_requests,
      availability_id,
    } = await req.json();

    // Validate required fields
    if (!listing_id || !agency_id || !traveler_id || !trip_date || !guests || !price_per_person || !total_amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase admin early (needed for availability check)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Server-side availability check
    if (availability_id) {
      const { data: slot, error: slotError } = await supabaseAdmin
        .from("availability")
        .select("spots_remaining, blocked")
        .eq("id", availability_id)
        .single();

      if (slotError || !slot) {
        return new Response(
          JSON.stringify({ error: "Availability slot not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (slot.blocked) {
        return new Response(
          JSON.stringify({ error: "This date is blocked and unavailable" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (slot.spots_remaining < guests) {
        return new Response(
          JSON.stringify({ error: `Only ${slot.spots_remaining} spots available` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

    // Create Stripe PaymentIntent (amount in cents)
    const amountInCents = Math.round(total_amount * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      metadata: {
        listing_id,
        agency_id,
        traveler_id,
        trip_date,
        guests: String(guests),
      },
    });

    // Insert booking record with status 'pending_payment'
    const { data: booking, error: dbError } = await supabaseAdmin
      .from("bookings")
      .insert({
        listing_id,
        agency_id,
        traveler_id,
        trip_date,
        guests,
        price_per_person,
        total_amount,
        commission_rate: 15.00,
        status: "pending_payment",
        payment_status: "unpaid",
        payment_intent_id: paymentIntent.id,
        traveler_name: traveler_name || null,
        traveler_email: traveler_email || null,
        traveler_phone: traveler_phone || null,
        special_requests: special_requests || "",
      })
      .select("id, booking_ref")
      .single();

    if (dbError) {
      // Cancel the payment intent if DB insert fails
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        bookingId: booking.id,
        bookingRef: booking.booking_ref,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
