import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore, ELEVATED_ROLES, type Role } from "@/stores/authStore";

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

/**
 * Route guard. Two independent checks, in order:
 *  1. Role — is the signed-in account one of `allowedRoles`?
 *  2. AAL (PHASE_3_AUTH.md / AUDIT_REPORT.md AUTH-01) — for any ELEVATED_ROLE
 *     (admin/super_admin/support/finance), is the session actually at aal2?
 *
 * The AAL check is real defense here, not just a UX nicety: every RLS
 * policy and edge function an elevated-role user could reach also requires
 * aal2 now (is_admin() and friends bake it in server-side), so a session
 * stuck at aal1 would just bounce off a wall of 403s if this route guard
 * let it through — redirecting to MFA verify/setup here is both a better
 * experience AND consistent with what the backend will actually allow.
 */
export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, user, isLoading, aal, hasVerifiedMfaFactor } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    if (allowedRoles?.some((r) => ELEVATED_ROLES.includes(r))) return <Navigate to="/admin/login" replace />;
    if (allowedRoles?.includes("agency")) return <Navigate to="/agency/login" replace />;
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeForRoleFallback(user.role)} replace />;
  }

  if (ELEVATED_ROLES.includes(user.role) && aal !== "aal2") {
    // Already on an MFA page — let it render instead of redirecting to
    // itself (both mfa-verify and mfa-setup are NOT behind ProtectedRoute
    // in App.tsx, so this branch only matters if a future change moves
    // them behind it; kept as a safety net).
    if (location.pathname.startsWith("/admin/mfa-")) return <Outlet />;
    return <Navigate to={hasVerifiedMfaFactor ? "/admin/mfa-verify" : "/admin/mfa-setup"} replace />;
  }

  return <Outlet />;
};

function homeForRoleFallback(role: Role): string {
  if (ELEVATED_ROLES.includes(role)) return "/admin";
  if (role === "agency") return "/agency/dashboard";
  return "/";
}
