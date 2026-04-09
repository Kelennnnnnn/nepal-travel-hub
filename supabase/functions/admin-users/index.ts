import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // JWT verification — admin only
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
  const role = (payload as { user_metadata?: { role?: string } }).user_metadata?.role;
  if (role !== "admin") {
    return json({ error: "Admin access required" }, 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // ── GET: list users ─────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const page = Number(url.searchParams.get("page") ?? "1");
      const perPage = Number(url.searchParams.get("limit") ?? "50");

      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) return json({ error: error.message }, 500);

      return json({ users: data.users, total: data.users.length });
    }

    // ── POST: mutate a user ─────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json() as {
        action: string;
        user_id?: string;
        role?: string;
        // list params forwarded via POST
        page?: number;
        limit?: number;
      };

      const { action } = body;

      // list action can also come in via POST body
      if (action === "list") {
        const page = body.page ?? 1;
        const perPage = body.limit ?? 50;

        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error) return json({ error: error.message }, 500);

        return json({ users: data.users, total: data.users.length });
      }

      const { user_id } = body;
      if (!user_id) {
        return json({ error: "user_id is required" }, 400);
      }

      if (action === "suspend") {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          user_id,
          { user_metadata: { disabled: true } }
        );
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      if (action === "unsuspend") {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          user_id,
          { user_metadata: { disabled: false } }
        );
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      if (action === "change_role") {
        const { role } = body;
        if (!role || !["user", "agency", "admin"].includes(role)) {
          return json(
            { error: 'role must be "user", "agency", or "admin"' },
            400
          );
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          user_id,
          { user_metadata: { role } }
        );
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, role });
      }

      return json({ error: `Unknown action: ${action}` }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
