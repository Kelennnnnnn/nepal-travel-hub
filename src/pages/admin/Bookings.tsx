import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardList, Loader2, Search, Hourglass, ShieldAlert, Banknote, AlertTriangle, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/currency";

type BookingStatus =
  | "draft" | "pending_payment" | "payment_processing" | "awaiting_agency_confirmation"
  | "confirmed" | "cancel_requested" | "cancelled" | "in_progress" | "completed"
  | "no_show" | "disputed" | "expired";

const STATUS_BADGE: Record<BookingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_payment: { label: "Payment pending", className: "bg-warning text-warning-foreground" },
  payment_processing: { label: "Processing payment", className: "bg-warning text-warning-foreground" },
  awaiting_agency_confirmation: { label: "Awaiting agency confirmation", className: "bg-secondary text-secondary-foreground" },
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
  { value: "awaiting_agency_confirmation", label: "Awaiting agency confirmation" },
  { value: "pending_payment", label: "Payment pending" },
  { value: "payment_processing", label: "Processing payment" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancel_requested", label: "Cancellation requested" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
  { value: "disputed", label: "Disputed" },
  { value: "expired", label: "Expired holds" },
];

interface AdminBookingRow {
  id: string;
  booking_ref: string;
  booking_status: BookingStatus;
  payment_status: string;
  participant_count: number;
  created_at: string;
  traveler_id: string;
  agency_confirm_deadline: string | null;
  listing: { title: string } | null;
  departure: { departure_date: string } | null;
  agency: { display_name: string } | null;
  traveler: { full_name: string | null } | null;
  quote: { agency_balance: number; currency: string } | null;
}

interface TimelineRow {
  occurred_at: string;
  source: string;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown>;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CONVERTED_PAYMENT_STATUSES = new Set(["paid", "partially_refunded", "refunded", "disputed"]);

function BookingDetailDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [timeline, setTimeline] = useState<TimelineRow[] | null>(null);

  useEffect(() => {
    supabase.rpc("admin_booking_timeline", { p_booking_id: bookingId }).then(({ data, error }) => {
      setTimeline(error ? [] : ((data ?? []) as unknown as TimelineRow[]));
    });
  }, [bookingId]);

  const sourceBadge: Record<string, string> = {
    status_history: "bg-primary/10 text-primary",
    payment_event: "bg-success text-success-foreground",
    refund_record: "bg-warning text-warning-foreground",
    dispute: "bg-destructive/10 text-destructive",
    disruption: "bg-secondary text-secondary-foreground",
    notification: "bg-muted text-muted-foreground",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Booking Timeline</DialogTitle></DialogHeader>
        {timeline === null ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No events recorded for this booking.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((row, i) => (
              <div key={i} className="flex gap-3 text-sm p-2.5 rounded-lg border border-border/40">
                <Badge className={`${sourceBadge[row.source] ?? "bg-muted"} flex-shrink-0 h-fit`}>{row.source.replace(/_/g, " ")}</Badge>
                <div className="min-w-0">
                  <p>{row.summary}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(row.occurred_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OpsTab() {
  const [bookings7d, setBookings7d] = useState<{ booking_status: BookingStatus; payment_status: string; created_at: string }[]>([]);
  const [awaiting, setAwaiting] = useState<{ id: string; booking_ref: string; agency_confirm_deadline: string; listing: { title: string } | null; agency: { display_name: string } | null }[]>([]);
  const [disputesOpen, setDisputesOpen] = useState<number | null>(null);
  const [refundsPending, setRefundsPending] = useState<number | null>(null);
  const [agenciesWithStrikes, setAgenciesWithStrikes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase.from("bookings").select("booking_status, payment_status, created_at").gte("created_at", since7d),
      supabase
        .from("bookings")
        .select("id, booking_ref, agency_confirm_deadline, listing:listings(title), agency:agencies(display_name)")
        .eq("booking_status", "awaiting_agency_confirmation")
        .order("agency_confirm_deadline", { ascending: true })
        .limit(50),
      supabase.from("booking_disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("refund_records").select("amount").eq("status", "pending_provider"),
      supabase.from("agency_strikes").select("agency_id").gte("created_at", since90d),
    ]).then(([bookingsRes, awaitingRes, disputesRes, refundsRes, strikesRes]) => {
      setBookings7d((bookingsRes.data ?? []) as typeof bookings7d);
      setAwaiting((awaitingRes.data ?? []) as unknown as typeof awaiting);
      setDisputesOpen(disputesRes.count ?? 0);
      setRefundsPending((refundsRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0));
      setAgenciesWithStrikes(new Set((strikesRes.data ?? []).map((s) => s.agency_id as string)).size);
      setIsLoading(false);
    });
  }, []);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const bookingsToday = useMemo(() => bookings7d.filter((b) => new Date(b.created_at) >= todayStart), [bookings7d, todayStart]);

  const todayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of bookingsToday) counts[r.booking_status] = (counts[r.booking_status] ?? 0) + 1;
    return counts;
  }, [bookingsToday]);
  const weekCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of bookings7d) counts[r.booking_status] = (counts[r.booking_status] ?? 0) + 1;
    return counts;
  }, [bookings7d]);

  const conv7d = useMemo(() => {
    const holds = bookings7d.length;
    const converted = bookings7d.filter((r) => CONVERTED_PAYMENT_STATUSES.has(r.payment_status)).length;
    return { holds, converted, rate: holds > 0 ? Math.round((converted / holds) * 1000) / 10 : 0 };
  }, [bookings7d]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Hourglass className="h-3.5 w-3.5" /> Awaiting agency</p>
            <p className="text-2xl font-bold text-secondary">{awaiting.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Open disputes</p>
            <p className="text-2xl font-bold text-destructive">{disputesOpen}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> Refunds pending</p>
            <p className="text-2xl font-bold text-warning-foreground">{formatPrice(refundsPending ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Agencies w/ strikes (90d)</p>
            <p className="text-2xl font-bold">{agenciesWithStrikes}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Bookings by status</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead className="text-right">Today</TableHead><TableHead className="text-right">7 days</TableHead></TableRow></TableHeader>
              <TableBody>
                {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                  <TableRow key={o.value}>
                    <TableCell className="text-sm">{o.label}</TableCell>
                    <TableCell className="text-right">{todayCounts[o.value] ?? 0}</TableCell>
                    <TableCell className="text-right">{weekCounts[o.value] ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Holds created vs. converted (7d)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Holds created</span><span className="font-semibold">{conv7d.holds}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Converted (fee paid)</span><span className="font-semibold">{conv7d.converted}</span></div>
            <div className="flex justify-between text-sm pt-2 border-t border-border/50"><span className="text-muted-foreground">Conversion rate</span><span className="font-bold text-lg">{conv7d.rate}%</span></div>
            <p className="text-xs text-muted-foreground">Will read 0% until online payments launch — expected, not a bug.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Awaiting agency confirmation, by deadline</CardTitle></CardHeader>
        <CardContent className="p-0">
          {awaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nothing awaiting confirmation right now.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Ref</TableHead><TableHead>Activity</TableHead><TableHead>Agency</TableHead><TableHead>Deadline</TableHead></TableRow></TableHeader>
              <TableBody>
                {awaiting.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.booking_ref}</TableCell>
                    <TableCell className="text-sm">{b.listing?.title ?? "—"}</TableCell>
                    <TableCell className="text-sm">{b.agency?.display_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(b.agency_confirm_deadline)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BookingsListTab() {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const [search, setSearch] = useState("");
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    supabase
      .from("bookings")
      .select(
        "id, booking_ref, booking_status, payment_status, participant_count, created_at, traveler_id, agency_confirm_deadline, " +
        "listing:listings(title), departure:departures(departure_date), " +
        "agency:agencies(display_name), " +
        "quote:booking_quotes(agency_balance, currency)"
      )
      .order("created_at", { ascending: false })
      .limit(500)
      .then(async ({ data, error }) => {
        if (!isMounted || error) { setIsLoading(false); return; }
        const rows = (data ?? []) as unknown as AdminBookingRow[];
        const travelerIds = [...new Set(rows.map((r) => r.traveler_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", travelerIds);
        const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
        if (!isMounted) return;
        setBookings(rows.map((r) => ({ ...r, traveler: { full_name: nameById.get(r.traveler_id) ?? null } })));
        setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const awaitingCount = useMemo(() => bookings.filter((b) => b.booking_status === "awaiting_agency_confirmation").length, [bookings]);
  const confirmedCount = useMemo(() => bookings.filter((b) => b.booking_status === "confirmed").length, [bookings]);
  const cancelledCount = useMemo(() => bookings.filter((b) => b.booking_status === "cancelled").length, [bookings]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.booking_status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          b.booking_ref.toLowerCase().includes(q) ||
          (b.listing?.title ?? "").toLowerCase().includes(q) ||
          (b.agency?.display_name ?? "").toLowerCase().includes(q) ||
          (b.traveler?.full_name ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: bookings.length, color: "" },
          { label: "Awaiting agency confirmation", value: awaitingCount, color: "text-secondary" },
          { label: "Confirmed", value: confirmedCount, color: "text-success" },
          { label: "Cancelled", value: cancelledCount, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ref, activity, agency, traveler..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | BookingStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No bookings found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Traveler</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Pax</TableHead>
                  <TableHead>Agency balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const badge = STATUS_BADGE[b.booking_status];
                  return (
                    <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailBookingId(b.id)}>
                      <TableCell className="font-mono text-xs">{b.booking_ref}</TableCell>
                      <TableCell className="font-medium">{b.listing?.title ?? "—"}</TableCell>
                      <TableCell className="text-sm">{b.agency?.display_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{b.traveler?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.departure?.departure_date ? formatDate(b.departure.departure_date) : "—"}
                      </TableCell>
                      <TableCell>{b.participant_count}</TableCell>
                      <TableCell className="font-medium">{b.quote ? formatPrice(b.quote.agency_balance) : "—"}</TableCell>
                      <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detailBookingId && <BookingDetailDialog bookingId={detailBookingId} onClose={() => setDetailBookingId(null)} />}
    </div>
  );
}

export default function AdminBookings() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-muted-foreground">Platform-wide booking activity and operations</p>
        </div>

        <Tabs defaultValue="ops">
          <TabsList>
            <TabsTrigger value="ops">Ops</TabsTrigger>
            <TabsTrigger value="list">All Bookings</TabsTrigger>
          </TabsList>
          <TabsContent value="ops" className="mt-4"><OpsTab /></TabsContent>
          <TabsContent value="list" className="mt-4"><BookingsListTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
