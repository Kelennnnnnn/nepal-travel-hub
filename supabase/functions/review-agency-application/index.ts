// Admin review of agency applications — Phase 4. Every status transition
// is additionally guarded at the database layer
// (guard_agency_verification_transition trigger) — this function's own
// status checks below are the user-facing error messages, not the only
// line of defense.
//
// Actions: start_review, request_info, approve, reject, suspend, reinstate.
// All require admin/super_admin at aal2 (requirePlatformRole — target §22:
// "Approval must never be controlled by the applicant," enforced here by
// this being the ONLY write path to agency_verification.status at all,
// combined with RLS granting zero direct UPDATE to any non-admin role).
//
// suspend/reinstate call admin_suspend_agency()/admin_reinstate_agency()
// (supabase/migrations/20260917000011_agency_enforcement.sql) rather than
// making several separate writes — status change, listing pause, audit
// log, and domain event all happen in that one function's single
// transaction. Those RPCs are SECURITY DEFINER but check is_admin() and
// use auth.uid() INSIDE the function body — both only resolve correctly
// when the request is authenticated as the real calling admin's own JWT,
// not the service-role key (which has no `sub` claim at all — auth.uid()
// would be NULL and is_admin() would always evaluate false) — so a
// caller-authenticated client is used for exactly those two calls. The
// other four actions (start_review/request_info/approve/reject) remain
// separate setStatus()+audit() calls rather than being folded into their
// own combined SQL functions the way suspend/reinstate are — a real,
// deliberate scope call for this pass (every audit result IS checked
// below, which is the actual bug being fixed; consolidating four more
// actions into new SECURITY DEFINER functions is a larger change than
// this hardening pass needs to make).

import { createClient } from "@supabase/supabase-js";
import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { logError } from "../_shared/guards.ts";
import { fail, getRequestId, handleOptions, HttpError, ok, parseJson, withIdempotency, withRequestLog } from "../_shared/http.ts";
import { reviewAgencyApplicationSchema } from "../_shared/schemas.ts";

function callerClientFor(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    requirePlatformRole(caller, ["admin", "super_admin"]);

    const body = await parseJson(req, reviewAgencyApplicationSchema);
    logCtx.action = body.action;
    const { action, agency_id } = body;

    const supabaseAdmin = serviceRoleClient();

    const { data: agency } = await supabaseAdmin.from("agencies").select("id, display_name").eq("id", agency_id).maybeSingle();
    if (!agency) return fail(req, 404, "Agency not found");

    const { data: verification } = await supabaseAdmin
      .from("agency_verification")
      .select("status")
      .eq("agency_id", agency_id)
      .maybeSingle();
    if (!verification) return fail(req, 500, "Verification record not found", undefined, { agencyId: agency_id });
    const currentStatus = verification.status as string;

    // Every action maps to a target status — if the agency is already
    // there, reject up front rather than re-writing/re-notifying/
    // re-auditing an action that already happened.
    const TARGET_STATUS: Record<string, string> = {
      start_review: "in_review", request_info: "more_info_required",
      approve: "approved", reject: "rejected", suspend: "suspended", reinstate: "approved",
    };
    if (TARGET_STATUS[action] && currentStatus === TARGET_STATUS[action]) {
      return fail(req, 400, `Agency is already ${TARGET_STATUS[action]}`);
    }

    const { data: owner } = await supabaseAdmin
      .from("agency_users")
      .select("user_id")
      .eq("agency_id", agency_id)
      .eq("agency_role", "owner")
      .is("removed_at", null)
      .maybeSingle();

    const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
      const { error } = await supabaseAdmin
        .from("agency_verification")
        .update({ status, reviewed_by: caller.id, reviewed_at: new Date().toISOString(), ...extra })
        .eq("agency_id", agency_id);
      return error;
    };

    // Audit item 4: this used to call sendEmail() inline. dispatch-
    // notifications now owns actually sending — it resolves the current
    // owner and renders the template itself when it processes the event,
    // so a slow/down Resend call no longer holds up this admin's request,
    // and a failed send retries with backoff instead of vanishing.
    const recordDomainEvent = async (eventType: string, extraPayload: Record<string, unknown> = {}) => {
      const { error } = await supabaseAdmin.from("domain_events").insert({
        event_type: eventType, aggregate_type: "agency", aggregate_id: agency_id, payload: extraPayload,
      });
      if (error) logError("review-agency-application: domain event insert failed", error, { agencyId: agency_id, action, eventType });
    };

    // Every audit call is checked — a failed audit write no longer
    // disappears silently (the bug this hardening pass exists to fix).
    // The status change already committed by the time this runs, so a
    // failure here is logged loudly (with the requestId `fail()` would
    // generate for a real failure response) rather than surfaced as if
    // the whole action failed — but it IS surfaced, not swallowed.
    const audit = async (mapAction: string, extra?: Record<string, unknown>) => {
      const { error } = await supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: mapAction, p_resource_type: "agency", p_resource_id: agency_id,
        p_after: { agency_name: agency.display_name, ...(extra ?? {}) },
        p_request_id: getRequestId(req),
      });
      if (error) {
        logError("review-agency-application: audit write failed", error, { agencyId: agency_id, action: mapAction });
      }
      return error;
    };

    return await withIdempotency(req, caller.id, `review-agency-application:${action}`, async () => {
      if (action === "start_review") {
        const error = await setStatus("in_review");
        if (error) return fail(req, 500, "Failed to update status.", error, { agencyId: agency_id });
        await audit("agency_start_review");
        return ok(req, { success: true });
      }

      if (action === "request_info") {
        const error = await setStatus("more_info_required", { info_requested_note: body.note });
        if (error) return fail(req, 500, "Failed to update status.", error, { agencyId: agency_id });
        await recordDomainEvent("AGENCY_INFO_REQUESTED", { note: body.note });
        await audit("agency_request_info", { note: body.note });
        return ok(req, { success: true });
      }

      if (action === "approve") {
        const error = await setStatus("approved");
        if (error) return fail(req, 500, "Failed to update status.", error, { agencyId: agency_id });

        // The actual role escalation (target §22's "Agency can publish"
        // gate). Everything else in this schema authorizes off
        // agency_users membership directly (has_agency_access()), not
        // this role claim — the role exists mainly for routing/UI purposes.
        if (owner) {
          const { error: roleErr } = await supabaseAdmin.auth.admin.updateUserById(owner.user_id, { app_metadata: { role: "agency" } });
          if (roleErr) logError("review-agency-application: role grant failed", roleErr, { agencyId: agency_id, ownerId: owner.user_id });
        }

        await recordDomainEvent("AGENCY_APPROVED");
        await audit("agency_approve");
        return ok(req, { success: true });
      }

      if (action === "reject") {
        const error = await setStatus("rejected", { rejection_reason: body.reason });
        if (error) return fail(req, 500, "Failed to update status.", error, { agencyId: agency_id });
        await recordDomainEvent("AGENCY_REJECTED", { reason: body.reason });
        await audit("agency_reject", { reason: body.reason });
        return ok(req, { success: true });
      }

      if (action === "suspend") {
        const callerClient = callerClientFor(req);
        const { error: rpcErr } = await callerClient.rpc("admin_suspend_agency", { p_agency_id: agency_id, p_reason: body.reason, p_request_id: getRequestId(req) });
        if (rpcErr) return fail(req, 500, "Failed to suspend agency.", rpcErr, { agencyId: agency_id });
        // admin_suspend_agency() itself already inserts the AGENCY_SUSPENDED
        // domain_event (supabase/migrations/20260917000011_agency_
        // enforcement.sql) — nothing more to record here.
        return ok(req, { success: true });
      }

      if (action === "reinstate") {
        const callerClient = callerClientFor(req);
        const { error: rpcErr } = await callerClient.rpc("admin_reinstate_agency", { p_agency_id: agency_id, p_request_id: getRequestId(req) });
        if (rpcErr) return fail(req, 500, "Failed to reinstate agency.", rpcErr, { agencyId: agency_id });
        // admin_reinstate_agency() already inserts the AGENCY_REINSTATED
        // domain_event — dispatch-notifications sends the reinstatement
        // email from that (audit item 4; this action never sent one at
        // all before, since it predates the notification worker existing).
        // Listings are NOT automatically republished — an agency
        // reinstated after suspension should review and manually
        // republish each listing.
        return ok(req, { success: true });
      }

      return fail(req, 400, "Unknown action");
    });
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
