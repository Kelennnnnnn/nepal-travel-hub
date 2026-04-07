import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore, Role } from "@/stores/authStore";

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    if (allowedRoles?.includes("admin")) return <Navigate to="/admin/login" replace />;
    if (allowedRoles?.includes("agency")) return <Navigate to="/agency/login" replace />;
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    switch (user.role) {
      case "admin":
        return <Navigate to="/admin" replace />;
      case "agency":
        return <Navigate to="/agency/dashboard" replace />;
      case "user":
      default:
        return <Navigate to="/" replace />;
    }
  }

  return <Outlet />;
};
