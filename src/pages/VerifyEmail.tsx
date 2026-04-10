import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mountain, Mail, RefreshCw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const COOLDOWN_SECONDS = 60;

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";

  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // Tick down the cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) {
      toast.error("No email address found. Please sign up again.");
      return;
    }
    setIsResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setIsResending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verification email resent!");
    setCooldown(COOLDOWN_SECONDS);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Logo */}
        <Link to="/" className="inline-flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-primary">
            <Mountain className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">NepalTrails</span>
        </Link>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Mail className="h-10 w-10 text-primary" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a verification link to{" "}
            {email ? (
              <span className="font-medium text-foreground">{email}</span>
            ) : (
              "your email address"
            )}
          </p>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-xl border border-border p-5 text-left space-y-3">
          {[
            "Open the email from NepalTrails",
            'Click the "Confirm your email" link',
            "Return here and sign in",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-foreground">{step}</p>
            </div>
          ))}
        </div>

        {/* Resend */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Didn't receive it?</p>
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={isResending || cooldown > 0}
            onClick={handleResend}
          >
            {isResending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : cooldown > 0 ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isResending
              ? "Sending…"
              : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend verification email"}
          </Button>
        </div>

        {/* Back to login */}
        <p className="text-sm text-muted-foreground">
          Already verified?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>

        <p className="text-xs text-muted-foreground">
          Check your spam folder if you don't see the email within a few minutes.
        </p>
      </div>
    </div>
  );
}
