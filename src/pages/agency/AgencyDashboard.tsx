import { useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgencyStore } from "@/stores/agencyStore";
import { useBookingsStore } from "@/stores/bookingsStore";
import { useListingsStore } from "@/stores/listingsStore";
import {
  DollarSign,
  Eye,
  Star,
  TrendingUp,
  Users,
  CalendarDays,
  Loader2,
} from "lucide-react";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const statusColor: Record<string, string> = {
  confirmed:       "bg-primary/10 text-primary",
  pending_payment: "bg-amber-100 text-amber-700",
  pending:         "bg-amber-100 text-amber-700",
  completed:       "bg-muted text-muted-foreground",
  cancelled:       "bg-destructive/10 text-destructive",
};

export default function AgencyDashboard() {
  const navigate = useNavigate();

  // ── Verification gate ──────────────────────────────────────
  const { verificationStatus, isLoading, fetchMyApplication } = useAgencyStore();

  // ── Real data ──────────────────────────────────────────────
  const {
    agencyBookings,
    isLoading: bookingsLoading,
    fetchAgencyBookings,
  } = useBookingsStore();

  const { myListings, fetchMyListings } = useListingsStore();

  // ALL hooks must be declared before any early return
  useEffect(() => {
    fetchMyApplication();
  }, [fetchMyApplication]);

  useEffect(() => {
    if (agencyBookings.length === 0) void fetchAgencyBookings();
    if (myListings.length === 0)     void fetchMyListings();
  }, [fetchAgencyBookings, fetchMyListings]);

  // Redirect effect — runs after isLoading resolves
  useEffect(() => {
    if (!isLoading) {
      if (verificationStatus === "unregistered") {
        navigate("/agency/onboarding");
      } else if (verificationStatus !== "verified") {
        navigate("/agency/onboarding/status");
      }
    }
  }, [verificationStatus, isLoading, navigate]);

  // ── Computed stats ─────────────────────────────────────────
  const computedStats = useMemo(() => {
    const paidBookings  = agencyBookings.filter(b => b.payment_status === "paid");
    const netEarnings   = paidBookings.reduce((s, b) => s + b.net_payout, 0);
    const activeBookings = agencyBookings.filter(b => b.status === "confirmed").length;
    const activeListings  = myListings.filter(l => l.status === "published").length;
    const ratings = myListings.map(l => Number(l.rating)).filter(r => r > 0);
    const avgRating = ratings.length
      ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : "—";

    return [
      { label: "Net Earnings",    value: money.format(netEarnings), icon: DollarSign },
      { label: "Active Bookings", value: String(activeBookings),    icon: CalendarDays },
      { label: "Active Listings", value: String(activeListings),    icon: Eye },
      { label: "Avg. Rating",     value: avgRating,                 icon: Star },
    ];
  }, [agencyBookings, myListings]);

  // ── 4 most recent bookings ─────────────────────────────────
  const recentFour = useMemo(() =>
    [...agencyBookings]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 4),
    [agencyBookings]
  );

  const showSkeletons = bookingsLoading && agencyBookings.length === 0;

  // ── Early returns after all hooks ──────────────────────────
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
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {s.value}
                    </p>
                  )}
                  <span className="text-xs text-primary flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    {s.label === "Net Earnings"    ? "Paid bookings" :
                     s.label === "Active Bookings" ? "Status: confirmed" :
                     s.label === "Active Listings" ? "Published" :
                     "From your listings"}
                  </span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
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
                        <td colSpan={6} className="py-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : recentFour.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No bookings yet. Once travelers book your activities,
                        they'll appear here.
                      </td>
                    </tr>
                  ) : (
                    recentFour.map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-3 font-medium text-foreground font-mono text-xs">
                          {b.booking_ref}
                        </td>
                        <td className="py-3 text-foreground max-w-[160px] truncate">
                          {b.listing?.title ?? "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {b.traveler_name ?? "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {b.trip_date}
                        </td>
                        <td className="py-3 font-medium text-foreground">
                          {money.format(b.total_amount)}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="secondary"
                            className={statusColor[b.status] ?? ""}
                          >
                            {b.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Quick Actions ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate("/agency/listings/new")}
          >
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

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate("/agency/availability")}
          >
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

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate("/agency/earnings")}
          >
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
