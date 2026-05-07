import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ExternalLink, RefreshCw, ArrowLeft, ArrowRight,
  DollarSign, BookOpen, TrendingDown, BarChart3,
  Loader2, AlertCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

interface AdminBooking {
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

interface Stats {
  totalBookings: number;
  totalRevenue: number;
  avgBookingValue: number;
  cancellationRate: number;
}

type SortCol = "trip_date" | "total_amount" | "created_at";

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

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

// ── Helper components ────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, className: "" };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
}

function PaymentBadge({ status }: { status: string }) {
  const cfg = paymentConfig[status] ?? { label: status, className: "" };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
}

function SortHeader({
  label, col, current, dir, onSort,
}: {
  label: string; col: SortCol; current: SortCol; dir: "asc" | "desc";
  onSort: (c: SortCol) => void;
}) {
  const active = col === current;
  return (
    <button
      className={cn(
        "flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => onSort(col)}
    >
      {label}
      {active
        ? dir === "asc"
          ? <ChevronUp className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />
        : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

function StatCard({ label, value, sub, icon: Icon, loading }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading
            ? <Skeleton className="h-8 w-28 mt-1" />
            : <p className="text-2xl font-bold mt-1">{value}</p>}
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function AdminBookings() {
  // Data
  const [bookings, setBookings]   = useState<AdminBooking[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter]   = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");
  const [searchInput, setSearchInput]     = useState("");
  const [search, setSearch]               = useState("");

  // Sort + pagination
  const [sortCol, setSortCol]     = useState<SortCol>("created_at");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [page, setPage]           = useState(1);

  // Detail sheet
  const [selected, setSelected]   = useState<AdminBooking | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Admin action states
  const [overrideStatus, setOverrideStatus]   = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [refundLoading, setRefundLoading]     = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    let q = supabase
      .from("bookings")
      .select("total_amount, status, payment_status");

    if (statusFilter !== "all")  q = q.eq("status", statusFilter);
    if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
    if (dateFrom) q = q.gte("trip_date", dateFrom);
    if (dateTo)   q = q.lte("trip_date", dateTo);
    if (search)   q = q.or(`booking_ref.ilike.%${search}%,traveler_name.ilike.%${search}%`);

    const { data } = await q;
    if (!data) { setStatsLoading(false); return; }

    const paidRows = data.filter(b => b.payment_status === "paid");
    const totalRevenue = paidRows.reduce((s, b) => s + Number(b.total_amount), 0);
    const cancelledCount = data.filter(b => b.status === "cancelled").length;

    setStats({
      totalBookings:    data.length,
      totalRevenue,
      avgBookingValue:  paidRows.length > 0 ? totalRevenue / paidRows.length : 0,
      cancellationRate: data.length > 0 ? (cancelledCount / data.length) * 100 : 0,
    });
    setStatsLoading(false);
  }, [statusFilter, paymentFilter, dateFrom, dateTo, search]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from("bookings")
      .select(
        `id, booking_ref, trip_date, guests, price_per_person,
         total_amount, commission_amount, net_payout,
         status, payment_status, payment_intent_id,
         traveler_name, traveler_email, traveler_phone,
         special_requests, cancellation_reason, created_at, agency_id,
         listing:listings(title, category)`,
        { count: "exact" },
      );

    if (statusFilter !== "all")  q = q.eq("status", statusFilter);
    if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
    if (dateFrom) q = q.gte("trip_date", dateFrom);
    if (dateTo)   q = q.lte("trip_date", dateTo);
    if (search)   q = q.or(`booking_ref.ilike.%${search}%,traveler_name.ilike.%${search}%`);

    q = q.order(sortCol, { ascending: sortDir === "asc" }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      toast.error("Failed to load bookings.");
      setLoading(false);
      return;
    }

    // Batch-fetch agency names for this page
    const agencyIds = [...new Set((data ?? []).map((b) => b.agency_id as string))];
    let agencyMap: Record<string, string> = {};
    if (agencyIds.length > 0) {
      const { data: agencies } = await supabase
        .from("agency_applications")
        .select("user_id, company_name")
        .in("user_id", agencyIds);
      agencyMap = Object.fromEntries(
        (agencies ?? []).map((a) => [a.user_id as string, (a.company_name as string) ?? "—"]),
      );
    }

    const mapped: AdminBooking[] = (data ?? []).map((row) => {
      const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing;
      return {
        id:                  row.id as string,
        booking_ref:         row.booking_ref as string,
        trip_date:           row.trip_date as string,
        guests:              row.guests as number,
        price_per_person:    Number(row.price_per_person),
        total_amount:        Number(row.total_amount),
        commission_amount:   Number(row.commission_amount),
        net_payout:          Number(row.net_payout),
        status:              row.status as string,
        payment_status:      row.payment_status as string,
        payment_intent_id:   (row.payment_intent_id as string | null) ?? null,
        traveler_name:       (row.traveler_name as string | null) ?? null,
        traveler_email:      (row.traveler_email as string | null) ?? null,
        traveler_phone:      (row.traveler_phone as string | null) ?? null,
        special_requests:    (row.special_requests as string | null) ?? null,
        cancellation_reason: (row.cancellation_reason as string | null) ?? null,
        created_at:          row.created_at as string,
        agency_id:           row.agency_id as string,
        agency_name:         agencyMap[row.agency_id as string] ?? "—",
        listing_title:       (listing as { title?: string } | null)?.title ?? "—",
        listing_category:    (listing as { category?: string } | null)?.category ?? null,
      };
    });

    setBookings(mapped);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, sortCol, sortDir, statusFilter, paymentFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, paymentFilter, dateFrom, dateTo, search, sortCol, sortDir]);

  // Debounce search input
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setSearch(v.trim()), 400);
  };

  // ── Sort handler ───────────────────────────────────────────────────

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  // ── Row click ──────────────────────────────────────────────────────

  const openDetail = (booking: AdminBooking) => {
    setSelected(booking);
    setOverrideStatus(booking.status);
    setSheetOpen(true);
  };

  // ── Admin actions ──────────────────────────────────────────────────

  const handleOverrideStatus = async () => {
    if (!selected || overrideStatus === selected.status) return;
    setOverrideLoading(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: overrideStatus })
      .eq("id", selected.id);

    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
    } else {
      toast.success(`Status updated to "${overrideStatus}"`);
      // Update local state
      const updated = { ...selected, status: overrideStatus };
      setSelected(updated);
      setBookings((prev) => prev.map((b) => (b.id === selected.id ? updated : b)));
      void fetchStats();
    }
    setOverrideLoading(false);
  };

  const handleRefund = async () => {
    if (!selected) return;
    setRefundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-refund", {
        body: { booking_id: selected.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const refundAmt = (data as { refundAmount?: number }).refundAmount ?? 0;
      toast.success(`Refund of ${money.format(refundAmt)} processed.`);
      const updated = { ...selected, status: "cancelled", payment_status: "refunded" };
      setSelected(updated);
      setBookings((prev) => prev.map((b) => (b.id === selected.id ? updated : b)));
      void fetchStats();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRefundLoading(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statCards = useMemo(() => [
    {
      label: "Total Bookings",
      value: (stats?.totalBookings ?? 0).toLocaleString(),
      icon: BookOpen,
      sub: "Matching current filters",
    },
    {
      label: "Total Revenue",
      value: money.format(stats?.totalRevenue ?? 0),
      icon: DollarSign,
      sub: "Paid bookings only",
    },
    {
      label: "Avg Booking Value",
      value: money.format(stats?.avgBookingValue ?? 0),
      icon: BarChart3,
      sub: "Per paid booking",
    },
    {
      label: "Cancellation Rate",
      value: `${(stats?.cancellationRate ?? 0).toFixed(1)}%`,
      icon: TrendingDown,
      sub: "Of all bookings",
    },
  ], [stats]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bookings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${total.toLocaleString()} booking${total !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => { void fetchBookings(); void fetchStats(); }}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <StatCard key={s.label} {...s} loading={statsLoading} />
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ref or traveler…"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_payment">Pending Payment</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment filter */}
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Trip date</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-36 text-sm" />
            <span className="text-muted-foreground text-xs">–</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-36 text-sm" />
          </div>

          {(statusFilter !== "all" || paymentFilter !== "all" || dateFrom || dateTo || search) && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground"
              onClick={() => {
                setStatusFilter("all");
                setPaymentFilter("all");
                setDateFrom("");
                setDateTo("");
                setSearchInput("");
                setSearch("");
              }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[110px]">Ref</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Traveler</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>
                    <SortHeader label="Date" col="trip_date" current={sortCol} dir={sortDir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Amount" col="total_amount" current={sortCol} dir={sortDir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>
                    <SortHeader label="Created" col="created_at" current={sortCol} dir={sortDir} onSort={handleSort} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-16 text-center text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No bookings match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => openDetail(b)}
                    >
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {b.booking_ref}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <p className="truncate font-medium text-sm">{b.listing_title}</p>
                        {b.listing_category && (
                          <p className="text-[11px] text-muted-foreground truncate">{b.listing_category}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{b.traveler_name ?? "—"}</p>
                        {b.traveler_email && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{b.traveler_email}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {b.agency_name}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums whitespace-nowrap">
                        {format(parseISO(b.trip_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{b.guests}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {money.format(b.total_amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-destructive tabular-nums">
                        -{money.format(b.commission_amount)}
                      </TableCell>
                      <TableCell><StatusBadge status={b.status} /></TableCell>
                      <TableCell><PaymentBadge status={b.payment_status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(parseISO(b.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                  const pg = i + Math.max(1, page - 3);
                  if (pg > totalPages) return null;
                  return (
                    <Button
                      key={pg}
                      variant={pg === page ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0 text-xs"
                      onClick={() => setPage(pg)}
                    >
                      {pg}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Detail Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
          {selected && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <SheetTitle className="font-mono text-base">{selected.booking_ref}</SheetTitle>
                  <StatusBadge status={selected.status} />
                  <PaymentBadge status={selected.payment_status} />
                </div>
                <SheetDescription className="text-left">
                  {selected.listing_title}
                  {selected.listing_category && ` · ${selected.listing_category}`}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6">

                {/* Trip details */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trip Details</h3>
                  <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">Trip Date</dt>
                      <dd className="font-medium mt-0.5">{format(parseISO(selected.trip_date), "EEEE, MMM d, yyyy")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Guests</dt>
                      <dd className="font-medium mt-0.5">{selected.guests}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Agency</dt>
                      <dd className="font-medium mt-0.5">{selected.agency_name}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Booked</dt>
                      <dd className="font-medium mt-0.5">{format(parseISO(selected.created_at), "MMM d, yyyy")}</dd>
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
                      <dd className="font-medium">{selected.traveler_name ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="font-medium text-right break-all">{selected.traveler_email ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="font-medium">{selected.traveler_phone ?? "—"}</dd>
                    </div>
                  </dl>
                  {selected.special_requests && (
                    <div className="rounded-lg bg-muted/50 p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Special Requests</p>
                      <p className="text-foreground">{selected.special_requests}</p>
                    </div>
                  )}
                  {selected.cancellation_reason && (
                    <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm">
                      <p className="text-xs font-medium text-destructive mb-1">Cancellation Reason</p>
                      <p className="text-foreground">{selected.cancellation_reason}</p>
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
                      <dd className="font-medium">{money.format(selected.price_per_person)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total (×{selected.guests})</dt>
                      <dd className="font-semibold">{money.format(selected.total_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Platform (15%)</dt>
                      <dd className="text-destructive">-{money.format(selected.commission_amount)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 mt-1">
                      <dt className="font-semibold">Agency Payout</dt>
                      <dd className="font-bold text-primary">{money.format(selected.net_payout)}</dd>
                    </div>
                  </dl>
                  {selected.payment_intent_id && (
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Payment Intent ID
                      </p>
                      <p className="font-mono text-xs break-all text-foreground">{selected.payment_intent_id}</p>
                    </div>
                  )}
                </section>

                <Separator />

                {/* Admin actions */}
                <section className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Actions</h3>

                  {/* Override status */}
                  <div className="space-y-2">
                    <Label className="text-xs">Override Status</Label>
                    <div className="flex gap-2">
                      <Select value={overrideStatus} onValueChange={setOverrideStatus}>
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
                        disabled={overrideLoading || overrideStatus === selected.status}
                        onClick={handleOverrideStatus}
                        className="h-9 whitespace-nowrap"
                      >
                        {overrideLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : "Apply"}
                      </Button>
                    </div>
                    {overrideStatus === selected.status && (
                      <p className="text-[11px] text-muted-foreground">Status is already "{selected.status}".</p>
                    )}
                  </div>

                  {/* Process refund */}
                  {selected.payment_status === "paid" && selected.status !== "cancelled" && (
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
                        onClick={handleRefund}
                      >
                        {refundLoading
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</>
                          : "Process Refund & Cancel"}
                      </Button>
                    </div>
                  )}

                  {/* View in Stripe */}
                  {selected.payment_intent_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 gap-2"
                      onClick={() =>
                        window.open(
                          `https://dashboard.stripe.com/payments/${selected.payment_intent_id}`,
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

    </AdminLayout>
  );
}
