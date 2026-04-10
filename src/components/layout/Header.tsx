import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Mountain, User, LogIn, LayoutDashboard, LogOut, BookOpen, Heart } from "lucide-react";
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
import { toast } from "sonner";

const navigation = [
  { name: "Activities", href: "/activities" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "For Agencies", href: "/agency" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";
  
  const { user, isAuthenticated, logout } = useAuthStore();

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
    switch(user.role) {
      case "admin": return "/admin";
      case "agency": return "/agency/dashboard";
      case "user": return "/";
      default: return "/";
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled || !isHome
          ? "bg-card/95 backdrop-blur-xl shadow-md"
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 md:h-20 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className={cn(
              "p-2 rounded-xl transition-colors",
              isScrolled || !isHome ? "bg-primary" : "bg-primary-foreground/20"
            )}>
              <Mountain className={cn(
                "h-6 w-6 transition-colors",
                isScrolled || !isHome ? "text-primary-foreground" : "text-primary-foreground"
              )} />
            </div>
            <span className={cn(
              "text-xl font-bold transition-colors",
              isScrolled || !isHome ? "text-foreground" : "text-primary-foreground"
            )}>
              NepalTrails
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  isScrolled || !isHome
                    ? "text-foreground/80"
                    : "text-primary-foreground/90 hover:text-primary-foreground"
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    "relative h-10 w-10 rounded-full",
                    !isScrolled && isHome && "hover:bg-primary-foreground/20"
                  )}>
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
                <Link to="/login">
                  <Button 
                    variant={isScrolled || !isHome ? "ghost" : "heroOutline"} 
                    size="sm"
                    className={cn(
                      !isScrolled && isHome && "text-primary-foreground"
                    )}
                  >
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
                <Link to="/agency/login">
                  <Button 
                    variant={isScrolled || !isHome ? "default" : "hero"} 
                    size="sm"
                  >
                    Agent Login
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className={cn(
                "h-6 w-6",
                isScrolled || !isHome ? "text-foreground" : "text-primary-foreground"
              )} />
            ) : (
              <Menu className={cn(
                "h-6 w-6",
                isScrolled || !isHome ? "text-foreground" : "text-primary-foreground"
              )} />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-slide-up bg-background">
            <nav className="flex flex-col gap-3">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className="text-foreground/80 hover:text-primary py-2 px-4 transition-colors font-medium text-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
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
                      <Link to={getDashboardLink()} onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant="outline" className="w-full justify-start">
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          {user?.role === 'admin' ? 'Admin Dashboard' : 'Agency Dashboard'}
                        </Button>
                      </Link>
                    )}

                    {user?.role === "user" && (
                      <>
                        <Link to="/my-bookings" onClick={() => setIsMobileMenuOpen(false)}>
                          <Button variant="outline" className="w-full justify-start">
                            <BookOpen className="mr-2 h-4 w-4" />
                            My Bookings
                          </Button>
                        </Link>
                        <Link to="/wishlist" onClick={() => setIsMobileMenuOpen(false)}>
                          <Button variant="outline" className="w-full justify-start">
                            <Heart className="mr-2 h-4 w-4" />
                            Saved
                          </Button>
                        </Link>
                        <Link to="/account" onClick={() => setIsMobileMenuOpen(false)}>
                          <Button variant="outline" className="w-full justify-start">
                            <User className="mr-2 h-4 w-4" />
                            My Account
                          </Button>
                        </Link>
                      </>
                    )}
                    
                    <Button onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }} variant="destructive" className="w-full justify-start mt-2">
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        <LogIn className="mr-2 h-4 w-4" />
                        Traveler Sign In
                      </Button>
                    </Link>
                    <Link to="/agency/login" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button className="w-full">
                        Agent Login
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
