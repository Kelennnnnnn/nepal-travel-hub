// Admin review of agency applications — Phase 4. Replaces the old
// upgrade-agency-role function (deleted; its only two actions, approve/
// reject, are a subset of this function's six). Every status transition
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

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import {
  agencyApprovedEmail, agencyRejectedEmail, agencyMoreInfoRequiredEmail, agencySuspendedEmail,
} from "../_shared/emailTemplates.ts";
import { logError } from "../_shared/guards.ts";

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
    requirePlatformRole(caller, ["admin", "super_admin"]);

    const supabaseAdmin = serviceRoleClient();
    const body = await req.json() as { action: string; agency_id?: string; reason?: string; note?: string };
    const { action, agency_id, reason, note } = body;
    if (!agency_id) return json({ error: "agency_id is required" }, 400);

    const { data: agency } = await supabaseAdmin.from("agencies").select("id, display_name").eq("id", agency_id).maybeSingle();
    if (!agency) return json({ error: "Agency not found" }, 404);

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

    const notifyOwner = async (subject: string, html: string, text: string) => {
      if (!owner) return;
      const { data: ownerAuth } = await supabaseAdmin.auth.admin.getUserById(owner.user_id);
      const email = ownerAuth?.user?.email;
      if (!email) return;
      const { error } = await sendEmail({ to: email, subject, html, text });
      if (error) logError("review-agency-application: send email", error);
    };

    const audit = async (mapAction: string, extra?: Record<string, unknown>) =>
      supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: mapAction, p_resource_type: "agency", p_resource_id: agency_id,
        p_after: { agency_name: agency.display_name, ...(extra ?? {}) },
      });

    if (action === "start_review") {
      const error = await setStatus("in_review");
      if (error) return json({ error: error.message }, 500);
      await audit("agency_start_review");
      return json({ success: true });
    }

    if (action === "request_info") {
      if (!note?.trim()) return json({ error: "note is required" }, 400);
      const error = await setStatus("more_info_required", { info_requested_note: note });
      if (error) return json({ error: error.message }, 500);
      const { subject, html, text } = agencyMoreInfoRequiredEmail({ agencyName: agency.display_name, note });
      await notifyOwner(subject, html, text);
      await audit("agency_request_info", { note });
      return json({ success: true });
    }

    if (action === "approve") {
      const error = await setStatus("approved");
      if (error) return json({ error: error.message }, 500);

      // The actual role escalation (target §22's "Agency can publish" gate)
      // — grants the platform "agency" role to the owner. Everything else
      // in this schema authorizes off agency_users membership directly
      // (has_agency_access()), not this role claim; the role exists mainly
      // for routing/UI purposes (ProtectedRoute, dashboard links) — see
      // PHASE_4_AGENCY_ONBOARDING.md for the reasoning.
      if (owner) {
        const { error: roleErr } = await supabaseAdmin.auth.admin.updateUserById(owner.user_id, { app_metadata: { role: "agency" } });
        if (roleErr) logError("review-agency-application: role grant failed", roleErr);
      }

      const { subject, html, text } = agencyApprovedEmail({ agencyName: agency.display_name });
      await notifyOwner(subject, html, text);
      await audit("agency_approve");
      return json({ success: true });
    }

    if (action === "reject") {
      if (!reason?.trim()) return json({ error: "reason is required" }, 400);
      const error = await setStatus("rejected", { rejection_reason: reason });
      if (error) return json({ error: error.message }, 500);
      const { subject, html, text } = agencyRejectedEmail({ agencyName: agency.display_name, reason });
      await notifyOwner(subject, html, text);
      await audit("agency_reject", { reason });
      return json({ success: true });
    }

    if (action === "suspend") {
      if (!reason?.trim()) return json({ error: "reason is required" }, 400);
      const error = await setStatus("suspended", { rejection_reason: reason });
      if (error) return json({ error: error.message }, 500);

      // Pause the agency's published listings — a suspended agency should
      // not remain bookable while under suspension. Does NOT ban the auth
      // account or revoke the "agency" platform role (unlike the old
      // system's suspend flow) — the owner can still sign in and see their
      // suspended status via agency_verification, matching how a rejected
      // applicant isn't locked out either. Listing un-pause on reinstate
      // is deliberately NOT automatic (see reinstate below).
      await supabaseAdmin.from("listings").update({ status: "paused" }).eq("agency_id", agency_id).eq("status", "published");

      const { subject, html, text } = agencySuspendedEmail({ agencyName: agency.display_name, reason });
      await notifyOwner(subject, html, text);
      await audit("agency_suspend", { reason });
      return json({ success: true });
    }

    if (action === "reinstate") {
      const error = await setStatus("approved");
      if (error) return json({ error: error.message }, 500);
      // Listings are NOT automatically republished — an agency reinstated
      // after suspension should review and manually republish each
      // listing (dates/prices may be stale after time away), rather than
      // instantly reappearing bookable with no owner review. This mirrors
      // the "pending_review" gate new listings already go through
      // (target §23) rather than inventing a separate auto-republish rule.
      await audit("agency_reinstate");
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    if (err instanceof VerificationError) return json({ error: err.message }, err.status);
    logError("review-agency-application", err);
    return json({ error: "Internal server error" }, 500);
  }
});
