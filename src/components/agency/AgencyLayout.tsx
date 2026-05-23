import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Mountain,
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  BookOpen,
  DollarSign,
  Settings,
  ChevronLeft,
  Menu,
  LogOut,
  Bell,
  MessageSquare,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useUnreadCount } from "@/hooks/useMessages";
import { toast } from "sonner";

const agencyNavItems = [
  { name: "Dashboard",    href: "/agency/dashboard",    icon: LayoutDashboard },
  { name: "Analytics",   href: "/agency/analytics",    icon: BarChart2 },
  { name: "Listings",    href: "/agency/listings",     icon: ListChecks },
  { name: "Bookings",    href: "/agency/bookings",     icon: BookOpen },
  { name: "Messages",    href: "/agency/messages",     icon: MessageSquare },
  { name: "Availability",href: "/agency/availability", icon: CalendarDays },
  { name: "Earnings",    href: "/agency/earnings",     icon: DollarSign },
  { name: "Settings",    href: "/agency/settings",     icon: Settings },
];

interface AgencyLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AgencyLayout({ children, title }: AgencyLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { data: unreadCount = 0 } = useUnreadCount();

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AG";

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out successfully");
    navigate("/agency/login");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen transition-all duration-300 bg-card border-r border-border",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <Link to="/agency/dashboard" className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-primary flex-shrink-0">
                <Mountain className="h-5 w-5 text-primary-foreground" />
              </div>
              {sidebarOpen && (
                <span className="font-bold text-sm truncate">Agency Portal</span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 flex-shrink-0"
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
            {agencyNavItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <span className="text-sm flex-1 flex items-center justify-between">
                      {item.name}
                      {item.href === "/agency/messages" && unreadCount > 0 && (
                        <Badge
                          className={cn(
                            "h-5 min-w-5 px-1 text-xs flex items-center justify-center",
                            isActive
                              ? "bg-primary-foreground text-primary"
                              : "bg-primary text-primary-foreground"
                          )}
                        >
                          {unreadCount}
                        </Badge>
                      )}
                    </span>
                  )}
                  {/* Collapsed unread dot */}
                  {!sidebarOpen && item.href === "/agency/messages" && unreadCount > 0 && (
                    <span className="absolute left-8 top-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Sign Out */}
          <div className="p-3 border-t border-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">Sign Out</span>}
            </button>
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
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              {title && (
                <h1 className="text-lg font-semibold text-foreground">{title}</h1>
              )}
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <Link to="/agency/messages" className="relative">
                <Button variant="ghost" size="icon">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                  {initials}
                </div>
                {sidebarOpen && (
                  <div className="hidden md:block">
                    <p className="text-sm font-medium leading-none">{user?.name ?? "Agency"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{user?.email ?? ""}</p>
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
