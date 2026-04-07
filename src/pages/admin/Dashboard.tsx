import { useEffect } from "react";
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
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAgencyStore } from "@/stores/agencyStore";
import { toast } from "sonner";

const recentBookings = [
  {
    id: "BK001",
    activity: "Everest Base Camp Trek",
    customer: "Sarah Mitchell",
    agency: "Himalayan Expeditions",
    amount: 1899,
    status: "confirmed",
    date: "2024-01-15",
  },
  {
    id: "BK002",
    activity: "Paragliding Over Pokhara",
    customer: "James Wilson",
    agency: "Sky Riders Nepal",
    amount: 120,
    status: "pending",
    date: "2024-01-15",
  },
  {
    id: "BK003",
    activity: "Chitwan Safari Experience",
    customer: "Emma Thompson",
    agency: "Nepal Wildlife Tours",
    amount: 450,
    status: "confirmed",
    date: "2024-01-14",
  },
  {
    id: "BK004",
    activity: "Annapurna Circuit Trek",
    customer: "Michael Chen",
    agency: "Mountain Trail Nepal",
    amount: 1599,
    status: "cancelled",
    date: "2024-01-14",
  },
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

  useEffect(() => {
    fetchAllApplications();
    const unsubscribe = subscribeToAllApplications();
    return unsubscribe;
  }, [fetchAllApplications, subscribeToAllApplications]);

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
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const stats = [
    {
      title: "Total Revenue",
      value: "$124,500",
      change: "+12.5%",
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
      value: "2,847",
      change: "+23.1%",
      icon: Calendar,
    },
    {
      title: "Listed Activities",
      value: "432",
      change: "+15 new",
      icon: MapPin,
    },
  ];

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
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
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
                {recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.activity}</span>
                        <Badge
                          variant={
                            booking.status === "confirmed"
                              ? "default"
                              : booking.status === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {booking.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {booking.customer} • {booking.agency}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${booking.amount}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.date}
                      </p>
                    </div>
                  </div>
                ))}
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
