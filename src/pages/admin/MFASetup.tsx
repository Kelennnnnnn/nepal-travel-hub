import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain, Shield, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function MFASetup() {
  const navigate = useNavigate();
  const [qrCode, setQrCode]     = useState<string | null>(null);
  const [secret, setSecret]     = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode]         = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(true);

  useEffect(() => {
    void enrollTOTP();
  }, []);

  const enrollTOTP = async () => {
    setIsEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setIsEnrolling(false);

    if (error || !data) {
      toast.error("Failed to start MFA setup. Please try again.");
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !code.trim()) return;
    setIsLoading(true);

    // Create a challenge then verify
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
      toast.error("Invalid code. Please check your authenticator app and try again.");
      return;
    }

    toast.success("MFA set up successfully! Your account is now protected.");
    navigate("/admin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-zinc-950">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
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
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-zinc-100">Set Up Two-Factor Auth</h2>
          <p className="text-zinc-400 text-sm">
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </div>

        {isEnrolling ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* QR Code */}
            {qrCode && (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-xl">
                  <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
                </div>
                {secret && (
                  <div className="text-center">
                    <p className="text-xs text-zinc-500 mb-1">Or enter this key manually:</p>
                    <code className="text-xs bg-zinc-800 text-zinc-300 px-3 py-1 rounded font-mono break-all">
                      {secret}
                    </code>
                  </div>
                )}
              </div>
            )}

            {/* Verify code */}
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Label htmlFor="code" className="text-zinc-300">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-center text-xl tracking-widest"
                  required
                />
                <p className="text-xs text-zinc-500 mt-1 text-center">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading || code.length < 6}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Activate MFA
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
