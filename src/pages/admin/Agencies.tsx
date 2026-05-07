import { useEffect, useState } from "react";
import {
  Building2,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Eye,
  Mail,
  MapPin,
  Phone,
  Calendar,
  FileText,
  Loader2,
  Clock,
  AlertTriangle,
  ExternalLink,
  ShieldOff,
  ShieldCheck,
  DollarSign,
  Star,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useAgencyStore,
  type AgencyApplication,
} from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";

// ── Agency metrics loaded on demand ─────────────────────────────────

interface AgencyMetrics {
  totalBookings: number;
  totalRevenue: number;
  avgRating: number | null;
  listingCount: number;
  lastActiveDate: string | null;
}

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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

  const handleViewDocument = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from("agency-docs")
      .createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not load document. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank");
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

        {/* Agency Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agency Details</DialogTitle>
              <DialogDescription>
                Review agency information and manage their verification status
              </DialogDescription>
            </DialogHeader>
            {selectedAgency && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{selectedAgency.company_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusBadge(selectedAgency.status)}
                      <span className="text-sm text-muted-foreground">
                        Reg: {selectedAgency.registration_number}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Per-agency metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metricsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-1">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : agencyMetrics ? (
                    <>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <BookOpen className="h-3 w-3" />
                          Total Bookings
                        </div>
                        <p className="text-lg font-bold">{agencyMetrics.totalBookings}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <DollarSign className="h-3 w-3" />
                          Total Revenue
                        </div>
                        <p className="text-lg font-bold">{money.format(agencyMetrics.totalRevenue)}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Star className="h-3 w-3" />
                          Avg Rating
                        </div>
                        <p className="text-lg font-bold">
                          {agencyMetrics.avgRating !== null ? agencyMetrics.avgRating.toFixed(1) : "—"}
                        </p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <MapPin className="h-3 w-3" />
                          Live Listings
                        </div>
                        <p className="text-lg font-bold">{agencyMetrics.listingCount}</p>
                      </div>
                    </>
                  ) : null}
                </div>
                {agencyMetrics?.lastActiveDate && (
                  <p className="text-xs text-muted-foreground">
                    Last booking: {new Date(agencyMetrics.lastActiveDate).toLocaleDateString("en-US", {
                      year: "numeric", month: "short", day: "numeric"
                    })}
                  </p>
                )}

                <Separator />

                {/* Company Info */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {selectedAgency.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {selectedAgency.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {selectedAgency.address}, {selectedAgency.city}, {selectedAgency.district}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Applied {formatDate(selectedAgency.created_at)}
                  </div>
                </div>

                {/* Business Details */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h4 className="font-semibold text-sm">Business Details</h4>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">PAN Number:</span>{" "}
                      {selectedAgency.pan_number}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Registration:</span>{" "}
                      {selectedAgency.registration_number}
                    </div>
                    {selectedAgency.website && (
                      <div>
                        <span className="text-muted-foreground">Website:</span>{" "}
                        {selectedAgency.website}
                      </div>
                    )}
                  </div>
                </div>

                {/* Owner Info */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h4 className="font-semibold text-sm">Contact Person</h4>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>{" "}
                      {selectedAgency.owner_name}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{" "}
                      {selectedAgency.owner_phone}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedAgency.description && (
                  <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                    <h4 className="font-semibold text-sm">About</h4>
                    <p className="text-sm text-muted-foreground">{selectedAgency.description}</p>
                  </div>
                )}

                {/* Documents */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Documents
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Tourism License",    url: selectedAgency.license_url,   required: true },
                      { label: "PAN Certificate",    url: selectedAgency.pan_url,        required: true },
                      { label: "Insurance Certificate", url: selectedAgency.insurance_url, required: false },
                    ].map((doc) => (
                      <div key={doc.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {doc.url ? (
                            <CheckCircle className="h-4 w-4 text-primary" />
                          ) : doc.required ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground inline-block" />
                          )}
                          <span>{doc.label}</span>
                        </div>
                        {doc.url ? (
                          <Button variant="outline" size="sm" onClick={() => handleViewDocument(doc.url!)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            View Document
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {doc.required ? "Not uploaded" : "Not uploaded (optional)"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rejection reason */}
                {selectedAgency.status === "rejected" && selectedAgency.rejection_reason && (
                  <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-2">
                    <h4 className="font-semibold text-sm text-destructive">Rejection Reason</h4>
                    <p className="text-sm text-muted-foreground">{selectedAgency.rejection_reason}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Close</Button>
              {selectedAgency && (selectedAgency.status === "pending" || selectedAgency.status === "in_review") && (
                <>
                  <Button variant="destructive" onClick={() => { setShowDetailDialog(false); setShowRejectDialog(true); }}>
                    Reject
                  </Button>
                  <Button onClick={() => { handleApprove(selectedAgency); setShowDetailDialog(false); }}>
                    Approve Agency
                  </Button>
                </>
              )}
              {selectedAgency?.status === "verified" && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDetailDialog(false);
                    setAgencyToSuspend(selectedAgency);
                    setShowSuspendDialog(true);
                  }}
                >
                  <ShieldOff className="h-4 w-4 mr-1" />
                  Suspend
                </Button>
              )}
              {selectedAgency?.status === "suspended" && (
                <Button onClick={() => { handleReactivate(selectedAgency); setShowDetailDialog(false); }}>
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Reactivate
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Application</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting{" "}
                <strong>{selectedAgency?.company_name}</strong>. The agency will
                see this feedback and can resubmit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="e.g. Documents appear to be expired. Please upload current tourism license..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setShowRejectDialog(false); setRejectionReason(""); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectionReason.trim() || actionLoading !== null}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                Reject Application
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suspend Confirmation Dialog */}
        <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend Agency</DialogTitle>
              <DialogDescription>
                This will suspend <strong>{agencyToSuspend?.company_name}</strong>, ban their
                user account, and pause all their active listings. This action can be reversed.
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              The agency will immediately lose access to their dashboard. Active bookings will not be affected.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleSuspend}
                disabled={actionLoading !== null}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldOff className="h-4 w-4 mr-1" />}
                Suspend Agency
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
