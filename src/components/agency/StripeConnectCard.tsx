import { ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  stripeAccountId: string;
  isConnecting: boolean;
  onConnect: () => void;
}

export function StripeConnectCard({ stripeAccountId, isConnecting, onConnect }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Stripe Payouts</CardTitle></CardHeader>
      <CardContent>
        {stripeAccountId ? (
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-green-700 dark:text-green-400">Stripe Connected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Account: <span className="font-mono">{stripeAccountId}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You're set up to receive payouts. The platform admin processes transfers to your account.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={onConnect} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Update Stripe Account
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Connect your Stripe account</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect Stripe to receive payouts directly to your bank account. You'll be redirected to
                Stripe's secure onboarding flow — it takes about 5 minutes.
              </p>
              <Button className="mt-4 gap-2" onClick={onConnect} disabled={isConnecting}>
                {isConnecting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                  : <><ExternalLink className="h-4 w-4" /> Connect Stripe</>}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
