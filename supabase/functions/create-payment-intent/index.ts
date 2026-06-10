import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { assertPaymentsEnabled, getCommissionRate, logError } from "../_shared/guards.ts";

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

  try {
    // Kill-switch: block if payments disabled or maintenance mode is on
    const gate = await assertPaymentsEnabled();
    if (!gate.ok) {
      return json({ error: gate.error }, gate.status);
    }

    const {
      listing_id,
      traveler_id,
      trip_date,
      guests,
      traveler_name,
      traveler_email,
      traveler_phone,
      special_requests,
      availability_id,
    } = await req.json();

    if (!listing_id || !traveler_id || !trip_date || !guests) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Fetch the listing from DB — never trust client-supplied amounts.
    const { data: listing, error: listingErr } = await supabaseAdmin
      .from("listings")
      .select("price, max_participants, status, agency_id")
      .eq("id", listing_id)
      .single();

    if (listingErr || !listing || listing.status !== "published") {
      return json({ error: "This activity is not available for booking." }, 400);
    }

    if (Number(guests) < 1 || Number(guests) > listing.max_participants) {
      return json({ error: `Group size must be between 1 and ${listing.max_participants}.` }, 400);
    }

    // Atomically claim the spots in a single UPDATE ... WHERE spots_remaining >= n.
    // This closes the race where two simultaneous requests both pass a SELECT-based
    // check and oversell the last spot — the row lock makes "check and decrement"
    // indivisible. If anything fails further down, the claim is released below.
    let claimedAvailabilityId: string | null = null;
    if (availability_id) {
      const { error: claimError } = await supabaseAdmin.rpc("claim_availability_spots", {
        p_availability_id: availability_id,
        p_guests: guests,
      });
      if (claimError) {
        if (claimError.message?.includes("INSUFFICIENT_SPOTS")) {
          return json({ error: "Not enough spots remaining for this date." }, 400);
        }
        logError("create-payment-intent: claim spots", claimError);
        return json({ error: "This date is no longer available. Please pick another." }, 400);
      }
      claimedAvailabilityId = availability_id;
    }

    const releaseClaimedSpots = async () => {
      if (claimedAvailabilityId) {
        await supabaseAdmin.rpc("release_availability_spots", {
          p_availability_id: claimedAvailabilityId,
          p_guests: guests,
        });
      }
    };

    const pricePerPerson = Number(listing.price);
    const computedTotal  = Math.round(pricePerPerson * Number(guests) * 100) / 100;
    const commissionRate = await getCommissionRate(); // single source of truth
    const commissionAmt  = Math.round(computedTotal * commissionRate) / 100;
    const netPayout      = Math.round((computedTotal - commissionAmt) * 100) / 100;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

    const amountInCents = Math.round(computedTotal * 100);
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency: "usd",
          metadata: {
            listing_id,
            agency_id: listing.agency_id,
            traveler_id,
            trip_date,
            guests: String(guests),
          },
        },
        { idempotencyKey: `pi_${traveler_id}_${listing_id}_${trip_date}_${guests}_${amountInCents}` }
      );
    } catch (stripeErr) {
      await releaseClaimedSpots();
      throw stripeErr;
    }

    const { data: booking, error: dbError } = await supabaseAdmin
      .from("bookings")
      .insert({
        listing_id,
        agency_id: listing.agency_id,
        traveler_id,
        trip_date,
        guests,
        price_per_person: pricePerPerson,
        total_amount: computedTotal,
        commission_rate: commissionRate,
        commission_amount: commissionAmt,
        net_payout: netPayout,
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
      await releaseClaimedSpots();
      return json({ error: dbError.message }, 500);
    }

    return json({
      clientSecret: paymentIntent.client_secret,
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
    });
  } catch (err) {
    logError("create-payment-intent", err);
    return json({ error: (err as Error).message }, 500);
  }
});
