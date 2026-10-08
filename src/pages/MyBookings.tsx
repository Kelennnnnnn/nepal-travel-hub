import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  PackageOpen, Loader2, MapPin, Users, Clock, Hourglass, Sparkles, Star,
  ShieldAlert, ChevronDown, ChevronUp, RefreshCw, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type BookingStatus, type TravelerBooking } from "@/stores/bookingsStore";
import { formatPrice } from "@/lib/currency";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import {
  suggestAlternatives, type AlternativeListing,
  computeTravelerCancellation, type CancellationPreview, travelerCancelBooking,
  bookingPolicySummary, getOpenDisruption, type OpenDisruption,
  travelerReschedule, travelerChooseRefund,
  travelerDisputeNoShow, travelerReportAgencyNoShow,
} from "@/lib/api/bookings";
import { supabase } from "@/lib/supabase";
import { formatTripDate as formatDate, formatDateTimeNpt } from "@/lib/dates";

const STATUS_BADGE: Record<BookingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_payment: { label: "Payment pending", className: "bg-warning text-warning-foreground" },
  payment_processing: { label: "Processing payment", className: "bg-warning text-warning-foreground" },
  awaiting_agency_confirmation: { label: "Reserved — agency confirming", className: "bg-secondary text-secondary-foreground" },
  confirmed: { label: "Confirmed", className: "bg-success text-success-foreground" },
  cancel_requested: { label: "Needs your choice", className: "bg-warning text-warning-foreground" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success text-success-foreground" },
  no_show: { label: "No-show", className: "bg-destructive/10 text-destructive" },
  disputed: { label: "Disputed", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Hold expired", className: "bg-muted text-muted-foreground" },
};

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (secondsLeft <= 0) return <span className="text-xs text-destructive font-medium">Hold expired</span>;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return (
    <span className="text-xs text-warning-foreground font-mono font-semibold">
      {m}:{s.toString().padStart(2, "0")} left to pay
    </span>
  );
}

function ConfirmDeadline({ deadline }: { deadline: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const msLeft = new Date(deadline).getTime() - Date.now();
  if (msLeft <= 0) return <span className="text-xs text-muted-foreground">Response pending</span>;
  const hours = Math.floor(msLeft / 3_600_000);
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000);
  return <span className="text-xs text-muted-foreground">Responding within {hours}h {minutes}m</span>;
}

const ALTERNATIVE_REASON_CODES = new Set(["agency_declined", "agency_no_response"]);

function AlternativesPanel({ bookingId }: { bookingId: string }) {
  const [alternatives, setAlternatives] = useState<AlternativeListing[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const handleShow = async () => {
    setShown(true);
    if (alternatives !== null) return;
    setIsLoading(true);
    try {
      setAlternatives(await suggestAlternatives(bookingId));
    } catch {
      setAlternatives([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!shown) {
    return (
      <Button size="sm" variant="outline" onClick={handleShow} className="mt-3">
        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> See similar activities
      </Button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !alternatives || alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">No similar activities available right now.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {alternatives.map((alt) => (
            <Link
              key={alt.listing_id}
              to={`/activities/${alt.listing_id}`}
              className="flex gap-2.5 p-2 rounded-xl border border-border/40 hover:border-primary/40 transition-colors"
            >
              <img src={alt.images?.[0] ?? FALLBACK_IMAGE_URL} alt={alt.title} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug truncate">{alt.title}</p>
                <p className="text-xs text-muted-foreground truncate">{alt.agency_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-semibold">{formatPrice(alt.base_price)}</span>
                  {alt.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-warning text-warning" /> {alt.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface RefundRow {
  id: string;
  kind: string;
  payer_side: string;
  amount: number;
  currency: string;
  status: string;
}

function RefundStatusList({ bookingId }: { bookingId: string }) {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);

  useEffect(() => {
    supabase
      .from("refund_records")
      .select("id, kind, payer_side, amount, currency, status")
      .eq("booking_id", bookingId)
      .then(({ data }) => setRefunds((data ?? []) as RefundRow[]));
  }, [bookingId]);

  if (refunds.length === 0) return null;

  const copyFor = (r: RefundRow) => {
    if (r.payer_side === "platform") {
      if (r.status === "pending_provider") return "Refund approved — processing starts when online payments launch.";
      if (r.status === "processing") return "Refund is processing.";
      if (r.status === "succeeded") return "Refunded.";
      return "Refund failed — contact support.";
    }
    if (r.status === "agency_owed") return "The agency owes you this balance refund directly.";
    if (r.status === "settled_by_agency") return "Settled by the agency.";
    return "Being recovered from the agency.";
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
      {refunds.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Banknote className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{formatPrice(r.amount)} ({r.kind === "reservation_fee" ? "fee" : "balance"}) — {copyFor(r)}</span>
        </div>
      ))}
    </div>
  );
}

function PolicySummary({ bookingId }: { bookingId: string }) {
  const [sentences, setSentences] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && sentences === null) {
      try { setSentences(await bookingPolicySummary(bookingId)); } catch { setSentences([]); }
    }
  };

  return (
    <div className="mt-2">
      <button onClick={handleToggle} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        Cancellation policy {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          {sentences === null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sentences.map((s, i) => <p key={i}>{s}</p>)}
        </div>
      )}
    </div>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: TravelerBooking; onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    computeTravelerCancellation(booking.id).then(setPreview).catch(() => setPreview(null));
  }, [booking.id]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await travelerCancelBooking(booking.id, reason || undefined);
      toast.success("Booking cancelled.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel the booking.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalBack = preview ? (booking.quote ? booking.quote.platform_fee * (preview.fee_refund_percent / 100) + booking.quote.agency_balance * (preview.balance_refund_percent / 100) : 0) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel {booking.booking_ref}?</DialogTitle></DialogHeader>
        {preview === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{preview.explanation}</p>
            {totalBack !== null && totalBack > 0 && (
              <p className="text-sm font-semibold">You'll get back {formatPrice(totalBack)}.</p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Back</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isSubmitting || preview === null}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementDialog({
  title, placeholder, onSubmit, onClose,
}: { title: string; placeholder: string; onSubmit: (statement: string) => Promise<void>; onClose: () => void }) {
  const [statement, setStatement] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (statement.trim().length < 20) { toast.error("Please explain in at least 20 characters."); return; }
    setIsSubmitting(true);
    try {
      await onSubmit(statement.trim());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={4} placeholder={placeholder} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Back</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisruptionChoice({ booking, onDone }: { booking: TravelerBooking; onDone: () => void }) {
  const [disruption, setDisruption] = useState<OpenDisruption | null>(null);
  const [newDate, setNewDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getOpenDisruption(booking.id).then(setDisruption).catch(() => setDisruption(null));
  }, [booking.id]);

  if (!disruption) return null;

  const handleReschedule = async () => {
    if (!newDate) { toast.error("Pick a new date first."); return; }
    setIsSubmitting(true);
    try {
      await travelerReschedule(booking.id, newDate);
      toast.success("Rescheduled — same price, new date.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That date isn't available. Try another.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefund = async () => {
    setIsSubmitting(true);
    try {
      await travelerChooseRefund(booking.id);
      toast.success("Refund requested.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request a refund.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40 bg-warning/5 -mx-4 -mb-4 px-4 pb-4 rounded-b-2xl space-y-2.5">
      <p className="text-sm font-medium flex items-center gap-1.5"><ShieldAlert className="h-4 w-4 text-warning-foreground" /> The operator can't run this trip as planned</p>
      <p className="text-xs text-muted-foreground">{disruption.note || "Due to weather, flight, or safety conditions."} Choose a new date for free, or get a full refund, by {formatDateTimeNpt(disruption.choice_deadline)}.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40 h-9" min={new Date().toISOString().slice(0, 10)} />
        <Button size="sm" onClick={handleReschedule} disabled={isSubmitting}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Change Date (Free)
        </Button>
        <Button size="sm" variant="outline" onClick={handleRefund} disabled={isSubmitting}>Refund Instead</Button>
      </div>
    </div>
  );
}

function BookingCard({ booking, onChanged }: { booking: TravelerBooking; onChanged: () => void }) {
  const badge = STATUS_BADGE[booking.booking_status];
  const image = booking.listing?.images?.[0] ?? FALLBACK_IMAGE_URL;
  const isPendingPayment = booking.booking_status === "pending_payment";
  const isAwaitingAgency = booking.booking_status === "awaiting_agency_confirmation";
  const isCancellable = booking.booking_status === "confirmed" || booking.booking_status === "awaiting_agency_confirmation";
  const canReportNoShow = booking.booking_status === "confirmed" || booking.booking_status === "in_progress";
  const canDisputeNoShow = booking.booking_status === "no_show" && booking.no_show_dispute_deadline && new Date(booking.no_show_dispute_deadline) > new Date();
  const showAlternatives = booking.booking_status === "cancelled" && !!booking.cancellation_reason_code && ALTERNATIVE_REASON_CODES.has(booking.cancellation_reason_code);

  const [showCancel, setShowCancel] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [showReport, setShowReport] = useState(false);

  return (
    <div className="p-4 rounded-2xl border border-border/40 bg-card">
      <div className="flex gap-4">
        <img src={image} alt={booking.listing?.title ?? ""} className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold leading-snug">{booking.listing?.title ?? "Untitled activity"}</h3>
              <p className="text-xs text-muted-foreground">{booking.booking_ref}</p>
            </div>
            <Badge className={badge.className}>{badge.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            {booking.departure?.departure_date && (
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDate(booking.departure.departure_date)}</span>
            )}
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {booking.participant_count} {booking.participant_count === 1 ? "traveler" : "travelers"}</span>
            {booking.listing?.location && (
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {booking.listing.location}</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-sm">
              {booking.quote && (
                <span className="font-semibold">{formatPrice(booking.quote.amount_due_now)}</span>
              )}
              {booking.quote && <span className="text-muted-foreground"> due now</span>}
            </div>
            {isPendingPayment && booking.quote && (
              <div className="flex items-center gap-3">
                <HoldCountdown expiresAt={booking.quote.expires_at} />
                <Link to={`/booking/${booking.id}/checkout`}>
                  <Button size="sm">Continue</Button>
                </Link>
              </div>
            )}
            {isAwaitingAgency && booking.agency_confirm_deadline && (
              <div className="flex items-center gap-1.5">
                <Hourglass className="h-3.5 w-3.5 text-secondary" />
                <ConfirmDeadline deadline={booking.agency_confirm_deadline} />
              </div>
            )}
          </div>
          {isAwaitingAgency && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Your reservation fee is paid. The agency is reviewing your request — if they can't confirm it, you'll be refunded in full.
            </p>
          )}

          {(isCancellable || canReportNoShow || canDisputeNoShow) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isCancellable && <Button size="sm" variant="outline" onClick={() => setShowCancel(true)}>Cancel Booking</Button>}
              {canReportNoShow && <Button size="sm" variant="outline" onClick={() => setShowReport(true)}>Operator Didn't Show Up</Button>}
              {canDisputeNoShow && <Button size="sm" variant="destructive" onClick={() => setShowDispute(true)}>Dispute This</Button>}
            </div>
          )}

          {isCancellable && <PolicySummary bookingId={booking.id} />}
          {showAlternatives && <AlternativesPanel bookingId={booking.id} />}
          <RefundStatusList bookingId={booking.id} />
        </div>
      </div>

      {booking.booking_status === "cancel_requested" && <DisruptionChoice booking={booking} onDone={onChanged} />}

      {showCancel && <CancelDialog booking={booking} onClose={() => setShowCancel(false)} onDone={() => { setShowCancel(false); onChanged(); }} />}
      {showDispute && (
        <StatementDialog
          title="Dispute this no-show"
          placeholder="Explain what actually happened — e.g. you were there on time, with details that help us verify."
          onSubmit={async (s) => { await travelerDisputeNoShow(booking.id, s); toast.success("Dispute submitted."); onChanged(); }}
          onClose={() => setShowDispute(false)}
        />
      )}
      {showReport && (
        <StatementDialog
          title="Report that the operator didn't show up"
          placeholder="Explain what happened — when you arrived, how long you waited, any attempts to contact the agency."
          onSubmit={async (s) => { await travelerReportAgencyNoShow(booking.id, s); toast.success("Report submitted."); onChanged(); }}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

export default function MyBookings() {
  const { travelerBookings, isLoading, fetchTravelerBookings } = useBookingsStore();

  useEffect(() => { fetchTravelerBookings(); }, [fetchTravelerBookings]);

  return (
    <Layout>
      <div className="pt-32 md:pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-2xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground mb-8">Track and manage your upcoming adventures</p>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : travelerBookings.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl">
              <PackageOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">No bookings yet</p>
              <p className="text-sm text-muted-foreground mb-4">Your reservations will appear here once you book an activity.</p>
              <Link to="/activities"><Button>Browse Activities</Button></Link>
            </div>
          ) : (
            <div className="space-y-3">
              {travelerBookings.map((b) => <BookingCard key={b.id} booking={b} onChanged={() => fetchTravelerBookings()} />)}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
