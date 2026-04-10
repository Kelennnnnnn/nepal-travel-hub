import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // JWT verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  const userId = payload.sub as string;
  if (!userId) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Block deletion if upcoming confirmed bookings exist
    const today = new Date().toISOString().split("T")[0];
    const { data: upcomingBookings } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("traveler_id", userId)
      .eq("status", "confirmed")
      .gte("trip_date", today)
      .limit(1);

    if (upcomingBookings && upcomingBookings.length > 0) {
      return json(
        { error: "You have upcoming confirmed bookings. Please cancel them before deleting your account." },
        400
      );
    }

    // Delete reviews
    await supabaseAdmin
      .from("reviews")
      .delete()
      .eq("user_id", userId);

    // Cancel (archive) past bookings instead of hard-deleting
    await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: "Account deleted by user" })
      .eq("traveler_id", userId)
      .neq("status", "cancelled");

    // Delete avatar from storage
    const { data: avatarFiles } = await supabaseAdmin.storage
      .from("user-avatars")
      .list(userId);

    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map((f) => `${userId}/${f.name}`);
      await supabaseAdmin.storage.from("user-avatars").remove(paths);
    }

    // Delete the auth user (cascades auth session)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: deleteError.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
