import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    } = await req.json();

    // Validate required fields
    if (!listing_id || !agency_id || !traveler_id || !trip_date || !guests || !price_per_person || !total_amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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
