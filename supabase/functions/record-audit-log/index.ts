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
import { scrub } from "../_shared/guards.ts";
import { fail, getRequestId, handleOptions, HttpError, ok, parseJson, withRequestLog } from "../_shared/http.ts";
import { recordAuditLogSchema } from "../_shared/schemas.ts";

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    // Admin-tier only — this is specifically for admin-panel actions.
    // Travelers/agencies have no legitimate reason to write audit_logs
    // entries, and admitting them here would make this an open logging
    // sink rather than an audit trail.
    requirePlatformRole(caller, ["admin", "super_admin", "support", "finance"]);

    const body = await parseJson(req, recordAuditLogSchema);
    logCtx.action = body.action;

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
      p_request_id: getRequestId(req),
    });
    if (error) return fail(req, 500, "Failed to record audit log.", error, { actorId: caller.id });

    return ok(req, { success: true });
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
