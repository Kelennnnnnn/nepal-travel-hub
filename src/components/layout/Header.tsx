import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, User, LogIn, LayoutDashboard, LogOut, BookOpen, Heart, MessageSquare } from "lucide-react";
import { MobileMenu } from "./MobileMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useUnreadCount } from "@/hooks/useMessages";
import { toast } from "sonner";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Activities", href: "/activities" },
  { name: "IntoNepal", href: "/about" },
  { name: "Support", href: "/contact" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const { user, isAuthenticated, logout } = useAuthStore();
  const { data: unreadCount = 0 } = useUnreadCount();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    toast.success("Successfully logged out");
  };

  const getDashboardLink = () => {
    if (!user) return "/";
    switch (user.role) {
      case "admin": return "/admin";
      case "agency": return "/agency/dashboard";
      case "user": return "/";
      default: return "/";
    }
  };

  return (
    <header
      className={cn(
        "fixed top-8 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl transition-shadow duration-300",
        isScrolled ? "shadow-md" : "border-b border-border/70"
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 md:h-20 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <span className="flex flex-col leading-none">
              <span className="font-serif italic text-2xl font-bold text-primary">
                Into Nepal
              </span>
              <span className="hidden sm:block text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                Himalayan Expeditions
              </span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary pb-1 border-b-2",
                    isActive
                      ? "text-primary border-primary"
                      : "text-foreground/80 border-transparent"
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-5 shrink-0">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                    <Avatar className="h-10 w-10 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {user?.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground mt-1">
                        {user?.email}
                      </p>
                      <div className="mt-2 text-[10px] uppercase font-bold tracking-wider text-primary">
                        {user?.role} Account
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {user?.role !== "user" && (
                    <Link to={getDashboardLink()}>
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                      </DropdownMenuItem>
                    </Link>
                  )}

                  {user?.role === "user" && (
                    <>
                      <Link to="/messages">
                        <DropdownMenuItem className="cursor-pointer">
                          <MessageSquare className="mr-2 h-4 w-4" />
                          <span>Messages</span>
                          {unreadCount > 0 && (
                            <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
                              {unreadCount}
                            </span>
                          )}
                        </DropdownMenuItem>
                      </Link>
                      <Link to="/my-bookings">
                        <DropdownMenuItem className="cursor-pointer">
                          <BookOpen className="mr-2 h-4 w-4" />
                          <span>My Bookings</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link to="/wishlist">
                        <DropdownMenuItem className="cursor-pointer">
                          <Heart className="mr-2 h-4 w-4" />
                          <span>Saved</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link to="/account">
                        <DropdownMenuItem className="cursor-pointer">
                          <User className="mr-2 h-4 w-4" />
                          <span>My Account</span>
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link
                  to="/agency"
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
                >
                  List your property
                </Link>
                <Link to="/login">
                  <Button size="sm">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6 text-foreground" />
            ) : (
              <Menu className="h-6 w-6 text-foreground" />
            )}
          </button>
        </div>

        {isMobileMenuOpen && (
          <MobileMenu
            isAuthenticated={isAuthenticated}
            user={user}
            unreadCount={unreadCount}
            dashboardLink={getDashboardLink()}
            onClose={() => setIsMobileMenuOpen(false)}
            onLogout={handleLogout}
          />
        )}
      </div>
    </header>
  );
}
