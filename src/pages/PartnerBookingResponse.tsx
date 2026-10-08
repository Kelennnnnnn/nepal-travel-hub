import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Loader2, CalendarDays, Users, Clock, CheckCircle2, XCircle, Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { bookingSummaryForToken, respondToBookingViaToken } from "@/lib/api/bookings";
import { formatTripDate as formatDate, formatDateTimeNpt as formatDeadline } from "@/lib/dates";

// Public route, no login required — the token itself is the credential
// (booking_summary_for_token/respond_via_token, migration
// 20260920000001). Deliberately minimal: no site header/footer, nothing
// beyond what an agency needs to decide and act, reachable from a one-tap
// email/SMS/WhatsApp link on a phone. Also disallowed in robots.txt (/r/)
// — the noindex meta here is defense-in-depth for any crawler that
// ignores that.

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="w-full max-w-md bg-card rounded-2xl border border-border/40 shadow-sm p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

export default function PartnerBookingResponse() {
  const { token } = useParams<{ token: string }>();
  const [outcome, setOutcome] = useState<"accepted" | "declined" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["booking-summary-for-token", token],
    queryFn: () => bookingSummaryForToken(token!),
    enabled: !!token && !outcome,
    retry: false,
  });

  const handleAccept = async () => {
    if (!token) return;
    setSubmitting(true);
    setActionError("");
    try {
      await respondToBookingViaToken(token, true);
      setOutcome("accepted");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    if (reason.trim().length < 10) {
      setActionError("Please explain why (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      await respondToBookingViaToken(token, false, reason.trim());
      setOutcome("declined");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (outcome === "accepted") {
    return (
      <Centered>
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <h1 className="text-lg font-bold">Booking confirmed</h1>
          <p className="text-sm text-muted-foreground">The traveler has been notified. Thanks for responding quickly.</p>
        </div>
      </Centered>
    );
  }

  if (outcome === "declined") {
    return (
      <Centered>
        <div className="flex flex-col items-center text-center gap-3">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-lg font-bold">Booking declined</h1>
          <p className="text-sm text-muted-foreground">The traveler's reservation fee is being refunded in full, and they've been shown similar activities.</p>
        </div>
      </Centered>
    );
  }

  if (isLoading) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Centered>
    );
  }

  if (error || !summary) {
    return (
      <Centered>
        <div className="flex flex-col items-center text-center gap-3">
          <XCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-lg font-bold">This link isn't valid</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "It may have expired or already been used."} Sign in to your agency dashboard to respond instead.
          </p>
          <Button asChild variant="outline"><Link to="/agency/login">Agency Sign In</Link></Button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="flex items-center gap-2 text-primary">
        <Mountain className="h-5 w-5" />
        <span className="font-bold">Into Nepal</span>
      </div>

      <div>
        <h1 className="text-lg font-bold mb-1">Confirm this booking?</h1>
        <p className="text-sm text-muted-foreground">{summary.traveler_first_name} has paid the reservation fee and is waiting on your response.</p>
      </div>

      <div className="space-y-2.5 text-sm bg-muted/40 rounded-xl p-4">
        <div className="flex items-center gap-2.5"><CalendarDays className="h-4 w-4 text-primary flex-shrink-0" /> {formatDate(summary.departure_date)}</div>
        <div className="flex items-center gap-2.5"><Users className="h-4 w-4 text-primary flex-shrink-0" /> {summary.participant_count} {summary.participant_count === 1 ? "traveler" : "travelers"}</div>
        <div className="flex items-center gap-2.5"><Clock className="h-4 w-4 text-primary flex-shrink-0" /> Respond by {formatDeadline(summary.agency_confirm_deadline)}</div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {!declining ? (
        <div className="flex gap-3">
          <Button className="flex-1" size="lg" onClick={handleAccept} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Accept
          </Button>
          <Button className="flex-1" size="lg" variant="outline" onClick={() => setDeclining(true)} disabled={submitting}>
            Decline
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Why can't you take this booking?</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Fully booked that date, guide unavailable…" />
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" variant="outline" onClick={() => { setDeclining(false); setActionError(""); }} disabled={submitting}>
              Back
            </Button>
            <Button className="flex-1" variant="destructive" onClick={handleDecline} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm Decline
            </Button>
          </div>
        </div>
      )}
    </Centered>
  );
}
