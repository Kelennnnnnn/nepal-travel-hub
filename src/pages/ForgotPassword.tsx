import { useState } from "react";
import { Link } from "react-router-dom";
import { Mountain, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });

    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
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
            <h1 className="text-4xl font-bold mb-4">Reset Your Password</h1>
            <p className="text-primary-foreground/80 max-w-md">
              We'll send a secure link to your email so you can get back to
              exploring Nepal.
            </p>
          </div>
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} NepalTrails. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary">
                <Mountain className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">NepalTrails</span>
            </Link>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-primary/10">
                  <CheckCircle className="h-10 w-10 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">Check your email</h2>
              <p className="text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                It may take a minute to arrive.
              </p>
              <p className="text-sm text-muted-foreground">
                Didn't receive it? Check your spam folder, or{" "}
                <button
                  className="text-primary hover:underline"
                  onClick={() => setSent(false)}
                >
                  try again
                </button>
                .
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Forgot your password?</h2>
                <p className="text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending…" : "Send Reset Link"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
