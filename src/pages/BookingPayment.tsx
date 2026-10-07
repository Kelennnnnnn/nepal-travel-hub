import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, Users, CalendarDays, ShieldCheck, Hourglass, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getBookingHoldStatus, releaseBookingHold, bookingPolicySummary } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/currency";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";

interface CheckoutBooking {
  id: string;
  booking_ref: string;
  participant_count: number;
  booking_status: string;
  listing: { title: string; images: string[]; location: string } | null;
  quote: {
    product_value: number;
    platform_fee: number;
    agency_balance: number;
    amount_due_now: number;
    currency: string;
    confirmation_mode: string;
    payment_requirement: string;
    start_at: string;
    no_show_grace_minutes: number;
    fee_refund_rule: { free_cancel_hours?: number } | null;
    expires_at: string;
  } | null;
}

const POLL_INTERVAL_MS = 15000;

export default function BookingPayment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<CheckoutBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [serverSeconds, setServerSeconds] = useState<number | null>(null);
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const [, setTick] = useState(0);
  const [policySentences, setPolicySentences] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase
      .from("bookings")
      .select(
        "id, booking_ref, participant_count, booking_status, " +
          "listing:listings(title, images, location), " +
          "quote:booking_quotes(product_value, platform_fee, agency_balance, amount_due_now, currency, confirmation_mode, payment_requirement, start_at, no_show_grace_minutes, fee_refund_rule, expires_at)"
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setNotFound(true); setIsLoading(false); return; }
        setBooking(data as unknown as CheckoutBooking);
        setIsLoading(false);
      });
    bookingPolicySummary(id).then(setPolicySentences).catch(() => setPolicySentences([]));
    return () => { cancelled = true; };
  }, [id]);

  const poll = useCallback(async () => {
    if (!id) return;
    try {
      const status = await getBookingHoldStatus(id);
      setLiveStatus(status.booking_status);
      setServerSeconds(status.seconds_remaining);
      setSyncedAt(Date.now());
    } catch {
      // A booking that's no longer the caller's own, or has been deleted,
      // simply stops updating the countdown rather than spamming the
      // console — the static fields already loaded still render.
    }
  }, [id]);

  useEffect(() => {
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    const heartbeat = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(heartbeat);
  }, []);

  const displaySeconds =
    serverSeconds === null ? null : Math.max(0, serverSeconds - Math.floor((Date.now() - syncedAt) / 1000));
  const expired = displaySeconds !== null && displaySeconds <= 0;
  const currentStatus = liveStatus ?? booking?.booking_status ?? null;

  const handleRelease = async () => {
    if (!id) return;
    setIsReleasing(true);
    try {
      await releaseBookingHold(id);
      toast.success("Hold released.");
      navigate("/my-bookings");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release the hold.");
    } finally {
      setIsReleasing(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center pt-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (notFound || !booking) {
    return (
      <Layout>
        <div className="pt-32 md:pt-40 pb-16">
          <div className="container mx-auto px-4 max-w-md text-center">
            <h1 className="text-xl font-bold mb-2">Booking not found</h1>
            <p className="text-muted-foreground mb-6">This checkout link is no longer valid.</p>
            <Link to="/activities"><Button variant="outline">Browse Activities</Button></Link>
          </div>
        </div>
      </Layout>
    );
  }

  const { quote } = booking;
  const image = booking.listing?.images?.[0] ?? FALLBACK_IMAGE_URL;

  return (
    <Layout>
      <div className="pt-28 md:pt-32 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="flex items-center gap-4 mb-8">
            <img src={image} alt={booking.listing?.title ?? ""} className="w-16 h-16 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold leading-snug">{booking.listing?.title ?? "Activity"}</h1>
              <p className="text-sm text-muted-foreground">{booking.booking_ref}</p>
            </div>
          </div>

          {currentStatus !== "pending_payment" || expired ? (
            <Card className="border-destructive/30">
              <CardContent className="py-10 text-center">
                <Hourglass className="h-10 w-10 mx-auto mb-3 text-destructive" />
                <h2 className="text-lg font-bold mb-2">
                  {expired || currentStatus === "expired" ? "Hold expired — pick the date again" : "This hold is no longer active"}
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  {expired || currentStatus === "expired"
                    ? "Your reservation window ran out before payment. No charge was made — choose a date again to start a new hold."
                    : `Current status: ${currentStatus}.`}
                </p>
                <Link to="/activities"><Button>Browse Activities</Button></Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Countdown */}
              <div className="flex items-center justify-center gap-3 py-6 rounded-2xl bg-primary/5 border border-primary/20">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-3xl font-mono font-extrabold tabular-nums text-primary">
                  {displaySeconds !== null
                    ? `${Math.floor(displaySeconds / 60)}:${(displaySeconds % 60).toString().padStart(2, "0")}`
                    : "--:--"}
                </span>
                <span className="text-sm text-muted-foreground">to complete payment</span>
              </div>

              {/* Trip details */}
              <Card>
                <CardHeader><CardTitle className="text-base">Trip Details</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span>
                      {quote && new Date(quote.start_at).toLocaleString("en-US", {
                        timeZone: "Asia/Kathmandu", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })} (Nepal time)
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 text-primary" />
                    <span>{booking.participant_count} {booking.participant_count === 1 ? "traveler" : "travelers"}</span>
                  </div>
                  {booking.listing?.location && (
                    <div className="flex items-center gap-2.5 text-muted-foreground">{booking.listing.location}</div>
                  )}
                </CardContent>
              </Card>

              {/* Price breakdown */}
              {quote && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Price Breakdown</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total trip price</span><span className="font-medium">{formatPrice(quote.product_value)}</span></div>
                    {quote.payment_requirement === "full_online" ? (
                      <div className="flex justify-between font-semibold text-base pt-2 border-t border-border/50">
                        <span>Paid in full online</span><span>{formatPrice(quote.amount_due_now)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Reservation fee (due now)</span><span className="font-semibold">{formatPrice(quote.amount_due_now)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Balance (due later, to the agency)</span><span>{formatPrice(quote.agency_balance)}</span></div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Terms */}
              {policySentences.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Cancellation & No-Show Terms</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {policySentences.map((sentence, i) => <p key={i}>{sentence}</p>)}
                    {quote && (
                      <p>
                        {quote.confirmation_mode === "agency_confirm"
                          ? "This activity requires the agency to confirm your booking after payment."
                          : "This activity confirms automatically once payment is received."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="space-y-3">
                <Button size="lg" className="w-full h-14 text-base font-bold gap-2" disabled>
                  <CreditCard className="h-5 w-5" /> Online payment coming soon
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRelease}
                  disabled={isReleasing}
                >
                  {isReleasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Release hold
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
