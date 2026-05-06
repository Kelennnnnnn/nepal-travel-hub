import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
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

    if (!listing_id || !agency_id || !traveler_id || !trip_date || !guests || !price_per_person || !total_amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

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
        availability_id: availability_id || null,
      })
      .select("id, booking_ref")
      .single();

    if (dbError) {
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
