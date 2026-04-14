import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAdmin(req: Request): Promise<{ error: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Missing Authorization header" }, 401) };
  }

  const token = authHeader.slice(7);

  // Use the admin client to verify the token and get the user
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return { error: json({ error: "Invalid or expired token" }, 401) };
  }

  const role = user.user_metadata?.role;
  if (role !== "admin") {
    return { error: json({ error: "Admin access required" }, 403) };
  }

  return { error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { error: authError } = await verifyAdmin(req);
  if (authError) return authError;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const body = await req.json() as {
      action: string;
      user_id?: string;
      role?: string;
      page?: number;
      limit?: number;
    };

    const { action } = body;

    // ── List users ──────────────────────────────────────────
    if (action === "list") {
      const page = body.page ?? 1;
      const perPage = body.limit ?? 50;

      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) return json({ error: error.message }, 500);

      return json({ users: data.users, total: data.users.length });
    }

    // All other actions require a user_id
    const { user_id } = body;
    if (!user_id) {
      return json({ error: "user_id is required" }, 400);
    }

    // ── Suspend ─────────────────────────────────────────────
    if (action === "suspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: { disabled: true },
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── Unsuspend ───────────────────────────────────────────
    if (action === "unsuspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: { disabled: false },
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── Change role ─────────────────────────────────────────
    if (action === "change_role") {
      const { role } = body;
      if (!role || !["user", "agency", "admin"].includes(role)) {
        return json({ error: 'role must be "user", "agency", or "admin"' }, 400);
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: { role },
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, role });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
