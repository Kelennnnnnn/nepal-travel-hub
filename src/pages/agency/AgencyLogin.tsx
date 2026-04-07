import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mountain, Mail, Lock, Building2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

export default function AgencyLogin() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Login State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup State
  const [businessName, setBusinessName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error, role } = await signIn(loginEmail, loginPassword);

    setIsLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    if (role !== "agency") {
      toast.error("No agency account found for this email. Please register your agency.");
      await useAuthStore.getState().logout();
      return;
    }

    toast.success("Welcome back to your Agency Dashboard!");
    navigate("/agency/dashboard");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error, requiresConfirmation } = await signUp({
      name: businessName,
      email: signupEmail,
      password: signupPassword,
      role: "agency",
      agencyName: businessName,
    });

    setIsLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    if (requiresConfirmation) {
      toast.success("Agency account created! Check your email to confirm your address before signing in.");
      return;
    }

    toast.success("Agency account created! Let's get you set up.");
    navigate("/agency/onboarding");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1200"
            alt="Nepal mountains"
            className="w-full h-full object-cover opacity-20 sepia"
          />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary-foreground/20">
              <Mountain className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold">NepalTrails</span>
          </Link>

          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 mb-6 backdrop-blur-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">
              Partner With Us
            </h1>
            <p className="text-primary-foreground/80 max-w-md text-lg">
              Manage your bookings, expand your reach, and grow your trekking agency with our comprehensive tools.
            </p>
          </div>

          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} NepalTrails. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-50 border-l">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary">
                <Mountain className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">NepalTrails</span>
            </Link>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2 text-zinc-900">Agency Portal</h2>
            <p className="text-zinc-500">
              Sign in to manage your listings and bookings
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Agency Sign In</TabsTrigger>
              <TabsTrigger value="signup">Register Agency</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="animate-in fade-in-50">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="loginEmail">Business Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="loginEmail"
                      type="email"
                      placeholder="contact@youragency.com"
                      className="pl-10"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="loginPassword">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="loginPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Access Agency Dashboard"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="animate-in fade-in-50">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <Label htmlFor="businessName">Registered Business Name</Label>
                  <p className="text-xs text-muted-foreground mb-2">This will be your agency display name.</p>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="businessName"
                      type="text"
                      placeholder="Himalayan Adventures Pvt. Ltd."
                      className="pl-10"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="signupEmail">Business Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signupEmail"
                      type="email"
                      placeholder="contact@himalayanadventures.com"
                      className="pl-10"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="signupPassword">Password</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signupPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? "Creating account..." : "Register Agency"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  By registering, you agree to our{" "}
                  <Link to="/terms" className="text-primary hover:underline">
                    Terms for Agencies
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
