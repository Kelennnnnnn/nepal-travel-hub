import { useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookingsStore } from "@/stores/bookingsStore";
import { useListingsStore } from "@/stores/listingsStore";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { parseISO, format } from "date-fns";
import { TrendingUp, Users, DollarSign, Star, Info } from "lucide-react";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const tooltipStyle = {
  backgroundColor: "hsl(36, 60%, 98%)",
  border: "1px solid hsl(220, 10%, 88%)",
  borderRadius: "8px",
  fontSize: "12px",
};

const PIE_COLORS = [
  "hsl(18, 83%, 40%)",
  "hsl(43, 96%, 56%)",
  "hsl(142, 70%, 45%)",
  "hsl(200, 80%, 50%)",
  "hsl(270, 60%, 55%)",
  "hsl(330, 70%, 50%)",
  "hsl(18, 60%, 60%)",
  "hsl(43, 70%, 65%)",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AgencyAnalytics() {
  const { agencyBookings, isLoading: bookingsLoading, fetchAgencyBookings } = useBookingsStore();
  const { myListings, fetchMyListings } = useListingsStore();

  useEffect(() => {
    if (agencyBookings.length === 0) void fetchAgencyBookings();
    if (myListings.length === 0)     void fetchMyListings();
  }, [fetchAgencyBookings, fetchMyListings]);

  // ── Funnel data ─────────────────────────────────────────────
  const funnelData = useMemo(() => {
    const total       = agencyBookings.length;
    const confirmed   = agencyBookings.filter(b => b.status === "confirmed" || b.status === "completed").length;
    const completed   = agencyBookings.filter(b => b.status === "completed").length;
    const paid        = agencyBookings.filter(b => b.payment_status === "paid").length;
    return [
      { stage: "Total Bookings",  count: total,     pct: 100,                                                color: "bg-primary/80" },
      { stage: "Confirmed",       count: confirmed, pct: total ? Math.round((confirmed / total) * 100) : 0,  color: "bg-primary/60" },
      { stage: "Paid",            count: paid,      pct: total ? Math.round((paid / total) * 100) : 0,       color: "bg-primary/40" },
      { stage: "Completed",       count: completed, pct: total ? Math.round((completed / total) * 100) : 0,  color: "bg-primary/20" },
    ];
  }, [agencyBookings]);

  // ── Revenue by listing ─────────────────────────────────────
  const revenueByListing = useMemo(() => {
    const stats: Record<string, { name: string; revenue: number; bookings: number }> = {};
    agencyBookings.forEach(b => {
      if (!stats[b.listing_id]) {
        stats[b.listing_id] = { name: b.listing?.title ?? "Unknown", revenue: 0, bookings: 0 };
      }
      stats[b.listing_id].bookings++;
      if (b.payment_status === "paid") stats[b.listing_id].revenue += b.net_payout;
    });
    return Object.values(stats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map(l => ({
        ...l,
        name: l.name.length > 28 ? l.name.slice(0, 26) + "…" : l.name,
      }));
  }, [agencyBookings]);

  // ── Revenue by listing (pie) ───────────────────────────────
  const pieData = useMemo(() =>
    revenueByListing.filter(l => l.revenue > 0).slice(0, 6),
    [revenueByListing]
  );

  // ── Seasonal patterns (bookings by month name) ─────────────
  const seasonalData = useMemo(() => {
    const counts = Array(12).fill(0);
    agencyBookings.forEach(b => {
      const month = parseISO(b.created_at).getMonth();
      counts[month]++;
    });
    return MONTHS.map((m, i) => ({ month: m, bookings: counts[i] }));
  }, [agencyBookings]);

  // ── Guest demographics (histogram of guests per booking) ───
  const guestDemographics = useMemo(() => {
    const dist: Record<number, number> = {};
    agencyBookings.forEach(b => {
      dist[b.guests] = (dist[b.guests] ?? 0) + 1;
    });
    return Object.entries(dist)
      .map(([guests, count]) => ({ guests: `${guests} guest${Number(guests) !== 1 ? "s" : ""}`, count }))
      .sort((a, b) => {
        const ga = Number(a.guests.split(" ")[0]);
        const gb = Number(b.guests.split(" ")[0]);
        return ga - gb;
      });
  }, [agencyBookings]);

  // ── Summary KPIs ───────────────────────────────────────────
  const kpis = useMemo(() => {
    const paid     = agencyBookings.filter(b => b.payment_status === "paid");
    const totalRev = paid.reduce((s, b) => s + b.net_payout, 0);
    const totalGuests = agencyBookings.reduce((s, b) => s + b.guests, 0);
    const avgGuests = agencyBookings.length
      ? (totalGuests / agencyBookings.length).toFixed(1)
      : "—";
    const ratings = myListings.map(l => Number(l.rating)).filter(r => r > 0);
    const avgRating = ratings.length
      ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : "—";
    const convRate = agencyBookings.length
      ? Math.round(
          (agencyBookings.filter(b => b.payment_status === "paid").length / agencyBookings.length) * 100
        )
      : 0;
    return [
      { label: "Total Revenue",       value: money.format(totalRev),     icon: DollarSign },
      { label: "Avg. Guests/Booking", value: avgGuests,                  icon: Users },
      { label: "Avg. Rating",         value: avgRating,                  icon: Star },
      { label: "Payment Rate",        value: `${convRate}%`,             icon: TrendingUp },
    ];
  }, [agencyBookings, myListings]);

  const noData = !bookingsLoading && agencyBookings.length === 0;

  return (
    <AgencyLayout title="Analytics">
      <div className="space-y-6">

        {/* ── KPI strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <k.icon className="h-4 w-4 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Booking conversion funnel ─────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Booking Conversion Funnel</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tracks how bookings progress from received to completed
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg">
                <Info className="h-3.5 w-3.5" />
                View tracking coming soon
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {noData ? (
              <EmptySection label="No booking data yet" />
            ) : (
              <div className="space-y-3 max-w-lg">
                {funnelData.map((row) => (
                  <div key={row.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{row.stage}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.count} <span className="text-xs">({row.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.color} transition-all duration-700`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Revenue by listing ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Horizontal bar */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue by Listing</CardTitle>
            </CardHeader>
            <CardContent>
              {noData || revenueByListing.length === 0 ? (
                <EmptySection label="No revenue data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, revenueByListing.length * 40)}>
                  <BarChart
                    layout="vertical"
                    data={revenueByListing}
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [money.format(v), "Revenue"]}
                    />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {revenueByListing.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Pie share */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Share</CardTitle>
            </CardHeader>
            <CardContent>
              {noData || pieData.length === 0 ? (
                <EmptySection label="No revenue data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [money.format(v), "Revenue"]}
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Seasonal patterns + Guest demographics ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Seasonal booking patterns */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Seasonal Booking Patterns</CardTitle>
              <p className="text-xs text-muted-foreground">Bookings received by calendar month (all time)</p>
            </CardHeader>
            <CardContent>
              {noData ? (
                <EmptySection label="No booking data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={seasonalData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="bookings" fill="hsl(18, 83%, 40%)" radius={[4, 4, 0, 0]}>
                      {seasonalData.map((entry, i) => {
                        const peak = Math.max(...seasonalData.map(d => d.bookings));
                        const isPeak = entry.bookings === peak && peak > 0;
                        return (
                          <Cell
                            key={i}
                            fill={isPeak ? "hsl(43, 96%, 56%)" : "hsl(18, 83%, 40%)"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Guest demographics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Guest Group Size Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">How many guests per booking</p>
            </CardHeader>
            <CardContent>
              {noData || guestDemographics.length === 0 ? (
                <EmptySection label="No booking data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={guestDemographics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" vertical={false} />
                    <XAxis dataKey="guests" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="hsl(142, 70%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Booking timeline table ────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Booking Timeline</CardTitle>
            <p className="text-xs text-muted-foreground">All bookings sorted by trip date</p>
          </CardHeader>
          <CardContent>
            {agencyBookings.length === 0 ? (
              <EmptySection label="No bookings yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Trip Date</th>
                      <th className="pb-2 font-medium">Activity</th>
                      <th className="pb-2 font-medium">Guests</th>
                      <th className="pb-2 font-medium">Revenue</th>
                      <th className="pb-2 font-medium">Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...agencyBookings]
                      .sort((a, b) => b.trip_date.localeCompare(a.trip_date))
                      .slice(0, 20)
                      .map((b) => (
                        <tr key={b.id} className="border-b last:border-0">
                          <td className="py-2.5 font-medium text-foreground tabular-nums">{b.trip_date}</td>
                          <td className="py-2.5 text-foreground max-w-[180px] truncate">{b.listing?.title ?? "—"}</td>
                          <td className="py-2.5 text-muted-foreground">{b.guests}</td>
                          <td className="py-2.5 font-medium text-foreground">
                            {b.payment_status === "paid" ? money.format(b.net_payout) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 text-muted-foreground tabular-nums">
                            {format(parseISO(b.created_at), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AgencyLayout>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{label}</div>
  );
}
