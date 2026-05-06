import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { agencyApprovedEmail, agencyRejectedEmail } from "../_shared/emailTemplates.ts";

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

  // Validate token and check admin role
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (caller.user_metadata?.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Admin access required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { user_id, action, reason = "" } = await req.json();

    if (!user_id || !action) {
      return new Response(
        JSON.stringify({ error: "user_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return new Response(
        JSON.stringify({ error: 'action must be "approve" or "reject"' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newRole = action === "approve" ? "agency" : "user";

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: { role: newRole },
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send approval / rejection email
    const { data: agency } = await supabaseAdmin
      .from("agency_applications")
      .select("company_name, email")
      .eq("user_id", user_id)
      .maybeSingle();

    if (agency?.email) {
      if (action === "approve") {
        const { subject, html } = agencyApprovedEmail({
          agencyName: agency.company_name ?? "Agency",
        });
        await sendEmail({ to: agency.email, subject, html });
      } else {
        const { subject, html } = agencyRejectedEmail({
          agencyName: agency.company_name ?? "Agency",
          reason: reason || "Your application did not meet our current requirements.",
        });
        await sendEmail({ to: agency.email, subject, html });
      }
    }

    return new Response(
      JSON.stringify({ success: true, role: newRole }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
