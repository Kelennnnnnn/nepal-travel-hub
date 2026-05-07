import { useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgencyStore } from "@/stores/agencyStore";
import { useBookingsStore } from "@/stores/bookingsStore";
import { useListingsStore } from "@/stores/listingsStore";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  format, subWeeks, startOfWeek, endOfWeek,
  subMonths, startOfMonth, endOfMonth, parseISO,
} from "date-fns";
import {
  DollarSign, Eye, Star, TrendingUp, Users,
  CalendarDays, Loader2, BarChart2, ChevronRight,
} from "lucide-react";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const statusColor: Record<string, string> = {
  confirmed:       "bg-primary/10 text-primary",
  pending_payment: "bg-amber-100 text-amber-700",
  pending:         "bg-amber-100 text-amber-700",
  completed:       "bg-muted text-muted-foreground",
  cancelled:       "bg-destructive/10 text-destructive",
};

const C_PRIMARY   = "hsl(18, 83%, 40%)";
const C_SECONDARY = "hsl(43, 96%, 56%)";

const tooltipStyle = {
  backgroundColor: "hsl(36, 60%, 98%)",
  border: "1px solid hsl(220, 10%, 88%)",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function AgencyDashboard() {
  const navigate = useNavigate();

  const { verificationStatus, isLoading, fetchMyApplication } = useAgencyStore();
  const { agencyBookings, isLoading: bookingsLoading, fetchAgencyBookings } = useBookingsStore();
  const { myListings, fetchMyListings } = useListingsStore();

  useEffect(() => { fetchMyApplication(); }, [fetchMyApplication]);
  useEffect(() => {
    if (agencyBookings.length === 0) void fetchAgencyBookings();
    if (myListings.length === 0)     void fetchMyListings();
  }, [fetchAgencyBookings, fetchMyListings]);

  useEffect(() => {
    if (!isLoading) {
      if (verificationStatus === "unregistered") navigate("/agency/onboarding");
      else if (verificationStatus !== "verified") navigate("/agency/onboarding/status");
    }
  }, [verificationStatus, isLoading, navigate]);

  // ── Stat cards ─────────────────────────────────────────────
  const computedStats = useMemo(() => {
    const paidBookings   = agencyBookings.filter(b => b.payment_status === "paid");
    const netEarnings    = paidBookings.reduce((s, b) => s + b.net_payout, 0);
    const activeBookings = agencyBookings.filter(b => b.status === "confirmed").length;
    const activeListings = myListings.filter(l => l.status === "published").length;
    const ratings        = myListings.map(l => Number(l.rating)).filter(r => r > 0);
    const avgRating      = ratings.length
      ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : "—";
    return [
      { label: "Net Earnings",    value: money.format(netEarnings), icon: DollarSign, sub: "Paid bookings" },
      { label: "Active Bookings", value: String(activeBookings),    icon: CalendarDays, sub: "Status: confirmed" },
      { label: "Active Listings", value: String(activeListings),    icon: Eye, sub: "Published" },
      { label: "Avg. Rating",     value: avgRating,                 icon: Star, sub: "From your listings" },
    ];
  }, [agencyBookings, myListings]);

  // ── Weekly bookings trend (last 8 weeks) ───────────────────
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const anchor = subWeeks(now, 7 - i);
      const ws = startOfWeek(anchor, { weekStartsOn: 1 });
      const we = endOfWeek(anchor, { weekStartsOn: 1 });
      const count = agencyBookings.filter(b => {
        const d = parseISO(b.created_at);
        return d >= ws && d <= we;
      }).length;
      return { week: format(ws, "MMM d"), bookings: count };
    });
  }, [agencyBookings]);

  // ── Monthly revenue (last 6 months) ───────────────────────
  const monthlyRevenue = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const anchor = subMonths(new Date(), 5 - i);
      const ms = startOfMonth(anchor);
      const me = endOfMonth(anchor);
      const revenue = agencyBookings
        .filter(b => b.payment_status === "paid")
        .filter(b => { const d = parseISO(b.created_at); return d >= ms && d <= me; })
        .reduce((s, b) => s + b.net_payout, 0);
      return { month: format(anchor, "MMM"), revenue };
    });
  }, [agencyBookings]);

  // ── Top listings ───────────────────────────────────────────
  const topListings = useMemo(() => {
    const stats: Record<string, { title: string; bookings: number; revenue: number }> = {};
    agencyBookings.forEach(b => {
      if (!stats[b.listing_id]) stats[b.listing_id] = { title: b.listing?.title ?? "Unknown", bookings: 0, revenue: 0 };
      stats[b.listing_id].bookings++;
      if (b.payment_status === "paid") stats[b.listing_id].revenue += b.net_payout;
    });
    return Object.values(stats).sort((a, b) => b.bookings - a.bookings).slice(0, 5);
  }, [agencyBookings]);

  // ── Rating summary ─────────────────────────────────────────
  const ratedListings = useMemo(() =>
    myListings
      .filter(l => Number(l.rating) > 0)
      .map(l => ({ title: l.title, rating: Number(l.rating), reviews: l.review_count }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5),
    [myListings]
  );

  // ── Recent 4 bookings ──────────────────────────────────────
  const recentFour = useMemo(() =>
    [...agencyBookings]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 4),
    [agencyBookings]
  );

  const showSkeletons = bookingsLoading && agencyBookings.length === 0;
  const noData       = !bookingsLoading && agencyBookings.length === 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (verificationStatus !== "verified") return null;

  return (
    <AgencyLayout title="Dashboard">
      <div className="space-y-6">

        {/* ── Header row ────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Overview of your agency performance
          </p>
          <Link
            to="/agency/analytics"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-2"
          >
            <BarChart2 className="h-4 w-4" />
            Full Analytics
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* ── Stats ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {computedStats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  {showSkeletons ? (
                    <Skeleton className="h-8 w-24 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  )}
                  <span className="text-xs text-primary flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    {s.sub}
                  </span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Charts row ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Bookings trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bookings — Last 8 Weeks</CardTitle>
            </CardHeader>
            <CardContent>
              {noData ? (
                <EmptyChart label="No booking data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="bookings"
                      stroke={C_PRIMARY}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: C_PRIMARY }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue — Last 6 Months</CardTitle>
            </CardHeader>
            <CardContent>
              {noData ? (
                <EmptyChart label="No revenue data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyRevenue} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [money.format(v), "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill={C_SECONDARY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Recent Bookings ───────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Booking</th>
                    <th className="pb-2 font-medium">Activity</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {showSkeletons ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td colSpan={6} className="py-3"><Skeleton className="h-5 w-full" /></td>
                      </tr>
                    ))
                  ) : recentFour.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No bookings yet. Once travelers book your activities, they'll appear here.
                      </td>
                    </tr>
                  ) : (
                    recentFour.map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-3 font-mono text-xs font-medium text-foreground">{b.booking_ref}</td>
                        <td className="py-3 text-foreground max-w-[160px] truncate">{b.listing?.title ?? "—"}</td>
                        <td className="py-3 text-muted-foreground">{b.traveler_name ?? "—"}</td>
                        <td className="py-3 text-muted-foreground">{b.trip_date}</td>
                        <td className="py-3 font-medium text-foreground">{money.format(b.total_amount)}</td>
                        <td className="py-3">
                          <Badge variant="secondary" className={statusColor[b.status] ?? ""}>{b.status}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Top listings + Ratings ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top listings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Performing Listings</CardTitle>
            </CardHeader>
            <CardContent>
              {topListings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No booking data yet.</p>
              ) : (
                <div className="space-y-3">
                  {topListings.map((l, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.bookings} booking{l.bookings !== 1 ? "s" : ""} · {money.format(l.revenue)} earned
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-primary">{l.bookings}</div>
                        <div className="text-[10px] text-muted-foreground">bookings</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rating summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Listing Ratings</CardTitle>
            </CardHeader>
            <CardContent>
              {ratedListings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No reviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {ratedListings.map((l, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${(l.rating / 5) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-foreground flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {l.rating.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{l.reviews} review{l.reviews !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Quick Actions ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/agency/listings/new")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Create Listing</p>
                <p className="text-xs text-muted-foreground">Add a new activity</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/agency/availability")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-foreground">Update Availability</p>
                <p className="text-xs text-muted-foreground">Manage open dates</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/agency/earnings")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <p className="font-medium text-foreground">View Payouts</p>
                <p className="text-xs text-muted-foreground">Track your earnings</p>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </AgencyLayout>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
