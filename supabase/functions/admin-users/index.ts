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

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError, type PlatformRole } from "../_shared/auth.ts";
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

const ALL_ROLES: PlatformRole[] = ["traveler", "agency", "admin", "super_admin", "support", "finance"];

// Privilege ceiling: a plain admin can grant/revoke the "operational" roles,
// but only a super_admin can create or demote another admin/super_admin.
// Prevents an ordinary admin account (a much more common, more exposed
// credential than the handful of super_admin accounts should be) from
// minting itself or a collaborator a super_admin.
const ADMIN_GRANTABLE: PlatformRole[] = ["traveler", "agency", "support", "finance"];
const SUPER_ADMIN_ONLY_GRANTABLE: PlatformRole[] = ["admin", "super_admin"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await verifyCaller(req);
    requirePlatformRole(caller, ["admin", "super_admin"]);

    const supabaseAdmin = serviceRoleClient();
    const body = await req.json() as { action: string; user_id?: string; role?: string; search?: string };
    const { action } = body;

    // ── List users ──────────────────────────────────────────────────────
    if (action === "list") {
      const search = (body.search ?? "").toLowerCase().trim();
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);

      const all = data.users;
      const roleOf = (u: typeof all[number]) => (u.app_metadata?.role as PlatformRole | undefined) ?? "traveler";

      const stats = {
        total: all.length,
        travelers: all.filter((u) => roleOf(u) === "traveler").length,
        agencies: all.filter((u) => roleOf(u) === "agency").length,
        admins: all.filter((u) => roleOf(u) === "admin" || roleOf(u) === "super_admin").length,
        support: all.filter((u) => roleOf(u) === "support").length,
        finance: all.filter((u) => roleOf(u) === "finance").length,
        suspended: all.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length,
      };

      const users = search
        ? all.filter((u) => {
            const name = ((u.user_metadata?.full_name ?? u.user_metadata?.name ?? "") as string).toLowerCase();
            return name.includes(search) || (u.email ?? "").toLowerCase().includes(search);
          })
        : all;

      return json({ users, stats });
    }

    // All other actions require a target user_id.
    const { user_id } = body;
    if (!user_id) return json({ error: "user_id is required" }, 400);

    if (action === "suspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      if (error) return json({ error: error.message }, 500);
      await supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: "suspend_user", p_resource_type: "user", p_resource_id: user_id,
      });
      return json({ success: true });
    }

    if (action === "unsuspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (error) return json({ error: error.message }, 500);
      await supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: "unsuspend_user", p_resource_type: "user", p_resource_id: user_id,
      });
      return json({ success: true });
    }

    if (action === "change_role") {
      const { role } = body;
      if (!role || !ALL_ROLES.includes(role as PlatformRole)) {
        return json({ error: `role must be one of: ${ALL_ROLES.join(", ")}` }, 400);
      }
      if (SUPER_ADMIN_ONLY_GRANTABLE.includes(role as PlatformRole) && caller.role !== "super_admin") {
        return json({ error: "Only a super_admin can grant the admin or super_admin role." }, 403);
      }
      if (user_id === caller.id && role !== caller.role) {
        // An admin demoting/changing their OWN role could lock themselves
        // out with no one else able to undo it if they're the only admin —
        // require a different super_admin/admin to make this change instead.
        return json({ error: "You cannot change your own role. Ask another admin." }, 400);
      }

      const { data: targetBefore } = await supabaseAdmin.auth.admin.getUserById(user_id);
      const oldRole = (targetBefore?.user?.app_metadata?.role as string | undefined) ?? "traveler";

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { app_metadata: { role } });
      if (error) return json({ error: error.message }, 500);

      await supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: "change_role", p_resource_type: "user", p_resource_id: user_id,
        p_before: { role: oldRole }, p_after: { role },
      });
      return json({ success: true, role });
    }

    if (action === "delete") {
      if (user_id === caller.id) return json({ error: "You cannot delete your own account." }, 400);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 500);
      await supabaseAdmin.rpc("record_audit_log", {
        p_actor_id: caller.id, p_action: "delete_user", p_resource_type: "user", p_resource_id: user_id,
      });
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    if (err instanceof VerificationError) return json({ error: err.message }, err.status);
    logError("admin-users", err);
    return json({ error: "Internal server error" }, 500);
  }
});
