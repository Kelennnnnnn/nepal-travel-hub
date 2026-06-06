import { Link } from "react-router-dom";
import { LogIn, LogOut, LayoutDashboard, MessageSquare, BookOpen, Heart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navigation = [
  { name: "Activities", href: "/activities" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "For Agencies", href: "/agency" },
];

interface AuthUser {
  name?: string;
  role?: string;
}

interface Props {
  isAuthenticated: boolean;
  user: AuthUser | null;
  unreadCount: number;
  dashboardLink: string;
  onClose: () => void;
  onLogout: () => void;
}

export function MobileMenu({ isAuthenticated, user, unreadCount, dashboardLink, onClose, onLogout }: Props) {
  return (
    <div className="md:hidden py-4 border-t border-border/50 animate-slide-up bg-background">
      <nav className="flex flex-col gap-3">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className="text-foreground/80 hover:text-primary py-2 px-4 transition-colors font-medium text-lg"
            onClick={onClose}
          >
            {item.name}
          </Link>
        ))}
        <div className="flex flex-col gap-3 py-4 px-4 border-t border-border/50 mt-2">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 mb-2 px-2">
                <Avatar className="h-10 w-10 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{user?.name}</span>
                  <span className="text-xs text-muted-foreground uppercase">{user?.role}</span>
                </div>
              </div>

              {user?.role !== "user" && (
                <Link to={dashboardLink} onClick={onClose}>
                  <Button variant="outline" className="w-full justify-start">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    {user?.role === "admin" ? "Admin Dashboard" : "Agency Dashboard"}
                  </Button>
                </Link>
              )}

              {user?.role === "user" && (
                <>
                  <Link to="/messages" onClick={onClose}>
                    <Button variant="outline" className="w-full justify-start">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      <span className="flex-1 text-left">Messages</span>
                      {unreadCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
                          {unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/my-bookings" onClick={onClose}>
                    <Button variant="outline" className="w-full justify-start">
                      <BookOpen className="mr-2 h-4 w-4" /> My Bookings
                    </Button>
                  </Link>
                  <Link to="/wishlist" onClick={onClose}>
                    <Button variant="outline" className="w-full justify-start">
                      <Heart className="mr-2 h-4 w-4" /> Saved
                    </Button>
                  </Link>
                  <Link to="/account" onClick={onClose}>
                    <Button variant="outline" className="w-full justify-start">
                      <User className="mr-2 h-4 w-4" /> My Account
                    </Button>
                  </Link>
                </>
              )}

              <Button
                onClick={() => { onLogout(); onClose(); }}
                variant="destructive"
                className="w-full justify-start mt-2"
              >
                <LogOut className="mr-2 h-4 w-4" /> Log Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={onClose}>
                <Button variant="outline" className="w-full">
                  <LogIn className="mr-2 h-4 w-4" /> Traveler Sign In
                </Button>
              </Link>
              <Link to="/agency/login" onClick={onClose}>
                <Button className="w-full">Agent Login</Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
