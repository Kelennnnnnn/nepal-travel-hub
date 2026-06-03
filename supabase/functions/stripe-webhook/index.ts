import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { sendEmail } from "../_shared/email.ts";
import {
  bookingConfirmationEmail,
  newBookingAgencyEmail,
} from "../_shared/emailTemplates.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
});
const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Idempotency: skip if we've already processed this event.
  const { data: seen } = await supabaseAdmin
    .from("webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (seen) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;

      // Guard: only transition once (unpaid → paid)
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed", payment_status: "paid" })
        .eq("payment_intent_id", pi.id)
        .eq("payment_status", "unpaid")
        .select(`
          id,
          booking_date,
          participants,
          total_amount,
          traveler_name,
          traveler_email,
          listings (
            title,
            agency_id
          )
        `)
        .maybeSingle();

      if (!booking) break; // already confirmed — do not resend emails

      const activityTitle = (booking.listings as { title: string } | null)?.title ?? "Activity";
      const agencyId = (booking.listings as { agency_id: string } | null)?.agency_id;
      const bookingRef = `YN-${booking.id.slice(0, 8).toUpperCase()}`;

      let agencyName = "Your Agency";
      let agencyEmail: string | null = null;
      if (agencyId) {
        const { data: agency } = await supabaseAdmin
          .from("agency_applications")
          .select("company_name, email")
          .eq("user_id", agencyId)
          .maybeSingle();
        agencyName = agency?.company_name ?? agencyName;
        agencyEmail = agency?.email ?? null;
      }

      if (booking.traveler_email) {
        const { subject, html } = bookingConfirmationEmail({
          travelerName: booking.traveler_name ?? "Traveler",
          bookingRef,
          activityTitle,
          tripDate: booking.booking_date,
          guests: booking.participants,
          totalAmount: booking.total_amount,
          agencyName,
        });
        await sendEmail({ to: booking.traveler_email, subject, html });
      }

      if (agencyId && agencyEmail) {
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("new_booking")
          .eq("user_id", agencyId)
          .maybeSingle();

        if (prefs?.new_booking !== false) {
          const netPayout = booking.total_amount * 0.9;
          const { subject, html } = newBookingAgencyEmail({
            agencyName,
            bookingRef,
            activityTitle,
            travelerName: booking.traveler_name ?? "A traveler",
            tripDate: booking.booking_date,
            guests: booking.participants,
            totalAmount: booking.total_amount,
            netPayout,
          });
          await sendEmail({ to: agencyEmail, subject, html });
        }
      }

      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const { error } = await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          payment_status: "unpaid",
          cancellation_reason: "Payment failed",
        })
        .eq("payment_intent_id", paymentIntent.id);

      if (error) {
        console.error("Failed to update failed booking:", error.message);
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;

      if (paymentIntentId) {
        const { error } = await supabaseAdmin
          .from("bookings")
          .update({
            payment_status: "refunded",
            status: "cancelled",
          })
          .eq("payment_intent_id", paymentIntentId);

        if (error) {
          console.error("Failed to update refunded booking:", error.message);
        }
      }
      break;
    }
  }

  // Record the event so retries are no-ops
  await supabaseAdmin.from("webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
