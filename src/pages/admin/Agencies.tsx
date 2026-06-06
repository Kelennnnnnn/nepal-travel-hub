import { useEffect, useState } from "react";
import {
  Building2,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Eye,
  MapPin,
  Loader2,
  Clock,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  useAgencyStore,
  type AgencyApplication,
} from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { AgencyDetailDialog, type AgencyMetrics } from "./agencies/AgencyDetailDialog";
import { AgencyRejectDialog } from "./agencies/AgencyRejectDialog";
import { AgencySuspendDialog } from "./agencies/AgencySuspendDialog";

// ── Main component ───────────────────────────────────────────────────

export default function AdminAgencies() {
  const {
    allApplications,
    isLoadingAll,
    fetchAllApplications,
    subscribeToAllApplications,
    updateApplicationStatus,
  } = useAgencyStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAgency, setSelectedAgency] = useState<AgencyApplication | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [agencyToSuspend, setAgencyToSuspend] = useState<AgencyApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Per-agency metrics for detail dialog
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [agencyMetrics, setAgencyMetrics] = useState<AgencyMetrics | null>(null);

  useEffect(() => {
    fetchAllApplications();
    const unsubscribe = subscribeToAllApplications();
    return unsubscribe;
  }, [fetchAllApplications, subscribeToAllApplications]);

  const filteredAgencies = allApplications.filter((agency) => {
    const matchesSearch =
      agency.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agency.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || agency.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── Fetch per-agency metrics ───────────────────────────────────────

  const loadAgencyMetrics = async (agency: AgencyApplication) => {
    setMetricsLoading(true);
    setAgencyMetrics(null);

    const [bookingsRes, listingsRes, reviewsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("total_amount, created_at")
        .eq("agency_id", agency.user_id)
        .eq("payment_status", "paid"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("agency_id", agency.user_id)
        .eq("status", "published"),
      supabase
        .from("reviews")
        .select("rating")
        .eq("agency_id", agency.user_id),
    ]);

    const bookings = bookingsRes.data ?? [];
    const totalRevenue = bookings.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const dates = bookings.map((b) => b.created_at).sort();
    const lastActiveDate = dates.length > 0 ? dates[dates.length - 1] : null;
    const ratings = (reviewsRes.data ?? []).map((r) => Number(r.rating)).filter(Boolean);
    const avgRating = ratings.length > 0
      ? ratings.reduce((s, r) => s + r, 0) / ratings.length
      : null;

    setAgencyMetrics({
      totalBookings: bookings.length,
      totalRevenue,
      avgRating,
      listingCount: listingsRes.count ?? 0,
      lastActiveDate,
    });
    setMetricsLoading(false);
  };

  const openDetail = (agency: AgencyApplication) => {
    setSelectedAgency(agency);
    setShowDetailDialog(true);
    void loadAgencyMetrics(agency);
  };

  // ── Actions ────────────────────────────────────────────────────────

  const handleApprove = async (agency: AgencyApplication) => {
    setActionLoading(agency.id);
    const { error } = await updateApplicationStatus(agency.id, "verified");
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to approve: ${error}`);
      return;
    }
    toast.success(`${agency.company_name} has been approved!`);
    void logAdminAction("approve_agency", "agency", agency.id, { agency_name: agency.company_name });
  };

  const handleSetInReview = async (agency: AgencyApplication) => {
    setActionLoading(agency.id);
    const { error } = await updateApplicationStatus(agency.id, "in_review");
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to update: ${error}`);
      return;
    }
    toast.success(`${agency.company_name} is now under review.`);
  };

  const handleReject = async () => {
    if (!selectedAgency) return;
    setActionLoading(selectedAgency.id);
    const { error } = await updateApplicationStatus(
      selectedAgency.id,
      "rejected",
      rejectionReason
    );
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to reject: ${error}`);
      return;
    }
    toast.success(`${selectedAgency.company_name} has been rejected.`);
    void logAdminAction("reject_agency", "agency", selectedAgency.id, {
      agency_name: selectedAgency.company_name,
      reason: rejectionReason,
    });
    setShowRejectDialog(false);
    setRejectionReason("");
    setSelectedAgency(null);
  };

  const handleSuspend = async () => {
    if (!agencyToSuspend) return;
    setActionLoading(agencyToSuspend.id);

    // 1. Update status to suspended
    const { error: statusError } = await updateApplicationStatus(agencyToSuspend.id, "suspended");
    if (statusError) {
      toast.error(`Failed to suspend: ${statusError}`);
      setActionLoading(null);
      return;
    }

    // 2. Ban the user account via edge function
    await supabase.functions.invoke("admin-users", {
      body: { action: "suspend", user_id: agencyToSuspend.user_id },
    });

    // 3. Pause all published listings
    await supabase
      .from("listings")
      .update({ status: "paused" })
      .eq("agency_id", agencyToSuspend.user_id)
      .eq("status", "published");

    setActionLoading(null);
    toast.success(`${agencyToSuspend.company_name} has been suspended.`);
    void logAdminAction("suspend_agency", "agency", agencyToSuspend.id, {
      agency_name: agencyToSuspend.company_name,
    });
    setShowSuspendDialog(false);
    setAgencyToSuspend(null);
  };

  const handleReactivate = async (agency: AgencyApplication) => {
    setActionLoading(agency.id);

    // 1. Restore status to verified
    const { error } = await updateApplicationStatus(agency.id, "verified");
    if (error) {
      toast.error(`Failed to reactivate: ${error}`);
      setActionLoading(null);
      return;
    }

    // 2. Unban the user account
    await supabase.functions.invoke("admin-users", {
      body: { action: "unsuspend", user_id: agency.user_id },
    });

    setActionLoading(null);
    toast.success(`${agency.company_name} has been reactivated.`);
    void logAdminAction("reactivate_agency", "agency", agency.id, {
      agency_name: agency.company_name,
    });
  };

  // ── Status badge ───────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-primary text-primary-foreground">Verified</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "in_review":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Review</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "suspended":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Suspended</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const pendingCount   = allApplications.filter((a) => a.status === "pending").length;
  const inReviewCount  = allApplications.filter((a) => a.status === "in_review").length;
  const verifiedCount  = allApplications.filter((a) => a.status === "verified").length;
  const rejectedCount  = allApplications.filter((a) => a.status === "rejected").length;
  const suspendedCount = allApplications.filter((a) => a.status === "suspended").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agency Applications</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Manage and verify travel agency partners
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-xs">Live</span>
            </p>
          </div>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-5 gap-4">
          {[
            { label: "Total",        value: allApplications.length, color: "" },
            { label: "Verified",     value: verifiedCount,  color: "text-primary" },
            { label: "Pending / Review", value: pendingCount + inReviewCount, color: "text-amber-600" },
            { label: "Rejected",     value: rejectedCount,  color: "text-destructive" },
            { label: "Suspended",    value: suspendedCount, color: "text-amber-800" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", "pending", "in_review", "verified", "rejected", "suspended"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoadingAll ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredAgencies.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No applications found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>PAN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgencies.map((agency) => (
                    <TableRow key={agency.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{agency.company_name}</p>
                            <p className="text-sm text-muted-foreground">{agency.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {agency.city}, {agency.district}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{agency.pan_number}</code>
                      </TableCell>
                      <TableCell>{getStatusBadge(agency.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(agency.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={actionLoading === agency.id}>
                              {actionLoading === agency.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(agency)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {agency.status === "pending" && (
                              <DropdownMenuItem onClick={() => handleSetInReview(agency)}>
                                <Clock className="h-4 w-4 mr-2" />
                                Mark In Review
                              </DropdownMenuItem>
                            )}
                            {(agency.status === "pending" || agency.status === "in_review") && (
                              <>
                                <DropdownMenuItem onClick={() => handleApprove(agency)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedAgency(agency); setShowRejectDialog(true); }}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {agency.status === "verified" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setAgencyToSuspend(agency); setShowSuspendDialog(true); }}
                                >
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  Suspend Agency
                                </DropdownMenuItem>
                              </>
                            )}
                            {agency.status === "suspended" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleReactivate(agency)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Reactivate Agency
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AgencyDetailDialog
          open={showDetailDialog}
          onOpenChange={setShowDetailDialog}
          agency={selectedAgency}
          metrics={agencyMetrics}
          metricsLoading={metricsLoading}
          statusBadge={getStatusBadge}
          formatDate={formatDate}
          onApprove={handleApprove}
          onReject={() => setShowRejectDialog(true)}
          onSuspend={() => { setAgencyToSuspend(selectedAgency); setShowSuspendDialog(true); }}
          onReactivate={handleReactivate}
        />

        <AgencyRejectDialog
          open={showRejectDialog}
          onOpenChange={setShowRejectDialog}
          agency={selectedAgency}
          rejectionReason={rejectionReason}
          onReasonChange={setRejectionReason}
          onConfirm={handleReject}
          actionLoading={actionLoading}
        />

        <AgencySuspendDialog
          open={showSuspendDialog}
          onOpenChange={setShowSuspendDialog}
          agency={agencyToSuspend}
          onConfirm={handleSuspend}
          actionLoading={actionLoading}
        />
      </div>
    </AdminLayout>
  );
}
