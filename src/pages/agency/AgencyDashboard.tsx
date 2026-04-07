import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAgencyStore } from "@/stores/agencyStore";
import { DollarSign, Eye, Star, TrendingUp, Users, CalendarDays, Loader2 } from "lucide-react";

const stats = [
  { label: "Total Earnings", value: "$12,450", change: "+18%", icon: DollarSign },
  { label: "Active Bookings", value: "24", change: "+5", icon: CalendarDays },
  { label: "Profile Views", value: "1,892", change: "+12%", icon: Eye },
  { label: "Avg. Rating", value: "4.8", change: "+0.1", icon: Star },
];

const recentBookings = [
  { id: "BK-001", activity: "Everest Base Camp Trek", customer: "John Smith", date: "2026-04-15", guests: 2, amount: 3798, status: "confirmed" },
  { id: "BK-002", activity: "Paragliding Over Pokhara", customer: "Sarah Lee", date: "2026-04-12", guests: 1, amount: 120, status: "pending" },
  { id: "BK-003", activity: "Chitwan Safari Experience", customer: "Mike Chen", date: "2026-04-20", guests: 4, amount: 1800, status: "confirmed" },
  { id: "BK-004", activity: "Langtang Valley Trek", customer: "Emma Wilson", date: "2026-04-25", guests: 3, amount: 3297, status: "pending" },
];

const statusColor: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function AgencyDashboard() {
  const navigate = useNavigate();
  const { verificationStatus, isLoading, fetchMyApplication } = useAgencyStore();

  useEffect(() => {
    fetchMyApplication();
  }, [fetchMyApplication]);

  // Show loader while checking status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect based on status
  useEffect(() => {
    if (!isLoading) {
      if (verificationStatus === "unregistered") {
        navigate("/agency/onboarding");
      } else if (verificationStatus !== "verified") {
        navigate("/agency/onboarding/status");
      }
    }
  }, [verificationStatus, isLoading, navigate]);

  if (verificationStatus !== "verified") return null;

  return (
    <AgencyLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  <span className="text-xs text-primary flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3" /> {s.change}
                  </span>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Bookings */}
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
                  {recentBookings.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-3 font-medium text-foreground">{b.id}</td>
                      <td className="py-3 text-foreground">{b.activity}</td>
                      <td className="py-3 text-muted-foreground">{b.customer}</td>
                      <td className="py-3 text-muted-foreground">{b.date}</td>
                      <td className="py-3 font-medium text-foreground">${b.amount}</td>
                      <td className="py-3">
                        <Badge variant="secondary" className={statusColor[b.status]}>
                          {b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
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
