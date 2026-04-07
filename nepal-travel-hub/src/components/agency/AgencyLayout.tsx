import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AgencySidebar } from "./AgencySidebar";
import { Separator } from "@/components/ui/separator";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/authStore";

interface AgencyLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AgencyLayout({ children, title }: AgencyLayoutProps) {
  const { user } = useAuthStore();
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AG";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AgencySidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground" />
              <Separator orientation="vertical" className="h-5" />
              {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive border-2 border-background" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
