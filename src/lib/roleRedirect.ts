import type { Role } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

/** Where each role belongs after authentication. */
export function homeForRole(role: Role | undefined): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "agency":
      return "/agency/dashboard";
    case "user":
    default:
      return "/";
  }
}

/**
 * Admins must clear the TOTP MFA gate before reaching /admin. Never route an
 * admin straight to homeForRole("admin") after a plain password sign-in —
 * that skips the second factor entirely. Use this after any sign-in where
 * `role === "admin"` instead.
 */
export async function resolveAdminDestination(): Promise<string> {
  if (import.meta.env.VITE_DISABLE_MFA === "true") {
    return "/admin";
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");

  return verifiedTotp ? "/admin/mfa-verify" : "/admin/mfa-setup";
}
