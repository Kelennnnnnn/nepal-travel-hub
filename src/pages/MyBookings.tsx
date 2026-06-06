import { useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calendar,
  Users,
  MapPin,
  Receipt,
  Clock,
  XCircle,
  Star,
  RefreshCw,
  PackageOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useCanReviewListing, useTravelerBookings } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────────

interface BookingListing {
  title: string;
  location: string;
  duration: string;
  images: string[];
  category: string;
}

interface Booking {
  id: string;
  booking_ref: string;
  listing_id: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  status: string;
  payment_status: string;
  traveler_name: string | null;
  traveler_email: string | null;
  traveler_phone: string | null;
  created_at: string;
  listing?: BookingListing | null;
}

// ── Helpers ─────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

function classifyBooking(b: Booking): "upcoming" | "completed" | "cancelled" {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "completed") return "completed";
  if (b.status === "confirmed" && b.trip_date < today) return "completed";
  return "upcoming";
}

function daysUntilTrip(tripDate: string) {
  return Math.floor((new Date(tripDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function refundPolicy(days: number): { pct: number; label: string } {
  if (days >= 7) return { pct: 100, label: "Full refund" };
  if (days >= 3) return { pct: 50, label: "50% refund" };
  return { pct: 0, label: "No refund" };
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return <Badge className="bg-green-100 text-green-700 border-green-200">Confirmed</Badge>;
    case "pending_payment": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending Payment</Badge>;
    case "completed": return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Completed</Badge>;
    case "cancelled": return <Badge className="bg-red-100 text-red-700 border-red-200">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function paymentBadge(ps: string) {
  switch (ps) {
    case "paid": return <Badge variant="outline" className="text-green-600 border-green-300">Paid</Badge>;
    case "refunded": return <Badge variant="outline" className="text-blue-600 border-blue-300">Refunded</Badge>;
    default: return <Badge variant="outline" className="text-amber-600 border-amber-300">Unpaid</Badge>;
  }
}

// ── Empty State ──────────────────────────────────────────────────

function EmptyState({ tab }: { tab: string }) {
  const copy: Record<string, { title: string; desc: string }> = {
    upcoming: { title: "No upcoming trips", desc: "Book an activity to start your adventure." },
    completed: { title: "No completed trips yet", desc: "Your past adventures will appear here." },
    cancelled: { title: "No cancelled bookings", desc: "Cancelled bookings will appear here." },
  };
  const { title, desc } = copy[tab] ?? copy.upcoming;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <PackageOpen className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6">{desc}</p>
      <Link to="/activities"><Button>Browse Activities</Button></Link>
    </div>
  );
}

// ── Booking Card ─────────────────────────────────────────────────

function BookingCard({ booking, onCancelled }: { booking: Booking; onCancelled: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const tab = classifyBooking(booking);
  const image = booking.listing?.images?.[0] || FALLBACK_IMAGE_URL;
  const days = daysUntilTrip(booking.trip_date);
  const { pct, label } = refundPolicy(days);
  const refundAmount = (booking.total_amount * pct) / 100;

  const canCancel = tab === "upcoming" && booking.status === "confirmed";
  const { data: canReview = false } = useCanReviewListing(
    tab === "completed" ? booking.listing_id : undefined
  );

  const handleCancel = async () => {
    setIsCancelling(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Not authenticated"); setIsCancelling(false); return; }

    const { error, data } = await supabase.functions.invoke("process-refund", {
      body: { booking_id: booking.id },
    });

    setIsCancelling(false);
    setCancelOpen(false);

    if (error) {
      toast.error(error.message || "Failed to cancel booking.");
      return;
    }

    const res = data as { refundAmount?: number; refundPercentage?: number; message?: string };
    if (res.refundAmount && res.refundAmount > 0) {
      toast.success(`Booking cancelled. $${res.refundAmount.toFixed(2)} refund (${res.refundPercentage}%) will appear in 5-10 business days.`);
    } else {
      toast.success(res.message || "Booking cancelled. No refund applicable.");
    }

    onCancelled();
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Thumbnail */}
        <div className="w-full sm:w-40 h-40 sm:h-auto flex-shrink-0">
          <img src={image} alt={booking.listing?.title} className="w-full h-full object-cover" />
        </div>

        {/* Content */}
        <CardContent className="flex-1 p-4 space-y-3">
          {/* Title & badges */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold text-base leading-tight">{booking.listing?.title || "Activity"}</h3>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                <MapPin className="h-3.5 w-3.5" />
                {booking.listing?.location || "Nepal"}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {statusBadge(booking.status)}
              {paymentBadge(booking.payment_status)}
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(booking.trip_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{booking.guests} guest{booking.guests > 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{booking.listing?.duration}</span>
            <span className="flex items-center gap-1"><Receipt className="h-3.5 w-3.5" />${Number(booking.total_amount).toFixed(2)}</span>
          </div>

          {/* Ref */}
          <p className="text-xs text-muted-foreground font-mono">Ref: {booking.booking_ref}</p>

          {/* Expanded details */}
          {expanded && (
            <div className="pt-2 border-t border-border text-sm space-y-1">
              <p><span className="text-muted-foreground">Price per person:</span> ${Number(booking.price_per_person).toFixed(2)}</p>
              <p><span className="text-muted-foreground">Total amount:</span> ${Number(booking.total_amount).toFixed(2)}</p>
              <p><span className="text-muted-foreground">Payment status:</span> {booking.payment_status}</p>
              <p><span className="text-muted-foreground">Booked on:</span> {new Date(booking.created_at).toLocaleDateString()}</p>
              <p><span className="text-muted-foreground">Traveler:</span> {booking.traveler_name}</p>
              {booking.traveler_email && <p><span className="text-muted-foreground">Email:</span> {booking.traveler_email}</p>}
              {booking.traveler_phone && <p><span className="text-muted-foreground">Phone:</span> {booking.traveler_phone}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide Details" : "View Details"}
            </Button>

            {canCancel && (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Cancel Booking
              </Button>
            )}

            {tab === "completed" && canReview && (
              <Link to={`/activities/${booking.listing_id}#review`}>
                <Button variant="outline" size="sm">
                  <Star className="h-3.5 w-3.5 mr-1" />
                  Write Review
                </Button>
              </Link>
            )}

            {(tab === "completed" || tab === "cancelled") && (
              <Link to={`/activities/${booking.listing_id}`}>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Rebook
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to cancel <strong>{booking.listing?.title}</strong> on <strong>{new Date(booking.trip_date).toLocaleDateString()}</strong>.</p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">Refund estimate:</p>
                  <p>{days >= 7 ? "≥7 days notice" : days >= 3 ? "3-6 days notice" : "<3 days notice"} → <span className="font-semibold">{label}</span></p>
                  {pct > 0
                    ? <p>You will receive <span className="font-semibold text-green-600">${refundAmount.toFixed(2)}</span> back within 5-10 business days.</p>
                    : <p className="text-muted-foreground">No refund applies for cancellations this close to the trip date.</p>
                  }
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cancelling…</> : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function MyBookings() {
  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading, isError } = useTravelerBookings();

  const upcoming = bookings.filter((b) => classifyBooking(b as Booking) === "upcoming");
  const completed = bookings.filter((b) => classifyBooking(b as Booking) === "completed");
  const cancelled = bookings.filter((b) => classifyBooking(b as Booking) === "cancelled");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bookings", "traveler"] });

  const renderList = (list: typeof bookings, tab: string) => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="flex">
                <Skeleton className="w-40 h-40 flex-shrink-0" />
                <div className="flex-1 p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-8 w-32" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-destructive font-medium mb-4">Failed to load bookings. Please try again.</p>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      );
    }
    if (list.length === 0) return <EmptyState tab={tab} />;
    return (
      <div className="space-y-4">
        {list.map((b) => (
          <BookingCard key={b.id} booking={b as Booking} onCancelled={refresh} />
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="pt-24 md:pt-32 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">My Bookings</h1>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <Tabs defaultValue="upcoming">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="upcoming">
                Upcoming {!isLoading && upcoming.length > 0 && <span className="ml-1.5 bg-primary/10 text-primary text-xs rounded-full px-1.5">{upcoming.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">{renderList(upcoming, "upcoming")}</TabsContent>
            <TabsContent value="completed">{renderList(completed, "completed")}</TabsContent>
            <TabsContent value="cancelled">{renderList(cancelled, "cancelled")}</TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
