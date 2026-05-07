import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mountain, Mail, Lock, ArrowRight, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { signIn } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error, role } = await signIn(email, password);

    if (error) {
      toast.error("Invalid admin credentials");
      setIsLoading(false);
      return;
    }

    if (role !== "admin") {
      toast.error("Access denied. This portal is for administrators only.");
      await useAuthStore.getState().logout();
      setIsLoading(false);
      return;
    }

    // Check MFA enrollment status
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");

    setIsLoading(false);

    if (!verifiedTotp) {
      // Admin has no MFA enrolled — send to setup
      navigate("/admin/mfa-setup", { replace: true });
      return;
    }

    // Admin has MFA enrolled — require verification
    navigate("/admin/mfa-verify", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-zinc-950">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary">
              <Mountain className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-zinc-100">NepalTrails</span>
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
            <ShieldAlert className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-zinc-100">Admin Portal</h2>
          <p className="text-zinc-400">Restricted access area</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-zinc-300">Admin Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                id="email"
                type="email"
                placeholder="admin@nepaltrails.com"
                className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="text-zinc-300">Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pl-10 pr-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full mt-6" size="lg" disabled={isLoading} variant="destructive">
            {isLoading ? "Verifying..." : "Access Dashboard"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Return to standard login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
