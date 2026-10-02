import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Calendar,
  CreditCard,
  Settings,
  Users,
  ChevronLeft,
  Menu,
  LogOut,
  Bell,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuthStore } from "@/stores/authStore";

const adminNavItems = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Agencies", href: "/admin/agencies", icon: Building2 },
  { name: "Listings", href: "/admin/listings", icon: MapPin },
  { name: "Bookings", href: "/admin/bookings", icon: Calendar },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Reviews", href: "/admin/reviews", icon: MessageSquare },
  { name: "Settings", href: "/admin/settings", icon: Settings },
  { name: "Audit Log", href: "/admin/audit", icon: ClipboardList },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const handleIdle = useCallback(async () => {
    await supabase.auth.signOut();
    toast.info("Session expired due to inactivity. Please log in again.");
    navigate("/admin/login", { replace: true });
  }, [navigate]);

  useIdleTimer(handleIdle, IDLE_TIMEOUT_MS);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen transition-all duration-300 bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/admin" className="flex items-center min-w-0">
              {sidebarOpen ? (
                <BrandLogo variant="horizontal" colour="reversed" height={28} />
              ) : (
                <BrandLogo variant="mark" colour="reversed" height={28} />
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform",
                  !sidebarOpen && "rotate-180"
                )}
              />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {adminNavItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm">{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-3 border-t border-sidebar-border">
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">Back to Site</span>}
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          "transition-all duration-300",
          sidebarOpen ? "ml-64" : "ml-16"
        )}
      >
        {/* Header */}
        <header className="h-16 bg-card border-b border-border sticky top-0 z-30">
          <div className="h-full px-6 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-4 ml-auto">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs">
                  3
                </Badge>
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                  {user?.email?.charAt(0).toUpperCase() || "A"}
                </div>
                {sidebarOpen && (
                  <div className="hidden md:block">
                    <p className="text-sm font-medium">{user?.name || "Admin User"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <div className="max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
