import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Mountain, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { invokeEdge } from "@/lib/edge";

// Public route (not behind ProtectedRoute — an invite link can land on
// someone with no session at all). Deliberately does NOT try to preserve
// the invite token across a sign-in redirect (no return-url mechanism
// exists anywhere in this app's auth flow to hook into without expanding
// scope well beyond audit M1) — an unauthenticated visitor is told to sign
// in and click the email link again, which works fine since the token is
// valid for 7 days, not single-use-across-navigation.
function CenteredMessage({
  icon, title, description, action,
}: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {action}
      </div>
    </div>
  );
}

export default function AcceptAgencyInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authLoading || !isAuthenticated || !token || status !== "idle") return;
    setStatus("accepting");
    (async () => {
      const { error } = await invokeEdge("agency-invitations", {
        body: { action: "accept", token },
      });
      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }
      setStatus("success");
      setTimeout(() => navigate("/agency/dashboard", { replace: true }), 1500);
    })();
  }, [authLoading, isAuthenticated, token, status, navigate]);

  if (authLoading) {
    return <CenteredMessage icon={<Loader2 className="h-8 w-8 animate-spin text-primary" />} title="Loading…" />;
  }

  if (!isAuthenticated) {
    return (
      <CenteredMessage
        icon={<Mountain className="h-10 w-10 text-primary" />}
        title="Sign in to accept this invitation"
        description="You need to be signed in to join this agency's team. After signing in, click the invitation link in your email again."
        action={<Button asChild><Link to="/login">Sign In</Link></Button>}
      />
    );
  }

  if (status === "idle" || status === "accepting") {
    return <CenteredMessage icon={<Loader2 className="h-8 w-8 animate-spin text-primary" />} title="Accepting invitation…" />;
  }

  if (status === "success") {
    return (
      <CenteredMessage
        icon={<CheckCircle2 className="h-10 w-10 text-primary" />}
        title="You're in!"
        description="Taking you to your agency dashboard…"
      />
    );
  }

  return (
    <CenteredMessage
      icon={<XCircle className="h-10 w-10 text-destructive" />}
      title="Couldn't accept this invitation"
      description={errorMessage}
      action={<Button asChild variant="outline"><Link to="/">Go home</Link></Button>}
    />
  );
}
