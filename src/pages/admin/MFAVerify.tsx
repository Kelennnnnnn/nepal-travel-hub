import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function MFAVerify() {
  const navigate = useNavigate();
  const [code, setCode]         = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void loadFactors();
  }, []);

  const loadFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return;
    const totp = data.totp.find((f) => f.status === "verified");
    if (!totp) {
      // No verified factor — redirect to setup
      navigate("/admin/mfa-setup", { replace: true });
      return;
    }
    setFactorId(totp.id);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !code.trim()) return;
    setIsLoading(true);

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) {
      toast.error(challengeErr?.message ?? "Failed to create MFA challenge.");
      setIsLoading(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    setIsLoading(false);

    if (verifyErr) {
      toast.error("Invalid code. Please try again.");
      setCode("");
      return;
    }

    navigate("/admin", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-zinc-950">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary">
              <Mountain className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-zinc-100">NepalTrails</span>
          </div>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-zinc-100">Verify Identity</h2>
          <p className="text-zinc-400 text-sm">
            Enter the 6-digit code from your authenticator app to continue
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <Label htmlFor="code" className="text-zinc-300">Authentication Code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-center text-2xl tracking-widest"
              autoFocus
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isLoading || code.length < 6 || !factorId}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Verify
          </Button>
        </form>
      </div>
    </div>
  );
}
