/**
 * send-agency-application-email
 *
 * Called by a Postgres trigger (pg_net) when a new agency_applications row
 * is inserted or re-submitted. Sends the "Application Received" confirmation
 * email to the agency contact address.
 *
 * Only accepts requests from the service-role key (DB trigger).
 */

import { sendEmail } from "../_shared/email.ts";
import { agencyApplicationReceivedEmail } from "../_shared/emailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // This function is internal-only: caller must be the service role.
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== serviceKey) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { agency_name?: string; owner_name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { agency_name, owner_name, email } = body;
  if (!agency_name || !email) {
    return json({ error: "agency_name and email are required" }, 400);
  }

  const { subject, html, text } = agencyApplicationReceivedEmail({
    agencyName: agency_name,
    ownerName: owner_name ?? agency_name,
  });

  const { error: emailErr } = await sendEmail({
    to: email,
    subject,
    html,
    text,
    tags: [{ name: "type", value: "agency-application" }],
  });

  if (emailErr) {
    console.error("send-agency-application-email: failed to send", emailErr);
    return json({ error: emailErr }, 500);
  }

  return json({ success: true });
});
