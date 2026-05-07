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

  // Agency role only
  const role = caller.user_metadata?.role as string | undefined;
  if (role !== "agency") return json({ error: "Agency access required" }, 403);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    // Check if agency already has a Stripe account
    const { data: appRow } = await supabaseAdmin
      .from("agency_applications")
      .select("stripe_account_id, email, company_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    let stripeAccountId = appRow?.stripe_account_id ?? "";

    // Create Express account if not yet created
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US", // use "NP" once Nepal is supported in production
        email: appRow?.email ?? caller.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        business_type: "company",
        company: { name: appRow?.company_name ?? undefined },
      });

      stripeAccountId = account.id;

      await supabaseAdmin
        .from("agency_applications")
        .update({ stripe_account_id: stripeAccountId })
        .eq("user_id", caller.id);
    }

    // Determine origin for redirect URLs
    const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "http://localhost:5173";

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/agency/settings?stripe=refresh`,
      return_url: `${origin}/agency/settings?stripe=success`,
      type: "account_onboarding",
    });

    return json({ url: accountLink.url, accountId: stripeAccountId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-connect-onboard error:", msg);
    return json({ error: msg }, 500);
  }
});
