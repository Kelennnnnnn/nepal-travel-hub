import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  MapPin,
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
import { ComingSoon } from "@/components/ComingSoon";
import { useAgencyStore } from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// Revenue/bookings stats, the booking/revenue/agency-signup/category charts
// (fed by admin_booking_stats/admin_revenue_by_month/admin_agency_signups/
// admin_bookings_by_category — none of which exist in the current schema;
// they were old-system RPCs never carried over) and Recent Bookings were
// all removed along with the Stripe-based payment model. The pending-
// agency-approvals panel below was ALSO broken independently of payments —
// it called a pre-Phase-4 agencyStore API (allApplications/
// fetchAllApplications/updateApplicationStatus/.status === "verified") that
// no longer exists; fixed here to use the real Phase 4 API.
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { allAgencies, isLoadingAll, fetchAllAgencies, subscribeToAllAgencies, reviewAction } = useAgencyStore();

  const [listedActivities, setListedActivities] = useState<number | null>(null);

  useEffect(() => {
    fetchAllAgencies();
    const unsubscribe = subscribeToAllAgencies();
    return unsubscribe;
  }, [fetchAllAgencies, subscribeToAllAgencies]);

  useEffect(() => {
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .then(({ count, error }) => {
        if (!error) setListedActivities(count ?? 0);
      });
  }, []);

  const pendingApps = useMemo(
    () => allAgencies.filter((a) => a.verification.status === "submitted" || a.verification.status === "in_review"),
    [allAgencies]
  );
  const approvedCount = useMemo(() => allAgencies.filter((a) => a.verification.status === "approved").length, [allAgencies]);

  const handleApprove = async (agencyId: string, name: string) => {
    const { error } = await reviewAction(agencyId, "approve");
    if (error) { toast.error(`Failed to approve: ${error}`); return; }
    toast.success(`${name} has been approved!`);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Agencies</p>
                  {isLoadingAll ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold mt-1">{approvedCount}</p>}
                  <span className="text-xs text-muted-foreground">{pendingApps.length} pending</span>
                </div>
                <div className="p-3 rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Published Activities</p>
                  {listedActivities === null ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold mt-1">{listedActivities.toLocaleString()}</p>}
                  <span className="text-xs text-muted-foreground">Live listings</span>
                </div>
                <div className="p-3 rounded-xl bg-primary/10">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bookings & revenue (coming soon) */}
        <ComingSoon
          title="Booking activity & revenue are coming soon"
          description="We're rolling out a new reservation and payment flow. Booking stats and revenue charts will appear here once it's live."
        />

        {/* Pending Approvals */}
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
                {pendingApps.slice(0, 5).map((item) => (
                  <div key={item.agency.id} className="p-4 rounded-lg border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{item.agency.display_name}</p>
                        <p className="text-sm text-muted-foreground">{item.agency.city}, {item.agency.district}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {item.verification.status === "in_review" ? "In Review" : "Submitted"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Applied {formatDate(item.agency.created_at)}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => handleApprove(item.agency.id, item.agency.display_name)}>
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

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/agencies")}>
                <Building2 className="h-6 w-6" />
                <span>Review Agencies</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/admin/listings")}>
                <MapPin className="h-6 w-6" />
                <span>Moderate Listings</span>
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
