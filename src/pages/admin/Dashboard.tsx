import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle,
  Clock,
  Eye,
  Loader2,
} from "lucide-react";
import {
  DashboardCharts,
  type BookingStatRow,
  type RevenueRow,
  type AgencySignupRow,
  type CategoryRow,
} from "./dashboard/DashboardCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAgencyStore } from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────

interface RecentBookingRow {
  id: string;
  booking_ref: string;
  agency_id: string;
  total_amount: number;
  status: string;
  created_at: string;
  traveler_name: string | null;
  listing: { title: string } | { title: string }[] | null;
}

interface CoreStats {
  totalRevenue: number;
  totalBookings: number;
  listedActivities: number;
  verifiedAgencies: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function listingTitle(listing: RecentBookingRow["listing"]): string {
  if (!listing) return "—";
  if (Array.isArray(listing)) return listing[0]?.title ?? "—";
  return listing.title ?? "—";
}

function badgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "confirmed" || status === "completed") return "default";
  if (status === "cancelled") return "destructive";
  return "secondary";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function getDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const d = new Date(now);
  if (preset === "7d")  d.setDate(d.getDate() - 7);
  if (preset === "30d") d.setDate(d.getDate() - 30);
  if (preset === "90d") d.setDate(d.getDate() - 90);
  if (preset === "6m")  d.setMonth(d.getMonth() - 6);
  if (preset === "1y")  d.setFullYear(d.getFullYear() - 1);
  return { from: d.toISOString().split("T")[0], to };
}

function getPrevDates(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const diff = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return {
    from: prevFrom.toISOString().split("T")[0],
    to:   prevTo.toISOString().split("T")[0],
  };
}

// ── Sub-components ───────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No prior data</span>;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{pct.toFixed(1)}% vs prev period
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "7D",  value: "7d"  },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "6M",  value: "6m"  },
  { label: "1Y",  value: "1y"  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const {
    allApplications,
    isLoadingAll,
    fetchAllApplications,
    subscribeToAllApplications,
    updateApplicationStatus,
  } = useAgencyStore();

  // Date range
  const [preset, setPreset]   = useState("30d");
  const [dateFrom, setDateFrom] = useState(() => getDates("30d").from);
  const [dateTo, setDateTo]     = useState(() => getDates("30d").to);
  const [customFrom, setCustomFrom] = useState(dateFrom);
  const [customTo, setCustomTo]     = useState(dateTo);

  // Core stats
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<CoreStats>({ totalRevenue: 0, totalBookings: 0, listedActivities: 0, verifiedAgencies: 0 });
  const [prevStats, setPrevStats] = useState<CoreStats | null>(null);

  // Chart data
  const [chartsLoading, setChartsLoading] = useState(true);
  const [bookingStats, setBookingStats]   = useState<BookingStatRow[]>([]);
  const [revenueStats, setRevenueStats]   = useState<RevenueRow[]>([]);
  const [agencyStats, setAgencyStats]     = useState<AgencySignupRow[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryRow[]>([]);

  // Recent bookings
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentRows, setRecentRows]       = useState<RecentBookingRow[]>([]);

  // ── Agency store ───────────────────────────────────────────────────

  useEffect(() => {
    fetchAllApplications();
    const unsubscribe = subscribeToAllApplications();
    return unsubscribe;
  }, [fetchAllApplications, subscribeToAllApplications]);

  // ── Load data whenever date range changes ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setStatsLoading(true);
      setChartsLoading(true);
      setRecentLoading(true);

      try {
        const prevRange = getPrevDates(dateFrom, dateTo);

        const [
          paidRes,
          prevPaidRes,
          bookingsCountRes,
          prevBookingsCountRes,
          listingsCountRes,
          recentRes,
          weeklyRes,
          monthlyRes,
          agencyRes,
          categoryRes,
        ] = await Promise.all([
          supabase.from("bookings").select("total_amount").eq("payment_status", "paid")
            .gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59"),
          supabase.from("bookings").select("total_amount").eq("payment_status", "paid")
            .gte("created_at", prevRange.from).lte("created_at", prevRange.to + "T23:59:59"),
          supabase.from("bookings").select("*", { count: "exact", head: true })
            .gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59"),
          supabase.from("bookings").select("*", { count: "exact", head: true })
            .gte("created_at", prevRange.from).lte("created_at", prevRange.to + "T23:59:59"),
          supabase.from("listings").select("*", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("bookings")
            .select("id,booking_ref,agency_id,total_amount,status,created_at,traveler_name,listing:listings(title)")
            .order("created_at", { ascending: false }).limit(5),
          supabase.rpc("admin_booking_stats", { start_date: dateFrom, end_date: dateTo }),
          supabase.rpc("admin_revenue_by_month", { start_date: dateFrom, end_date: dateTo }),
          supabase.rpc("admin_agency_signups", { start_date: dateFrom, end_date: dateTo }),
          supabase.rpc("admin_bookings_by_category", { start_date: dateFrom, end_date: dateTo }),
        ]);

        if (cancelled) return;

        // Core stats — gracefully handle per-query errors
        const revenue = !paidRes.error
          ? (paidRes.data?.reduce((s, r) => s + Number(r.total_amount ?? 0), 0) ?? 0)
          : 0;
        const prevRevenue = !prevPaidRes.error
          ? (prevPaidRes.data?.reduce((s, r) => s + Number(r.total_amount ?? 0), 0) ?? 0)
          : 0;
        const bookingsCount = !bookingsCountRes.error ? (bookingsCountRes.count ?? 0) : 0;
        const prevBookingsCount = !prevBookingsCountRes.error ? (prevBookingsCountRes.count ?? 0) : 0;
        const verifiedCount = allApplications.filter((a) => a.status === "verified").length;

        setStats({
          totalRevenue: revenue,
          totalBookings: bookingsCount,
          listedActivities: !listingsCountRes.error ? (listingsCountRes.count ?? 0) : 0,
          verifiedAgencies: verifiedCount,
        });
        setPrevStats({
          totalRevenue: prevRevenue,
          totalBookings: prevBookingsCount,
          listedActivities: 0,
          verifiedAgencies: 0,
        });
        setStatsLoading(false);

        // Chart data
        if (!weeklyRes.error)   setBookingStats((weeklyRes.data ?? []) as BookingStatRow[]);
        if (!monthlyRes.error)  setRevenueStats((monthlyRes.data ?? []) as RevenueRow[]);
        if (!agencyRes.error)   setAgencyStats((agencyRes.data ?? []) as AgencySignupRow[]);
        if (!categoryRes.error) setCategoryStats((categoryRes.data ?? []) as CategoryRow[]);
        setChartsLoading(false);

        // Recent bookings
        if (recentRes.error) {
          toast.error("Could not load recent bookings.");
          setRecentRows([]);
        } else {
          setRecentRows((recentRes.data ?? []) as RecentBookingRow[]);
        }
        setRecentLoading(false);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load dashboard data. Please refresh.");
          setStatsLoading(false);
          setChartsLoading(false);
          setRecentLoading(false);
        }
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, allApplications]);

  // ── Date range handlers ────────────────────────────────────────────

  const applyPreset = (p: string) => {
    setPreset(p);
    const { from, to } = getDates(p);
    setDateFrom(from);
    setDateTo(to);
    setCustomFrom(from);
    setCustomTo(to);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setPreset("");
    setDateFrom(customFrom);
    setDateTo(customTo);
  };

  // ── Derived ────────────────────────────────────────────────────────

  const pendingApps = allApplications.filter((a) => a.status === "pending" || a.status === "in_review");

  const revenuePct = prevStats ? pctChange(stats.totalRevenue, prevStats.totalRevenue) : null;
  const bookingsPct = prevStats ? pctChange(stats.totalBookings, prevStats.totalBookings) : null;

  // Agency count (from allApplications, not period-filtered)
  const verifiedCount = allApplications.filter((a) => a.status === "verified").length;

  const recentBookings = useMemo(
    () => recentRows.map((row) => ({
      id: row.id,
      booking_ref: row.booking_ref,
      activity: listingTitle(row.listing),
      customer: row.traveler_name?.trim() || "—",
      agency: allApplications.find((a) => a.user_id === row.agency_id)?.company_name ?? "—",
      amount: Number(row.total_amount ?? 0),
      status: row.status,
      date: row.created_at.split("T")[0],
    })),
    [recentRows, allApplications],
  );

  const handleApprove = async (id: string, name: string) => {
    const { error } = await updateApplicationStatus(id, "verified");
    if (error) { toast.error(`Failed to approve: ${error}`); return; }
    toast.success(`${name} has been approved!`);
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header + Date Range Selector */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here's what's happening.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
            <div className="flex gap-1 items-end">
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-xs w-32"
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-xs w-32"
                />
              </div>
              <Button size="sm" variant="outline" onClick={applyCustom} className="h-8">Apply</Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: "Total Revenue",
              value: statsLoading ? null : money.format(stats.totalRevenue),
              delta: revenuePct,
              icon: DollarSign,
              showDelta: true,
            },
            {
              title: "Total Bookings",
              value: statsLoading ? null : stats.totalBookings.toLocaleString(),
              delta: bookingsPct,
              icon: Calendar,
              showDelta: true,
            },
            {
              title: "Active Agencies",
              value: statsLoading ? null : String(verifiedCount),
              sub: `${pendingApps.length} pending`,
              icon: Building2,
              showDelta: false,
            },
            {
              title: "Published Activities",
              value: statsLoading ? null : stats.listedActivities.toLocaleString(),
              sub: "Live listings",
              icon: MapPin,
              showDelta: false,
            },
          ].map((s) => (
            <Card key={s.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.title}</p>
                    {s.value === null
                      ? <Skeleton className="h-8 w-28 mt-1" />
                      : <p className="text-2xl font-bold mt-1">{s.value}</p>
                    }
                    <div className="mt-2">
                      {s.showDelta
                        ? (s.value === null ? <Skeleton className="h-4 w-24" /> : <DeltaBadge pct={s.delta ?? null} />)
                        : <span className="text-xs text-muted-foreground">{s.sub}</span>
                      }
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10">
                    <s.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DashboardCharts
          loading={chartsLoading}
          bookingStats={bookingStats}
          revenueStats={revenueStats}
          agencyStats={agencyStats}
          categoryStats={categoryStats}
        />

        {/* Recent Bookings + Pending Agencies */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Bookings</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/bookings")}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                      </div>
                      <div className="text-right space-y-2">
                        <Skeleton className="h-5 w-16 ml-auto" />
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </div>
                    </div>
                  ))
                ) : recentBookings.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">No bookings yet.</p>
                ) : (
                  recentBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{b.activity}</span>
                          <Badge variant={badgeVariant(b.status)} className="text-xs">{b.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          <span className="font-mono text-xs">{b.booking_ref}</span>
                          {" · "}{b.customer} • {b.agency}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${b.amount.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(b.date)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Pending Approvals
                {pendingApps.length > 0 && (
                  <Badge className="bg-secondary text-secondary-foreground">{pendingApps.length}</Badge>
                )}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingAll ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : pendingApps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">All caught up! No pending applications.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingApps.slice(0, 5).map((agency) => (
                    <div key={agency.id} className="p-4 rounded-lg border border-border">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{agency.company_name}</p>
                          <p className="text-sm text-muted-foreground">{agency.city}, {agency.district}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {agency.status === "in_review" ? "In Review" : "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Applied {formatDate(agency.created_at)}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => handleApprove(agency.id, agency.company_name)}>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate("/admin/agencies")}>
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingApps.length > 5 && (
                    <Button variant="outline" className="w-full" onClick={() => navigate("/admin/agencies")}>
                      View all {pendingApps.length} pending
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/agencies")}>
                <Building2 className="h-6 w-6" />
                <span>Review Agencies</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/listings")}>
                <MapPin className="h-6 w-6" />
                <span>Moderate Listings</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/bookings")}>
                <DollarSign className="h-6 w-6" />
                <span>Process Payments</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/users")}>
                <Users className="h-6 w-6" />
                <span>Manage Users</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
