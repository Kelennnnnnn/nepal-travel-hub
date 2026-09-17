// Generic audit-log write endpoint for admin-tier UI actions that don't
// already have a dedicated edge function of their own (e.g. listing
// moderation, review moderation, settings changes — Phases 4/5/24/43).
//
// Why this exists: Phase 2 deliberately revoked INSERT on audit_logs from
// every client role (see supabase/migrations/20260916000015_admin_and_audit.sql)
// — audit trails must never be directly writable by an authenticated
// browser session, or a compromised/malicious client could forge or omit
// entries. The old system's src/lib/audit.ts did exactly that (a plain
// `supabase.from("audit_log").insert(...)` using the caller's own session),
// which Phase 2's schema now structurally forbids. This function is the
// replacement: it re-verifies the caller server-side and calls
// record_audit_log() with service_role, exactly like admin-users' own
// inline audit calls do for the actions it owns directly.
//
// actor_id is ALWAYS the verified caller's own id — never taken from the
// request body — so the worst a malicious authenticated caller can do is
// write nonsense entries attributed to themselves, not forge entries
// attributed to someone else.

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { logError, scrub } from "../_shared/guards.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await verifyCaller(req);
    // Admin-tier only — this is specifically for admin-panel actions.
    // Travelers/agencies have no legitimate reason to write audit_logs
    // entries, and admitting them here would make this an open logging
    // sink rather than an audit trail.
    requirePlatformRole(caller, ["admin", "super_admin", "support", "finance"]);

    const body = await req.json() as {
      action: string; resource_type: string; resource_id?: string;
      before?: Record<string, unknown>; after?: Record<string, unknown>;
    };
    if (!body.action || !body.resource_type) {
      return json({ error: "action and resource_type are required" }, 400);
    }

    const supabaseAdmin = serviceRoleClient();
    const { error } = await supabaseAdmin.rpc("record_audit_log", {
      p_actor_id: caller.id,
      p_action: body.action,
      p_resource_type: body.resource_type,
      p_resource_id: body.resource_id ?? null,
      // scrub() strips anything that looks like a secret/credential before
      // it ever reaches the audit_logs table — target §42: "Never store
      // secrets in audit logs."
      p_before: body.before ? scrub(body.before) : null,
      p_after: body.after ? scrub(body.after) : null,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true });
  } catch (err) {
    if (err instanceof VerificationError) return json({ error: err.message }, err.status);
    logError("record-audit-log", err);
    return json({ error: "Internal server error" }, 500);
  }
});
