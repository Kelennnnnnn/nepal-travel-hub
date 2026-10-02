import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  BookOpen,
  DollarSign,
  Settings,
  LogOut,
  MessageSquare,
  BarChart2,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/useMessages";
import { NavLink } from "@/components/NavLink";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useNavigate } from "react-router-dom";
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
  { title: "Dashboard",   url: "/agency/dashboard",  icon: LayoutDashboard },
  { title: "Analytics",   url: "/agency/analytics",  icon: BarChart2 },
  { title: "Listings",    url: "/agency/listings",   icon: ListChecks },
  { title: "Bookings",    url: "/agency/bookings",   icon: BookOpen },
  { title: "Messages",    url: "/agency/messages",   icon: MessageSquare },
  { title: "Availability",url: "/agency/availability",icon: CalendarDays },
  { title: "Earnings",    url: "/agency/earnings",   icon: DollarSign },
  { title: "Settings",    url: "/agency/settings",   icon: Settings },
];

export function AgencySidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { data: unreadCount = 0 } = useUnreadCount();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out successfully");
    navigate("/agency/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <NavLink to="/agency/dashboard" className="flex items-center">
          {collapsed ? (
            <BrandLogo variant="mark" colour="reversed" height={28} />
          ) : (
            <BrandLogo variant="horizontal" colour="reversed" height={28} />
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
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium"
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

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
