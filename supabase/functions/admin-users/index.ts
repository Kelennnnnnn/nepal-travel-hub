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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Verify caller is admin
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) return json({ error: "Invalid or expired token" }, 401);
  if (caller.user_metadata?.role !== "admin") return json({ error: "Admin access required" }, 403);

  try {
    const body = await req.json() as {
      action: string;
      user_id?: string;
      role?: string;
      search?: string;
    };

    const { action } = body;

    // ── List users ──────────────────────────────────────────────────────────
    if (action === "list") {
      const search = (body.search ?? "").toLowerCase().trim();

      // Fetch up to 1000 users (sufficient for any MVP platform)
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) return json({ error: error.message }, 500);

      const all = data.users;

      // Platform-wide stats (always from full list, regardless of search)
      const stats = {
        total:     all.length,
        travelers: all.filter((u) => (u.user_metadata?.role ?? "user") === "user").length,
        agencies:  all.filter((u) => u.user_metadata?.role === "agency").length,
        admins:    all.filter((u) => u.user_metadata?.role === "admin").length,
        suspended: all.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length,
      };

      // Server-side search filter
      const users = search
        ? all.filter((u) => {
            const name = ((u.user_metadata?.name ?? u.user_metadata?.full_name ?? "") as string).toLowerCase();
            return name.includes(search) || (u.email ?? "").toLowerCase().includes(search);
          })
        : all;

      return json({ users, stats });
    }

    // All mutating actions require user_id
    const { user_id } = body;
    if (!user_id) return json({ error: "user_id is required" }, 400);

    // ── Suspend (proper Supabase Auth ban) ──────────────────────────────────
    if (action === "suspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        { ban_duration: "876000h" }, // ~100 years = effectively permanent
      );
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── Unsuspend ───────────────────────────────────────────────────────────
    if (action === "unsuspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        { ban_duration: "none" },
      );
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── Change role ─────────────────────────────────────────────────────────
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

    // ── Delete user ─────────────────────────────────────────────────────────
    if (action === "delete") {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
