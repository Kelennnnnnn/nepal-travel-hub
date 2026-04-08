import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
