import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  BookOpen,
  DollarSign,
  Settings,
  Mountain,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/useMessages";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard", url: "/agency/dashboard", icon: LayoutDashboard },
  { title: "Listings", url: "/agency/listings", icon: ListChecks },
  { title: "Bookings", url: "/agency/bookings", icon: BookOpen },
  { title: "Messages", url: "/agency/messages", icon: MessageSquare },
  { title: "Availability", url: "/agency/availability", icon: CalendarDays },
  { title: "Earnings", url: "/agency/earnings", icon: DollarSign },
  { title: "Settings", url: "/agency/settings", icon: Settings },
];

export function AgencySidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { data: unreadCount = 0 } = useUnreadCount();
  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out successfully");
    navigate("/agency/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border p-4">
        <NavLink to="/agency/dashboard" className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          {!collapsed && (
            <span className="text-lg font-bold text-foreground">
              Nepal<span className="text-primary">Trails</span>
            </span>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agency Portal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/agency/dashboard"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between">
                          {item.title}
                          {item.url === "/agency/messages" && unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
                              {unreadCount}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
