import { useEffect, useMemo, useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ClipboardList, Clock, Hourglass, Lock, MoreHorizontal, PlayCircle, CheckCircle2, UserX, Ban } from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type BookingStatus, type AgencyBooking } from "@/stores/bookingsStore";
import { agencyRespondToBooking, agencyCancelBooking, agencyMarkNoShow, agencySetTripStatus, type AgencyCancelReasonCode } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/currency";
import { useAuthStore } from "@/stores/authStore";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { formatTripDate as formatDate } from "@/lib/dates";

const STATUS_BADGE: Record<BookingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_payment: { label: "Payment pending", className: "bg-warning text-warning-foreground" },
  payment_processing: { label: "Processing payment", className: "bg-warning text-warning-foreground" },
  awaiting_agency_confirmation: { label: "Awaiting your confirmation", className: "bg-secondary text-secondary-foreground" },
  confirmed: { label: "Confirmed", className: "bg-success text-success-foreground" },
  cancel_requested: { label: "Cancellation requested", className: "bg-warning text-warning-foreground" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success text-success-foreground" },
  no_show: { label: "No-show", className: "bg-destructive/10 text-destructive" },
  disputed: { label: "Disputed", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Hold expired", className: "bg-muted text-muted-foreground" },
};

const STATUS_OPTIONS: { value: "all" | BookingStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "awaiting_agency_confirmation", label: "Awaiting your confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancel_requested", label: "Cancellation requested" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
  { value: "disputed", label: "Disputed" },
  { value: "pending_payment", label: "Payment pending (holds)" },
  { value: "expired", label: "Expired holds" },
];

const CANCEL_REASON_OPTIONS: { value: AgencyCancelReasonCode; label: string }[] = [
  { value: "agency_unavailable", label: "We can't run this trip (full refund, counts as a strike)" },
  { value: "conditions_weather", label: "Weather — offer free date change" },
  { value: "conditions_flight", label: "Flight disruption — offer free date change" },
  { value: "conditions_safety", label: "Safety conditions — offer free date change" },
  { value: "traveler_request", label: "Traveler asked us to cancel" },
];

function noShowWindow(quote: AgencyBooking["quote"]) {
  if (!quote) return null;
  const opensAt = new Date(quote.start_at).getTime() + quote.no_show_grace_minutes * 60_000;
  const closesAt = new Date(quote.end_at).getTime() + 24 * 3_600_000;
  return { opensAt, closesAt };
}

function DeadlineCountdown({ deadline }: { deadline: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const msLeft = new Date(deadline).getTime() - Date.now();
  if (msLeft <= 0) return <span className="text-destructive font-medium">Overdue</span>;
  const hours = Math.floor(msLeft / 3_600_000);
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000);
  return (
    <span className={hours < 12 ? "text-destructive font-semibold" : "text-warning-foreground font-semibold"}>
      {hours}h {minutes}m left
    </span>
  );
}

export default function AgencyBookings() {
  const { agencyBookings, isLoading, fetchAgencyBookings, subscribeToAgencyBookings } = useBookingsStore();
  const { agencyMemberships } = useAuthStore();
  const { no_show_dispute_hours: noShowDisputeHours } = usePlatformSettings();
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [respondTarget, setRespondTarget] = useState<AgencyBooking | null>(null);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AgencyBooking | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<AgencyCancelReasonCode>("agency_unavailable");
  const [cancelReason, setCancelReason] = useState("");
  const [noShowTarget, setNoShowTarget] = useState<AgencyBooking | null>(null);
  const [noShowNote, setNoShowNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchAgencyBookings();
    const unsubscribe = subscribeToAgencyBookings();
    return unsubscribe;
  }, [fetchAgencyBookings, subscribeToAgencyBookings]);

  const managerAgencyIds = useMemo(
    () => new Set(agencyMemberships.filter((m) => m.agencyRole === "owner" || m.agencyRole === "manager").map((m) => m.agencyId)),
    [agencyMemberships]
  );

  const needsConfirmation = useMemo(
    () => agencyBookings.filter((b) => b.booking_status === "awaiting_agency_confirmation"),
    [agencyBookings]
  );

  const filtered = useMemo(() => {
    return agencyBookings.filter((b) => {
      if (statusFilter === "all" && b.booking_status === "pending_payment") return false;
      if (statusFilter !== "all" && b.booking_status !== statusFilter) return false;
      if (dateFilter && b.departure?.departure_date !== dateFilter) return false;
      return true;
    });
  }, [agencyBookings, statusFilter, dateFilter]);

  const openRespond = (booking: AgencyBooking) => {
    setRespondTarget(booking);
    setDeclineMode(false);
    setDeclineReason("");
  };

  const handleAccept = async () => {
    if (!respondTarget) return;
    setIsResponding(true);
    try {
      await agencyRespondToBooking(respondTarget.id, true);
      toast.success("Booking confirmed.");
      setRespondTarget(null);
      fetchAgencyBookings({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm the booking.");
    } finally {
      setIsResponding(false);
    }
  };

  const handleDecline = async () => {
    if (!respondTarget) return;
    if (declineReason.trim().length < 10) { toast.error("Please explain why (at least 10 characters)."); return; }
    setIsResponding(true);
    try {
      await agencyRespondToBooking(respondTarget.id, false, declineReason.trim());
      toast.success("Booking declined — the traveler's fee is being refunded.");
      setRespondTarget(null);
      fetchAgencyBookings({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline the booking.");
    } finally {
      setIsResponding(false);
    }
  };

  const canRespond = (b: AgencyBooking) => managerAgencyIds.has(b.agency_id);

  const handleTripStatus = async (b: AgencyBooking, status: "in_progress" | "completed") => {
    setActionLoading(b.id);
    try {
      await agencySetTripStatus(b.id, status);
      toast.success(status === "in_progress" ? "Marked in progress." : "Marked completed.");
      fetchAgencyBookings({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update trip status.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setActionLoading(cancelTarget.id);
    try {
      await agencyCancelBooking(cancelTarget.id, cancelReasonCode, cancelReason || undefined);
      toast.success(
        cancelReasonCode.startsWith("conditions_")
          ? "The traveler has been offered a free date change or a refund."
          : "Booking cancelled."
      );
      setCancelTarget(null);
      setCancelReason("");
      fetchAgencyBookings({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel the booking.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmNoShow = async () => {
    if (!noShowTarget) return;
    setActionLoading(noShowTarget.id);
    try {
      await agencyMarkNoShow(noShowTarget.id, noShowNote || undefined);
      toast.success("Marked as a no-show.");
      setNoShowTarget(null);
      setNoShowNote("");
      fetchAgencyBookings({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as a no-show.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AgencyLayout title="Bookings">
      <div className="space-y-6">
        {needsConfirmation.length > 0 && (
          <Card className="border-secondary/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-secondary" /> Needs Your Confirmation ({needsConfirmation.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {needsConfirmation.map((b) => {
                const primaryGuest = b.guests?.find((g) => g.is_primary) ?? b.guests?.[0];
                const respondable = canRespond(b);
                return (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-secondary/10">
                    <div>
                      <p className="font-medium">{b.listing?.title ?? "—"} <span className="text-muted-foreground text-sm font-normal">· {b.booking_ref}</span></p>
                      <p className="text-sm text-muted-foreground">
                        {primaryGuest?.full_name ?? "Traveler"} · {b.departure?.departure_date ? formatDate(b.departure.departure_date) : "—"} · {b.participant_count} pax
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-sm"><Clock className="h-3.5 w-3.5" /> {b.agency_confirm_deadline && <DeadlineCountdown deadline={b.agency_confirm_deadline} />}</span>
                      {respondable ? (
                        <Button size="sm" onClick={() => openRespond(b)}>Respond</Button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Manager only</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | BookingStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Departure date</Label>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium mb-1">No bookings match these filters</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Traveler</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Pax</TableHead>
                <TableHead>Agency balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const primaryGuest = b.guests?.find((g) => g.is_primary) ?? b.guests?.[0];
                const badge = STATUS_BADGE[b.booking_status];
                const respondable = canRespond(b);
                const noShowWin = noShowWindow(b.quote);
                const canMarkNoShow = respondable && noShowWin && Date.now() >= noShowWin.opensAt && Date.now() <= noShowWin.closesAt && (b.booking_status === "confirmed" || b.booking_status === "in_progress");
                const noShowOpensIn = noShowWin && Date.now() < noShowWin.opensAt ? Math.ceil((noShowWin.opensAt - Date.now()) / 60000) : null;
                const hasActions = respondable && (b.booking_status === "confirmed" || b.booking_status === "in_progress");
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.booking_ref}</TableCell>
                    <TableCell className="font-medium">{b.listing?.title ?? "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{primaryGuest?.full_name ?? "—"}</div>
                      {primaryGuest?.contact_phone && <div className="text-xs text-muted-foreground">{primaryGuest.contact_phone}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.departure?.departure_date ? formatDate(b.departure.departure_date) : "—"}
                    </TableCell>
                    <TableCell>{b.participant_count}</TableCell>
                    <TableCell className="font-medium">{b.quote ? formatPrice(b.quote.agency_balance) : "—"}</TableCell>
                    <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                    <TableCell>
                      {hasActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={actionLoading === b.id}>
                              {actionLoading === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {b.booking_status === "confirmed" && (
                              <DropdownMenuItem onClick={() => handleTripStatus(b, "in_progress")}>
                                <PlayCircle className="h-4 w-4 mr-2" /> Mark In Progress
                              </DropdownMenuItem>
                            )}
                            {b.booking_status === "in_progress" && (
                              <DropdownMenuItem onClick={() => handleTripStatus(b, "completed")}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={!canMarkNoShow}
                              onClick={() => { setNoShowTarget(b); setNoShowNote(""); }}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              {canMarkNoShow ? "Mark No-Show" : noShowOpensIn !== null ? `Mark No-Show (in ${noShowOpensIn}m)` : "Mark No-Show (window closed)"}
                            </DropdownMenuItem>
                            {b.booking_status === "confirmed" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setCancelTarget(b); setCancelReasonCode("agency_unavailable"); setCancelReason(""); }}
                                >
                                  <Ban className="h-4 w-4 mr-2" /> Cancel Booking
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!respondTarget} onOpenChange={(open) => !open && setRespondTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Respond to {respondTarget?.booking_ref}</DialogTitle></DialogHeader>
          {!declineMode ? (
            <>
              <p className="text-sm text-muted-foreground">
                {respondTarget?.listing?.title} for {respondTarget?.participant_count} traveler{respondTarget?.participant_count === 1 ? "" : "s"} on{" "}
                {respondTarget?.departure?.departure_date ? formatDate(respondTarget.departure.departure_date) : "—"}.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeclineMode(true)} disabled={isResponding}>Decline</Button>
                <Button onClick={handleAccept} disabled={isResponding}>
                  {isResponding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Accept
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason for declining</Label>
                <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3} placeholder="e.g. Fully booked that date, guide unavailable…" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeclineMode(false)} disabled={isResponding}>Back</Button>
                <Button variant="destructive" onClick={handleDecline} disabled={isResponding}>
                  {isResponding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm Decline
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel {cancelTarget?.booking_ref}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Select value={cancelReasonCode} onValueChange={(v) => setCancelReasonCode(v as AgencyCancelReasonCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANCEL_REASON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {cancelReasonCode === "agency_unavailable" && (
              <p className="text-xs text-destructive">This refunds the traveler in full and counts as a strike against your agency.</p>
            )}
            {cancelReasonCode.startsWith("conditions_") && (
              <p className="text-xs text-muted-foreground">No strike — the traveler will be offered a free date change or a full refund.</p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={actionLoading === cancelTarget?.id}>Back</Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={actionLoading === cancelTarget?.id}>
              {actionLoading === cancelTarget?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noShowTarget} onOpenChange={(open) => !open && setNoShowTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {noShowTarget?.booking_ref} as a no-show?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The reservation fee stays with the platform and no refund is created. The traveler can dispute this for {noShowDisputeHours} hours.</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea value={noShowNote} onChange={(e) => setNoShowNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoShowTarget(null)} disabled={actionLoading === noShowTarget?.id}>Back</Button>
            <Button variant="destructive" onClick={handleConfirmNoShow} disabled={actionLoading === noShowTarget?.id}>
              {actionLoading === noShowTarget?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm No-Show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AgencyLayout>
  );
}
