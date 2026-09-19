import { useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ComingSoon } from "@/components/ComingSoon";
import { useAgencyStore } from "@/stores/agencyStore";
import { useListingsStore } from "@/stores/listingsStore";
import {
  Eye, Star, CalendarDays, Loader2, ClipboardList,
} from "lucide-react";

// Booking/earnings widgets (net earnings, active bookings, weekly bookings
// trend, monthly revenue, recent bookings, top listings by booking count,
// "View Payouts" quick action) were removed here along with the rest of the
// Stripe-based payment model they were computed from. Listing-only widgets
// (below) are unaffected and kept.
export default function AgencyDashboard() {
  const navigate = useNavigate();

  const { verificationStatus, isLoading, fetchMyApplication } = useAgencyStore();
  const { myListings, isLoading: listingsLoading, fetchMyListings } = useListingsStore();

  useEffect(() => { fetchMyApplication(); }, [fetchMyApplication]);
  useEffect(() => {
    if (myListings.length === 0) void fetchMyListings();
  }, [fetchMyListings, myListings.length]);

  useEffect(() => {
    if (!isLoading) {
      if (verificationStatus === "unregistered") navigate("/agency/onboarding");
      else if (verificationStatus !== "approved") navigate("/agency/onboarding/status");
    }
  }, [verificationStatus, isLoading, navigate]);

  const activeListings = useMemo(() => myListings.filter((l) => l.status === "published").length, [myListings]);
  const avgRating = useMemo(() => {
    const ratings = myListings.map((l) => Number(l.rating)).filter((r) => r > 0);
    return ratings.length ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1) : "—";
  }, [myListings]);

  const ratedListings = useMemo(() =>
    myListings
      .filter((l) => Number(l.rating) > 0)
      .map((l) => ({ title: l.title, rating: Number(l.rating), reviews: l.review_count }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5),
    [myListings]
  );

  const showSkeletons = listingsLoading && myListings.length === 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (verificationStatus !== "approved") return null;

  return (
    <AgencyLayout title="Dashboard">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Overview of your agency performance</p>

        {/* ── Stats ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Listings</p>
                {showSkeletons ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold text-foreground mt-1">{activeListings}</p>}
                <span className="text-xs text-muted-foreground mt-1 block">Published</span>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Eye className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Rating</p>
                {showSkeletons ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-2xl font-bold text-foreground mt-1">{avgRating}</p>}
                <span className="text-xs text-muted-foreground mt-1 block">From your listings</span>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Bookings & earnings (coming soon) ────────────────── */}
        <ComingSoon
          icon={ClipboardList}
          title="Bookings & earnings are coming soon"
          description="We're rolling out a new reservation and payment flow. Your booking activity and earnings will appear here once it's live."
        />

        {/* ── Ratings ───────────────────────────────────────── */}
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
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(l.rating / 5) * 100}%` }} />
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

        {/* ── Quick Actions ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/agency/listings/new")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Eye className="h-5 w-5 text-primary" />
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
        </div>
      </div>
    </AgencyLayout>
  );
}
