import type { Role } from "@/stores/authStore";
import { ELEVATED_ROLES } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

/** Where each role belongs after authentication. */
export function homeForRole(role: Role | undefined): string {
  switch (role) {
    case "admin":
    case "super_admin":
    case "support":
    case "finance":
      // All four elevated roles share the same admin-panel shell for now —
      // Phase 25 (Admin dashboard) is responsible for scoping what each
      // role actually sees/can do inside it (target §61), not routing them
      // to separate portals.
      return "/admin";
    case "agency":
      return "/agency/dashboard";
    case "traveler":
    default:
      return "/";
  }
}

/**
 * Every elevated role (admin/super_admin/support/finance) must clear the
 * TOTP MFA gate before reaching /admin — target §28/§29 and
 * AUDIT_REPORT.md AUTH-01. Never route an elevated-role account straight to
 * homeForRole(role) after a plain password sign-in — that skips the second
 * factor entirely, and (per Phase 3's database/edge-function changes) they
 * would hit a wall of RLS/edge-function 403s once there anyway, since
 * is_admin() and friends now require aal2 unconditionally. Use this after
 * any sign-in where `ELEVATED_ROLES.includes(role)` instead of
 * homeForRole().
 */
export async function resolveElevatedDestination(): Promise<string> {
  if (import.meta.env.VITE_DISABLE_MFA === "true") {
    return "/admin";
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");

  return verifiedTotp ? "/admin/mfa-verify" : "/admin/mfa-setup";
}

export function isElevatedRole(role: Role | undefined): boolean {
  return !!role && ELEVATED_ROLES.includes(role);
}
