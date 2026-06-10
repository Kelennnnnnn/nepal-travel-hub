/**
 * send-welcome-email
 *
 * Called by a Postgres trigger (via pg_net) whenever a user's
 * email_confirmed_at transitions from NULL → a timestamp, i.e.
 * exactly once after the user verifies their signup link.
 *
 * It can also be called manually from the frontend after an auth
 * state change to EMAIL_CONFIRMED if pg_net is unavailable.
 *
 * Security model:
 *  - Accepts Bearer tokens that are either the SUPABASE_SERVICE_ROLE_KEY
 *    (from the DB trigger) OR a valid user JWT for the same user_id.
 *  - If called with a user JWT, validates that the JWT's sub matches
 *    the requested user_id to prevent IDOR.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { welcomeEmail } from "../_shared/emailTemplates.ts";

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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Allow both the service-role key (from DB trigger) and a valid user JWT.
  // We distinguish by trying getUser() first; if that fails, the caller must
  // be the service role whose token is validated by matching env.
  let requestedUserId: string;
  let callerIsServiceRole = false;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token === serviceRoleKey) {
    callerIsServiceRole = true;
    // parse user_id from body below
  } else {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);
    requestedUserId = user.id;
  }

  let body: { user_id?: string; email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (callerIsServiceRole) {
    if (!body.user_id) return json({ error: "user_id required" }, 400);
    requestedUserId = body.user_id;
  } else {
    // JWT caller: must match their own user_id (prevents IDOR)
    if (body.user_id && body.user_id !== requestedUserId!) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  // Fetch user details from auth.users via admin client
  const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(requestedUserId!);
  if (userErr || !authUser.user) return json({ error: "User not found" }, 404);

  const user = authUser.user;
  const email = user.email;
  if (!email) return json({ error: "User has no email address" }, 400);

  // Idempotency: check if we already sent this welcome email
  const { data: alreadySent } = await supabaseAdmin
    .from("webhook_events")
    .select("id")
    .eq("event_type", "welcome_email_sent")
    .eq("payload->user_id", requestedUserId!)
    .maybeSingle();

  if (alreadySent) {
    // Already sent — return 200 so the trigger doesn't retry
    return json({ success: true, skipped: true });
  }

  const name = (user.user_metadata?.name as string) ?? email.split("@")[0];
  const { subject, html, text } = welcomeEmail({ name });

  const { error: emailErr } = await sendEmail({
    to: email,
    subject,
    html,
    text,
    tags: [{ name: "type", value: "welcome" }],
  });

  if (emailErr) {
    console.error("send-welcome-email: failed to send", emailErr);
    return json({ error: emailErr }, 500);
  }

  // Record delivery so we never send twice
  await supabaseAdmin.from("webhook_events").insert({
    event_type: "welcome_email_sent",
    payload: { user_id: requestedUserId, email },
    status: "processed",
  });

  return json({ success: true });
});
