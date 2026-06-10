import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { sendEmail } from "../_shared/email.ts";
import { payoutProcessedAgencyEmail } from "../_shared/emailTemplates.ts";
import { assertPayoutsEnabled, logError } from "../_shared/guards.ts";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) return json({ error: "Invalid or expired token" }, 401);

  // Admin only
  const role = caller.user_metadata?.role as string | undefined;
  if (role !== "admin") return json({ error: "Admin access required" }, 403);

  // Kill-switch: block if payouts are disabled
  const gate = await assertPayoutsEnabled();
  if (!gate.ok) return json({ error: gate.error }, gate.status);

  const body = await req.json() as { agency_user_id: string; period_start?: string; period_end?: string };
  const { agency_user_id, period_start, period_end } = body;

  if (!agency_user_id) return json({ error: "agency_user_id is required" }, 400);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    // Get agency's Stripe account ID and bank details reference
    const { data: agency } = await supabaseAdmin
      .from("agency_applications")
      .select("stripe_account_id, company_name, email")
      .eq("user_id", agency_user_id)
      .maybeSingle();

    if (!agency?.stripe_account_id) {
      return json({ error: "Agency has not connected a Stripe account" }, 400);
    }

    // Find confirmed + paid bookings not yet included in a payout
    const { data: existingPayouts } = await supabaseAdmin
      .from("payouts")
      .select("booking_ids")
      .eq("agency_user_id", agency_user_id)
      .in("status", ["pending", "processing", "completed"]);

    const alreadyPaidOutIds = new Set(
      (existingPayouts ?? []).flatMap(p => (p.booking_ids as string[]) ?? [])
    );

    const { data: eligibleBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, net_payout")
      .eq("agency_id", agency_user_id)
      .eq("status", "confirmed")
      .eq("payment_status", "paid");

    const unpaid = (eligibleBookings ?? []).filter(b => !alreadyPaidOutIds.has(b.id as string));

    if (unpaid.length === 0) {
      return json({ error: "No new eligible bookings to pay out" }, 400);
    }

    const totalCents = Math.round(
      unpaid.reduce((s: number, b) => s + Number(b.net_payout), 0) * 100
    );

    if (totalCents <= 0) return json({ error: "Payout amount is zero" }, 400);

    // Create a payout record first (status = processing)
    const { data: payoutRow, error: insertError } = await supabaseAdmin
      .from("payouts")
      .insert({
        agency_user_id,
        amount: totalCents / 100,
        status: "processing",
        booking_ids: unpaid.map(b => b.id),
        period_start: period_start ?? null,
        period_end: period_end ?? null,
      })
      .select()
      .single();

    if (insertError || !payoutRow) {
      return json({ error: insertError?.message ?? "Failed to create payout record" }, 500);
    }

    // Create Stripe Transfer — idempotency key prevents double-transfers on retry
    let transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: totalCents,
          currency: "usd",
          destination: agency.stripe_account_id,
          description: `Payout to ${agency.company_name ?? agency_user_id}`,
          metadata: {
            payout_id: payoutRow.id as string,
            agency_user_id,
            booking_count: String(unpaid.length),
          },
        },
        { idempotencyKey: `payout_${payoutRow.id}` }
      );
    } catch (err) {
      await supabaseAdmin.from("payouts").update({ status: "failed" }).eq("id", payoutRow.id);
      logError("process-payout transfer failed", err, { payout_id: payoutRow.id as string });
      return json({ error: "Payout transfer failed. The payout has been marked failed and can be retried." }, 502);
    }

    // Update payout record with transfer ID and mark completed
    await supabaseAdmin
      .from("payouts")
      .update({
        stripe_transfer_id: transfer.id,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", payoutRow.id);

    // Email agency if payout notifications are enabled
    if (agency.email) {
      const { data: prefs } = await supabaseAdmin
        .from("notification_preferences")
        .select("payout")
        .eq("user_id", agency_user_id)
        .maybeSingle();

      if (prefs?.payout !== false) {
        const { subject, html } = payoutProcessedAgencyEmail({
          agencyName: agency.company_name ?? "Agency",
          amount: totalCents / 100,
          bookingCount: unpaid.length,
          transferId: transfer.id,
        });
        await sendEmail({ to: agency.email, subject, html });
      }
    }

    return json({
      success: true,
      payout_id: payoutRow.id,
      transfer_id: transfer.id,
      amount: totalCents / 100,
      booking_count: unpaid.length,
    });
  } catch (err) {
    logError("process-payout", err);
    return json({ error: (err as Error).message }, 500);
  }
});
