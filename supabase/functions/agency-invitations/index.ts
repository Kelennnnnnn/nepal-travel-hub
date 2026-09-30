// Agency team invitations — audit M1. Replaces the old, unconsented
// agency_users_manage_own_agency direct-insert path (an owner could add
// any user_id as owner/manager with zero acknowledgment from that person)
// with a real invite/accept/revoke flow. No client role has a direct
// write path to agency_users or agency_invitations at all (supabase/
// migrations/20260917000012_agency_invitations.sql) — this function,
// running as service_role, is the only way any of those rows change.
//
// Tokens are never stored raw: only sha-256(token) is persisted
// (agency_invitations.token_hash), and the raw token only ever exists in
// the email link and the request body of the "accept" call — the same
// pattern password-reset/email-confirm tokens already use in this stack.

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { logError } from "../_shared/guards.ts";
import { fail, handleOptions, HttpError, ok, parseJson, withIdempotency, withRequestLog } from "../_shared/http.ts";
import { agencyInvitationsSchema } from "../_shared/schemas.ts";
import { randomTokenHex, sha256Hex } from "../_shared/tokens.ts";

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    const body = await parseJson(req, agencyInvitationsSchema);
    logCtx.action = body.action;
    const supabaseAdmin = serviceRoleClient();

    // ── invite ────────────────────────────────────────────────────────
    if (body.action === "invite") {
      // Ownership is an agency-scoped relationship, not a platform role —
      // an agency still in draft/submitted (its owner's platform role is
      // still "traveler", escalated to "agency" only on approval —
      // review-agency-application) must still be able to invite. Same
      // allowlist agency-application itself uses for this reason.
      requirePlatformRole(caller, ["traveler", "agency"]);
      const { agency_id, email, role } = body;

      return await withIdempotency(req, caller.id, `agency-invitations:invite:${agency_id}:${email}`, async () => {
        const { data: ownerMembership } = await supabaseAdmin
          .from("agency_users")
          .select("id")
          .eq("agency_id", agency_id)
          .eq("user_id", caller.id)
          .eq("agency_role", "owner")
          .is("removed_at", null)
          .not("accepted_at", "is", null)
          .maybeSingle();
        if (!ownerMembership) return fail(req, 403, "Only an owner can invite team members");

        const { data: isActive } = await supabaseAdmin.rpc("agency_is_active", { target_agency_id: agency_id });
        if (!isActive) return fail(req, 400, "Agency is not active");

        const { data: agency } = await supabaseAdmin.from("agencies").select("display_name").eq("id", agency_id).maybeSingle();
        if (!agency) return fail(req, 404, "Agency not found");

        // The token generated here is never emailed to anyone — sending is
        // now dispatch-notifications' job (audit item 4), and it mints and
        // stores its OWN fresh token immediately before actually sending,
        // exactly once, so the only raw token that ever leaves this server
        // is the one that goes out in the real email. This row's token_hash
        // exists solely to satisfy the NOT NULL constraint until then.
        const placeholderTokenHash = await sha256Hex(randomTokenHex(32));

        const { data: invitation, error: insertErr } = await supabaseAdmin
          .from("agency_invitations")
          .insert({ agency_id, email, agency_role: role, token_hash: placeholderTokenHash, invited_by: caller.id })
          .select("id")
          .single();
        if (insertErr || !invitation) return fail(req, 500, "Failed to create invitation.", insertErr, { agencyId: agency_id });

        const { error: eventErr } = await supabaseAdmin.from("domain_events").insert({
          event_type: "AGENCY_INVITATION_SENT",
          aggregate_type: "agency_invitation",
          aggregate_id: invitation.id,
          payload: { agency_id, email, role },
        });
        if (eventErr) {
          return fail(req, 500, "Failed to queue invitation email.", eventErr, { invitationId: invitation.id });
        }

        return ok(req, { success: true, invitation_id: invitation.id });
      });
    }

    // ── accept ────────────────────────────────────────────────────────
    if (body.action === "accept") {
      // No platform-role restriction — anyone signed in may accept an
      // invitation addressed to their own email, regardless of their
      // current platform role.
      const { token } = body;

      return await withIdempotency(req, caller.id, "agency-invitations:accept", async () => {
        const tokenHash = await sha256Hex(token);
        const { data: invitation } = await supabaseAdmin
          .from("agency_invitations")
          .select("id, agency_id, email, agency_role, invited_by, expires_at, accepted_at, revoked_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!invitation) return fail(req, 404, "Invitation not found");

        if (invitation.revoked_at) return fail(req, 410, "This invitation has been revoked");
        if (invitation.accepted_at) return fail(req, 410, "This invitation has already been accepted");
        if (new Date(invitation.expires_at as string) < new Date()) return fail(req, 410, "This invitation has expired");

        if (!caller.email || caller.email.toLowerCase() !== (invitation.email as string).toLowerCase()) {
          return fail(req, 403, "This invitation was sent to a different email address");
        }

        // A prior membership (e.g. previously removed, now re-invited) is
        // restored in place rather than inserted again — agency_users has a
        // unique(agency_id, user_id) constraint, and a second insert for the
        // same pair would violate it.
        const { data: existingMember } = await supabaseAdmin
          .from("agency_users")
          .select("id")
          .eq("agency_id", invitation.agency_id)
          .eq("user_id", caller.id)
          .maybeSingle();

        if (existingMember) {
          const { error: updateErr } = await supabaseAdmin
            .from("agency_users")
            .update({
              agency_role: invitation.agency_role, removed_at: null,
              accepted_at: new Date().toISOString(), invited_by: invitation.invited_by,
            })
            .eq("id", existingMember.id);
          if (updateErr) return fail(req, 500, "Failed to accept invitation.", updateErr, { invitationId: invitation.id });
        } else {
          const { error: insertErr } = await supabaseAdmin.from("agency_users").insert({
            agency_id: invitation.agency_id, user_id: caller.id, agency_role: invitation.agency_role,
            invited_by: invitation.invited_by, accepted_at: new Date().toISOString(),
          });
          if (insertErr) return fail(req, 500, "Failed to accept invitation.", insertErr, { invitationId: invitation.id });
        }

        const { error: markAcceptedErr } = await supabaseAdmin
          .from("agency_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);
        if (markAcceptedErr) logError("agency-invitations:accept:mark-accepted", markAcceptedErr, { invitationId: invitation.id });

        return ok(req, { success: true, agency_id: invitation.agency_id });
      });
    }

    // ── revoke ────────────────────────────────────────────────────────
    if (body.action === "revoke") {
      requirePlatformRole(caller, ["traveler", "agency"]);
      const { invitation_id } = body;

      return await withIdempotency(req, caller.id, `agency-invitations:revoke:${invitation_id}`, async () => {
        const { data: invitation } = await supabaseAdmin
          .from("agency_invitations")
          .select("id, agency_id, accepted_at, revoked_at")
          .eq("id", invitation_id)
          .maybeSingle();
        if (!invitation) return fail(req, 404, "Invitation not found");

        const { data: ownerMembership } = await supabaseAdmin
          .from("agency_users")
          .select("id")
          .eq("agency_id", invitation.agency_id)
          .eq("user_id", caller.id)
          .eq("agency_role", "owner")
          .is("removed_at", null)
          .not("accepted_at", "is", null)
          .maybeSingle();
        if (!ownerMembership) return fail(req, 403, "Only an owner can revoke invitations");

        if (invitation.accepted_at) return fail(req, 400, "This invitation has already been accepted");
        if (invitation.revoked_at) return ok(req, { success: true }); // idempotent

        const { error: revokeErr } = await supabaseAdmin
          .from("agency_invitations")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", invitation_id);
        if (revokeErr) return fail(req, 500, "Failed to revoke invitation.", revokeErr, { invitationId: invitation_id });

        return ok(req, { success: true });
      });
    }

    return fail(req, 400, "Unknown action");
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
