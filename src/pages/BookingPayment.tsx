import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ── Inner payment form (must be inside <Elements>) ────────

function PaymentForm({ clientSecret, bookingId }: { clientSecret: string; bookingId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage("Card element not found. Please refresh and try again.");
      setIsProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      setErrorMessage(error.message || "Payment failed. Please try again.");
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // Update booking status to 'confirmed' and payment to 'paid'
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_status: "paid",
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Failed to update booking status:", updateError.message);
        // Payment succeeded but DB update failed — still navigate to confirmation
        toast.error("Payment succeeded but we had trouble updating your booking. Please contact support.");
      }

      toast.success("Payment successful! Your booking is confirmed.");
      navigate(`/booking/confirmation?id=${encodeURIComponent(bookingId)}`);
    } else {
      setErrorMessage("Payment was not completed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="text-sm font-medium mb-3 block">Card Details</label>
        <div className="border border-border rounded-lg p-4 bg-background focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "hsl(var(--foreground))",
                  "::placeholder": { color: "hsl(var(--muted-foreground))" },
                  fontFamily: "inherit",
                },
                invalid: { color: "hsl(var(--destructive))" },
              },
            }}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <Button
        type="submit"
        size="xl"
        className="w-full"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Processing Payment…
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 mr-2" />
            Pay Now
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Payments are securely processed by Stripe</span>
      </div>
    </form>
  );
}

// ── Main page component ───────────────────────────────────

export default function BookingPayment() {
  const [searchParams] = useSearchParams();
  const clientSecret = searchParams.get("clientSecret") || "";
  const bookingId = searchParams.get("bookingId") || "";

  if (!clientSecret || !bookingId) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid Payment Session</h1>
          <p className="text-muted-foreground mb-6">
            This payment link is invalid or has expired.
          </p>
          <Link to="/activities">
            <Button>Browse Activities</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pt-24 md:pt-32 pb-16">
        <div className="container mx-auto px-4 max-w-lg">
          <Card variant="elevated">
            <CardHeader className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl">Complete Your Booking</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">
                Enter your payment details below to confirm your adventure.
              </p>
            </CardHeader>
            <CardContent>
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentForm clientSecret={clientSecret} bookingId={bookingId} />
              </Elements>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
