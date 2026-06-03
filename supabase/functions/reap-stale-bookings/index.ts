import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logError } from "../_shared/guards.ts";

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
