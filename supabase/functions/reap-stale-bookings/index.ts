import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logError } from "../_shared/guards.ts";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  // Internal cron job (see reaper_cron.sql) — runs DB writes with the
  // service-role key. The edge gateway accepts any caller bearing a valid
  // JWT, including the public anon key shipped to every browser, so without
  // this check anyone could trigger repeated service-role writes on demand.
  // The cron job authenticates with the service-role key itself; require it.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!serviceRoleKey || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

  try {
    // Cancel pending_payment bookings older than 1 hour.
    // The availability-restore trigger will free the slot automatically.
    const { data, error } = await sb
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: "Payment not completed within time limit" })
      .eq("status", "pending_payment")
      .eq("payment_status", "unpaid")
      .lt("created_at", cutoff)
      .select("id");

    if (error) throw error;
    return new Response(JSON.stringify({ reaped: data?.length ?? 0 }), { status: 200 });
  } catch (err) {
    logError("reap-stale-bookings", err);
    return new Response(JSON.stringify({ error: "reap failed" }), { status: 500 });
  }
});
