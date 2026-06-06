import { ExternalLink, Loader2, Separator as SeparatorIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

const statusConfig: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Pending",   className: "bg-amber-100 text-amber-700" },
  confirmed:       { label: "Confirmed", className: "bg-blue-100 text-blue-700" },
  completed:       { label: "Completed", className: "bg-green-100 text-green-700" },
  cancelled:       { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

const paymentConfig: Record<string, { label: string; className: string }> = {
  unpaid:   { label: "Unpaid",   className: "bg-amber-100 text-amber-700" },
  paid:     { label: "Paid",     className: "bg-green-100 text-green-700" },
  refunded: { label: "Refunded", className: "bg-purple-100 text-purple-700" },
};

export interface AdminBooking {
  id: string;
  booking_ref: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  commission_amount: number;
  net_payout: number;
  status: string;
  payment_status: string;
  payment_intent_id: string | null;
  traveler_name: string | null;
  traveler_email: string | null;
  traveler_phone: string | null;
  special_requests: string | null;
  cancellation_reason: string | null;
  created_at: string;
  agency_id: string;
  agency_name: string;
  listing_title: string;
  listing_category: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, className: "" };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
}

function PaymentBadge({ status }: { status: string }) {
  const cfg = paymentConfig[status] ?? { label: status, className: "" };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: AdminBooking | null;
  overrideStatus: string;
  onOverrideStatusChange: (status: string) => void;
  overrideLoading: boolean;
  refundLoading: boolean;
  onOverrideStatus: () => void;
  onRefund: () => void;
}

export function BookingDetailSheet({
  open, onOpenChange, booking,
  overrideStatus, onOverrideStatusChange,
  overrideLoading, refundLoading,
  onOverrideStatus, onRefund,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
        {booking && (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <SheetTitle className="font-mono text-base">{booking.booking_ref}</SheetTitle>
                <StatusBadge status={booking.status} />
                <PaymentBadge status={booking.payment_status} />
              </div>
              <SheetDescription className="text-left">
                {booking.listing_title}
                {booking.listing_category && ` · ${booking.listing_category}`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6">

              {/* Trip details */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trip Details</h3>
                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Trip Date</dt>
                    <dd className="font-medium mt-0.5">{format(parseISO(booking.trip_date), "EEEE, MMM d, yyyy")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Guests</dt>
                    <dd className="font-medium mt-0.5">{booking.guests}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Agency</dt>
                    <dd className="font-medium mt-0.5">{booking.agency_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Booked</dt>
                    <dd className="font-medium mt-0.5">{format(parseISO(booking.created_at), "MMM d, yyyy")}</dd>
                  </div>
                </dl>
              </section>

              <Separator />

              {/* Traveler */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Traveler</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{booking.traveler_name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium text-right break-all">{booking.traveler_email ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{booking.traveler_phone ?? "—"}</dd>
                  </div>
                </dl>
                {booking.special_requests && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Special Requests</p>
                    <p className="text-foreground">{booking.special_requests}</p>
                  </div>
                )}
                {booking.cancellation_reason && (
                  <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm">
                    <p className="text-xs font-medium text-destructive mb-1">Cancellation Reason</p>
                    <p className="text-foreground">{booking.cancellation_reason}</p>
                  </div>
                )}
              </section>

              <Separator />

              {/* Financials */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financials</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Price / person</dt>
                    <dd className="font-medium">{money.format(booking.price_per_person)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total (×{booking.guests})</dt>
                    <dd className="font-semibold">{money.format(booking.total_amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Platform (15%)</dt>
                    <dd className="text-destructive">-{money.format(booking.commission_amount)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 mt-1">
                    <dt className="font-semibold">Agency Payout</dt>
                    <dd className="font-bold text-primary">{money.format(booking.net_payout)}</dd>
                  </div>
                </dl>
                {booking.payment_intent_id && (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Payment Intent ID
                    </p>
                    <p className="font-mono text-xs break-all text-foreground">{booking.payment_intent_id}</p>
                  </div>
                )}
              </section>

              <Separator />

              {/* Admin actions */}
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Actions</h3>

                <div className="space-y-2">
                  <Label className="text-xs">Override Status</Label>
                  <div className="flex gap-2">
                    <Select value={overrideStatus} onValueChange={onOverrideStatusChange}>
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={overrideLoading || overrideStatus === booking.status}
                      onClick={onOverrideStatus}
                      className="h-9 whitespace-nowrap"
                    >
                      {overrideLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : "Apply"}
                    </Button>
                  </div>
                  {overrideStatus === booking.status && (
                    <p className="text-[11px] text-muted-foreground">Status is already "{booking.status}".</p>
                  )}
                </div>

                {booking.payment_status === "paid" && booking.status !== "cancelled" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Process Refund</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Refund amount follows the cancellation policy (100% ≥ 7 days, 50% ≥ 3 days).
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full h-9"
                      disabled={refundLoading}
                      onClick={onRefund}
                    >
                      {refundLoading
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</>
                        : "Process Refund & Cancel"}
                    </Button>
                  </div>
                )}

                {booking.payment_intent_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 gap-2"
                    onClick={() =>
                      window.open(
                        `https://dashboard.stripe.com/payments/${booking.payment_intent_id}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                    View in Stripe Dashboard
                  </Button>
                )}
              </section>

            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export { StatusBadge, PaymentBadge };
