import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mountain, Mail, Lock, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { loginSchema, signUpSchema, type LoginFormData, type SignUpFormData } from "@/lib/validations";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setIsGoogleLoading(false);
    if (error) toast.error(error);
    // on success Supabase redirects the browser — no navigate() needed
  };

  const handleLogin = async (data: LoginFormData) => {
    const { error, role } = await signIn(data.email, data.password);

    if (error) {
      toast.error(error);
      return;
    }

    if (role !== "user") {
      toast.error("This login is for travelers only. Please use the correct portal.");
      await useAuthStore.getState().logout();
      return;
    }

    toast.success("Welcome back!");
    navigate("/");
  };

  const handleSignup = async (data: SignUpFormData) => {
    const { error, requiresConfirmation } = await signUp({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    if (error) {
      toast.error(error);
      return;
    }

    if (requiresConfirmation) {
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
      return;
    }

    toast.success("Welcome to NepalTrails!");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1200"
            alt="Nepal mountains"
            className="w-full h-full object-cover opacity-40"
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
            <h1 className="text-4xl font-bold mb-4">
              Start Your Nepal Adventure Today
            </h1>
            <p className="text-primary-foreground/80 max-w-md">
              Join thousands of travelers who have discovered the magic of Nepal
              through our verified local agencies.
            </p>
          </div>

          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} NepalTrails. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
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
            <h2 className="text-2xl font-bold mb-2">Traveler Login</h2>
            <p className="text-muted-foreground">
              Sign in to manage your bookings and explore new adventures
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-10"
                      {...loginForm.register("email")}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      {...loginForm.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-destructive mt-1">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loginForm.formState.isSubmitting}>
                  {loginForm.formState.isSubmitting ? "Signing in..." : "Sign In"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button type="button" variant="outline" className="w-full" size="lg" disabled={isGoogleLoading} onClick={handleGoogleSignIn}>
                  <GoogleIcon />
                  <span className="ml-2">Continue with Google</span>
                </Button>

                <div className="mt-4 pt-4 border-t border-border flex flex-col items-center">
                  <span className="text-xs text-muted-foreground mb-2">Other sign in options:</span>
                  <div className="flex gap-4">
                    <Link to="/agency/login" className="text-sm text-primary hover:underline">Agency Login</Link>
                    <Link to="/admin/login" className="text-sm text-primary hover:underline">Admin Login</Link>
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUpForm.handleSubmit(handleSignup)} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      className="pl-10"
                      {...signUpForm.register("name")}
                    />
                  </div>
                  {signUpForm.formState.errors.name && (
                    <p className="text-xs text-destructive mt-1">{signUpForm.formState.errors.name.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-10"
                      {...signUpForm.register("email")}
                    />
                  </div>
                  {signUpForm.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">{signUpForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      {...signUpForm.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {signUpForm.formState.errors.password && (
                    <p className="text-xs text-destructive mt-1">{signUpForm.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={signUpForm.formState.isSubmitting}>
                  {signUpForm.formState.isSubmitting ? "Creating account..." : "Create Account"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button type="button" variant="outline" className="w-full" size="lg" disabled={isGoogleLoading} onClick={handleGoogleSignIn}>
                  <GoogleIcon />
                  <span className="ml-2">Sign up with Google</span>
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  By creating an account, you agree to our{" "}
                  <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </p>
                <div className="mt-4 pt-4 border-t border-border flex flex-col items-center">
                  <span className="text-xs text-muted-foreground mb-2">Are you an Agency?</span>
                  <Link to="/agency/login" className="text-sm text-primary hover:underline">Register your Business</Link>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
