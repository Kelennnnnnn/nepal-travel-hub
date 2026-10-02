// Platform user/role management — rebuilt for Phase 3 (Authentication,
// roles and authorization). Replaces the old 3-role (user/agency/admin)
// implementation with the target §28 role set (traveler/agency/admin/
// super_admin/support/finance) and requires MFA (aal2) for every caller,
// not just role — see supabase/functions/_shared/auth.ts and
// PHASE_3_AUTH.md for why. Every mutating action is server-attributed to
// `audit_logs` via record_audit_log() — the frontend no longer needs (and,
// since audit_logs has no client INSERT grant at all, no longer CAN) log
// these specific actions itself; see src/lib/audit.ts.
//
// Agency-scoped role changes (agency_users.agency_role — owner/manager/
// staff) are NOT handled here. That's the Agency Management bounded
// context (Phase 4/agency dashboard), a different action with a different
// authorization boundary (an agency owner managing their own staff, not a
// platform admin managing platform-wide roles).
//
// Fixes audit C3: the privilege ceiling used to check only the role being
// GRANTED (change_role's `role` param), never the TARGET's current role —
// a plain admin could suspend, delete, or change_role a super_admin (or
// another admin), since suspend/unsuspend/delete had no role check on the
// target at all, and change_role's SUPER_ADMIN_ONLY_GRANTABLE check only
// looked at the new role, not the old one. Every action that takes a
// user_id now fetches the target first and refuses if the target is
// currently admin/super_admin and the caller isn't super_admin — plus a
// last-active-super-admin guard, self-suspend protection, immediate
// session revocation after suspend/change_role, and an audit-write that's
// actually checked rather than fired-and-forgotten (every fail() call
// below both logs the real error server-side AND returns a requestId to
// the client — this is what the old logAuditFailure() hand-rolled).

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError, type PlatformRole } from "../_shared/auth.ts";
import { logError } from "../_shared/guards.ts";
import { fail, getRequestId, handleOptions, HttpError, ok, parseJson, userClient, withIdempotency, withRequestLog } from "../_shared/http.ts";
import { adminUsersSchema } from "../_shared/schemas.ts";

// Privilege ceiling: a plain admin can grant/revoke the "operational" roles,
// but only a super_admin can create or demote another admin/super_admin.
// Prevents an ordinary admin account (a much more common, more exposed
// credential than the handful of super_admin accounts should be) from
// minting itself or a collaborator a super_admin.
const SUPER_ADMIN_ONLY_GRANTABLE: PlatformRole[] = ["admin", "super_admin"];
const PROTECTED_TARGET_ROLES: PlatformRole[] = ["admin", "super_admin"];

type AuthUser = { id: string; app_metadata?: Record<string, unknown> | null; banned_until?: string | null };

function roleOf(u: AuthUser): PlatformRole {
  return (u.app_metadata?.role as PlatformRole | undefined) ?? "traveler";
}

function isBanned(u: AuthUser): boolean {
  return !!u.banned_until && new Date(u.banned_until) > new Date();
}

async function countActiveSuperAdmins(supabaseAdmin: ReturnType<typeof serviceRoleClient>): Promise<number> {
  // Same listUsers({ perPage: 1000 }) approach the "list" action already
  // uses — accepts the same up-to-1000-user ceiling as existing precedent
  // in this file, not a new limitation introduced here.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => roleOf(u as AuthUser) === "super_admin" && !isBanned(u as AuthUser)).length;
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    requirePlatformRole(caller, ["admin", "super_admin"]);

    const body = await parseJson(req, adminUsersSchema);
    logCtx.action = body.action;
    const supabaseAdmin = serviceRoleClient();

    // ── List users ──────────────────────────────────────────────────────
    // Paginated/searched/aggregated entirely in Postgres now (admin_user_
    // directory()/admin_user_stats(), migration 20260917000021) — this used
    // to be supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }) followed
    // by filtering AND aggregating in JS, over every user in the project
    // (silently truncated past 1000), shipping the full GoTrue user object
    // for each one back to the browser. Both RPCs do their own is_admin()/
    // is_support_or_admin() check via auth.uid(), which only resolves
    // correctly against the CALLER's own JWT — not the service-role key
    // used everywhere else in this file — so a caller-authenticated client
    // is used for exactly these two calls.
    if (body.action === "list") {
      const callerClient = userClient(req);
      const limit = body.limit ?? 50;
      const offset = body.offset ?? 0;

      const [usersResult, statsResult] = await Promise.all([
        callerClient.rpc("admin_user_directory", {
          p_search: body.search || null,
          p_role: body.role || null,
          p_limit: limit,
          p_offset: offset,
        }),
        callerClient.rpc("admin_user_stats"),
      ]);
      if (usersResult.error) return fail(req, 500, "Failed to load users.", usersResult.error);
      if (statsResult.error) return fail(req, 500, "Failed to load user stats.", statsResult.error);

      const rows: Array<Record<string, unknown>> = usersResult.data ?? [];
      const total = (rows[0]?.total_count as number | undefined) ?? 0;
      const users = rows.map((row) => {
        const { total_count, ...user } = row;
        void total_count;
        return user;
      });
      const stats = statsResult.data?.[0] ?? {
        total: 0, travelers: 0, agencies: 0, admins: 0, support: 0, finance: 0, suspended: 0,
      };

      return ok(req, { users, stats, pagination: { limit, offset, total } });
    }

    // All other actions require a target user_id.
    const { user_id } = body;

    // Fetch the target once, up front, for every remaining action — this
    // is the audit C3 fix's foundation: every downstream check reasons
    // about the target's CURRENT role, not just the role being granted.
    const { data: targetData, error: targetError } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (targetError || !targetData?.user) {
      return fail(req, 404, "User not found");
    }
    const target = targetData.user as AuthUser;
    const targetRole = roleOf(target);

    // Privilege ceiling (audit C3): only a super_admin may act on an
    // existing admin/super_admin account at all, regardless of which
    // specific action is being attempted.
    if (PROTECTED_TARGET_ROLES.includes(targetRole) && caller.role !== "super_admin") {
      return fail(req, 403, "Only a super_admin can modify an admin or super_admin account.");
    }

    return await withIdempotency(req, caller.id, `admin-users:${body.action}:${user_id}`, async () => {
      if (body.action === "suspend") {
        if (user_id === caller.id) {
          return fail(req, 400, "You cannot suspend your own account.");
        }
        if (targetRole === "super_admin" && !isBanned(target)) {
          const activeSuperAdmins = await countActiveSuperAdmins(supabaseAdmin);
          if (activeSuperAdmins <= 1) {
            return fail(req, 400, "Cannot suspend the only active super_admin.");
          }
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
        if (error) return fail(req, 500, "Failed to suspend user.", error, { targetId: user_id });

        const { error: revokeError } = await supabaseAdmin.rpc("revoke_user_sessions", { p_user_id: user_id });
        if (revokeError) logError("admin-users:suspend:revoke_user_sessions", revokeError, { targetId: user_id });

        const { error: auditError } = await supabaseAdmin.rpc("record_audit_log", {
          p_actor_id: caller.id, p_action: "suspend_user", p_resource_type: "user", p_resource_id: user_id,
          p_before: null, p_after: null, p_request_id: getRequestId(req),
        });
        if (auditError) return fail(req, 500, "Action succeeded but failed to record audit log.", auditError, { targetId: user_id });
        return ok(req, { success: true });
      }

      if (body.action === "unsuspend") {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        if (error) return fail(req, 500, "Failed to unsuspend user.", error, { targetId: user_id });

        const { error: auditError } = await supabaseAdmin.rpc("record_audit_log", {
          p_actor_id: caller.id, p_action: "unsuspend_user", p_resource_type: "user", p_resource_id: user_id,
          p_before: null, p_after: null, p_request_id: getRequestId(req),
        });
        if (auditError) return fail(req, 500, "Action succeeded but failed to record audit log.", auditError, { targetId: user_id });
        return ok(req, { success: true });
      }

      if (body.action === "change_role") {
        const { role } = body;
        if (SUPER_ADMIN_ONLY_GRANTABLE.includes(role) && caller.role !== "super_admin") {
          return fail(req, 403, "Only a super_admin can grant the admin or super_admin role.");
        }
        if (user_id === caller.id && role !== caller.role) {
          // An admin demoting/changing their OWN role could lock themselves
          // out with no one else able to undo it if they're the only admin —
          // require a different super_admin/admin to make this change instead.
          return fail(req, 400, "You cannot change your own role. Ask another admin.");
        }
        if (targetRole === "super_admin" && role !== "super_admin") {
          const activeSuperAdmins = await countActiveSuperAdmins(supabaseAdmin);
          if (activeSuperAdmins <= 1) {
            return fail(req, 400, "Cannot demote the only active super_admin.");
          }
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { app_metadata: { role } });
        if (error) return fail(req, 500, "Failed to change role.", error, { targetId: user_id });

        const { error: revokeError } = await supabaseAdmin.rpc("revoke_user_sessions", { p_user_id: user_id });
        if (revokeError) logError("admin-users:change_role:revoke_user_sessions", revokeError, { targetId: user_id });

        const { error: auditError } = await supabaseAdmin.rpc("record_audit_log", {
          p_actor_id: caller.id, p_action: "change_role", p_resource_type: "user", p_resource_id: user_id,
          p_before: { role: targetRole }, p_after: { role }, p_request_id: getRequestId(req),
        });
        if (auditError) return fail(req, 500, "Action succeeded but failed to record audit log.", auditError, { targetId: user_id });
        return ok(req, { success: true, role });
      }

      if (body.action === "delete") {
        if (user_id === caller.id) return fail(req, 400, "You cannot delete your own account.");
        if (targetRole === "super_admin" && !isBanned(target)) {
          const activeSuperAdmins = await countActiveSuperAdmins(supabaseAdmin);
          if (activeSuperAdmins <= 1) {
            return fail(req, 400, "Cannot delete the only active super_admin.");
          }
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
        if (error) return fail(req, 500, "Failed to delete user.", error, { targetId: user_id });

        const { error: auditError } = await supabaseAdmin.rpc("record_audit_log", {
          p_actor_id: caller.id, p_action: "delete_user", p_resource_type: "user", p_resource_id: user_id,
          p_before: null, p_after: null, p_request_id: getRequestId(req),
        });
        if (auditError) return fail(req, 500, "Action succeeded but failed to record audit log.", auditError, { targetId: user_id });
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
