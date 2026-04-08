import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  CheckCircle,
  Clock,
  Eye,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAgencyStore } from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const {
    allApplications,
    isLoadingAll,
    fetchAllApplications,
    subscribeToAllApplications,
    updateApplicationStatus,
  } = useAgencyStore();

  const [statsLoading, setStatsLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [listedActivities, setListedActivities] = useState(0);

  const [recentLoading, setRecentLoading] = useState(true);
  const [recentRows, setRecentRows] = useState<RecentBookingRow[]>([]);

  useEffect(() => {
    fetchAllApplications();
    const unsubscribe = subscribeToAllApplications();
    return unsubscribe;
  }, [fetchAllApplications, subscribeToAllApplications]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardStats() {
      setStatsLoading(true);
      setRecentLoading(true);

      const paidBookingsPromise = supabase
        .from("bookings")
        .select("total_amount")
        .eq("payment_status", "paid");

      const bookingsCountPromise = supabase
        .from("bookings")
        .select("*", { count: "exact", head: true });

      const listingsCountPromise = supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("status", "published");

      const recentPromise = supabase
        .from("bookings")
        .select(
          `
          id,
          booking_ref,
          agency_id,
          total_amount,
          status,
          created_at,
          traveler_name,
          listing:listings ( title )
        `
        )
        .order("created_at", { ascending: false })
        .limit(5);

      try {
        const [paidRes, bookingsCountRes, listingsCountRes, recentRes] = await Promise.all([
          paidBookingsPromise,
          bookingsCountPromise,
          listingsCountPromise,
          recentPromise,
        ]);

        if (cancelled) return;

        if (paidRes.error) {
          console.error(paidRes.error.message);
        }
        const revenue =
          paidRes.data?.reduce((acc, row) => acc + Number(row.total_amount ?? 0), 0) ?? 0;
        setTotalRevenue(Number.isFinite(revenue) ? revenue : 0);

        if (bookingsCountRes.error) {
          console.error(bookingsCountRes.error.message);
          setTotalBookings(0);
        } else {
          setTotalBookings(bookingsCountRes.count ?? 0);
        }

        if (listingsCountRes.error) {
          console.error(listingsCountRes.error.message);
          setListedActivities(0);
        } else {
          setListedActivities(listingsCountRes.count ?? 0);
        }

        if (recentRes.error) {
          console.error(recentRes.error.message);
          toast.error("Could not load recent bookings.");
          setRecentRows([]);
        } else {
          setRecentRows((recentRes.data ?? []) as RecentBookingRow[]);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
          setRecentLoading(false);
        }
      }
    }

    void loadDashboardStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingApps = allApplications.filter(
    (a) => a.status === "pending" || a.status === "in_review"
  );
  const verifiedCount = allApplications.filter(
    (a) => a.status === "verified"
  ).length;

  const handleApprove = async (id: string, name: string) => {
    const { error } = await updateApplicationStatus(id, "verified");
    if (error) {
      toast.error(`Failed to approve: ${error}`);
      return;
    }
    toast.success(`${name} has been approved!`);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  const stats = useMemo(
    () => [
      {
        title: "Total Revenue",
        value: money.format(totalRevenue),
        change: "Paid bookings",
        icon: DollarSign,
      },
      {
        title: "Active Agencies",
        value: String(verifiedCount),
        change: `${pendingApps.length} pending`,
        icon: Building2,
      },
      {
        title: "Total Bookings",
        value: totalBookings.toLocaleString(),
        change: "All statuses",
        icon: Calendar,
      },
      {
        title: "Listed Activities",
        value: listedActivities.toLocaleString(),
        change: "Published",
        icon: MapPin,
      },
    ],
    [totalRevenue, verifiedCount, pendingApps.length, totalBookings, listedActivities]
  );

  const recentBookings = useMemo(
    () =>
      recentRows.map((row) => ({
        id: row.id,
        booking_ref: row.booking_ref,
        activity: listingTitle(row.listing),
        customer: row.traveler_name?.trim() || "—",
        agency:
          allApplications.find((a) => a.user_id === row.agency_id)?.company_name ?? "—",
        amount: Number(row.total_amount ?? 0),
        status: row.status,
        date: row.created_at.split("T")[0],
      })),
    [recentRows, allApplications]
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's what's happening with your platform.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {stat.title}
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-28 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm text-primary">
                        {stat.change}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10">
                    <stat.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Bookings */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Bookings</CardTitle>
              <Button variant="outline" size="sm">
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLoading ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                        <div className="text-right space-y-2">
                          <Skeleton className="h-5 w-16 ml-auto" />
                          <Skeleton className="h-4 w-12 ml-auto" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : recentBookings.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">
                    No bookings yet.
                  </p>
                ) : (
                  recentBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{booking.activity}</span>
                          <Badge
                            variant={badgeVariant(booking.status)}
                            className="text-xs"
                          >
                            {booking.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          <span className="font-mono text-xs">{booking.booking_ref}</span>
                          {" · "}
                          {booking.customer} • {booking.agency}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${booking.amount.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(booking.date)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pending Agencies — LIVE */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Pending Approvals
                {pendingApps.length > 0 && (
                  <Badge className="bg-secondary text-secondary-foreground">
                    {pendingApps.length}
                  </Badge>
                )}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
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
                    <div
                      key={agency.id}
                      className="p-4 rounded-lg border border-border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{agency.company_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {agency.city}, {agency.district}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {agency.status === "in_review"
                            ? "In Review"
                            : "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Applied {formatDate(agency.created_at)}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            handleApprove(agency.id, agency.company_name)
                          }
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => navigate("/admin/agencies")}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingApps.length > 5 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => navigate("/admin/agencies")}
                    >
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
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col gap-2"
                onClick={() => navigate("/admin/agencies")}
              >
                <Building2 className="h-6 w-6" />
                <span>Review Agencies</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col gap-2"
                onClick={() => navigate("/admin/listings")}
              >
                <MapPin className="h-6 w-6" />
                <span>Moderate Listings</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col gap-2"
              >
                <DollarSign className="h-6 w-6" />
                <span>Process Payments</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col gap-2"
              >
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
