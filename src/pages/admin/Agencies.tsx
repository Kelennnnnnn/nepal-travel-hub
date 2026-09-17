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
  HelpCircle,
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
  type AgencyListItem,
  type AgencyDocument,
} from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { AgencyDetailDialog, type AgencyMetrics } from "./agencies/AgencyDetailDialog";
import { AgencyRejectDialog } from "./agencies/AgencyRejectDialog";
import { AgencySuspendDialog } from "./agencies/AgencySuspendDialog";
import { AgencyRequestInfoDialog } from "./agencies/AgencyRequestInfoDialog";

// ── Main component ───────────────────────────────────────────────────

export default function AdminAgencies() {
  const {
    allAgencies,
    isLoadingAll,
    fetchAllAgencies,
    subscribeToAllAgencies,
    fetchAgencyDocuments,
    reviewAction,
  } = useAgencyStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAgency, setSelectedAgency] = useState<AgencyListItem | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showRequestInfoDialog, setShowRequestInfoDialog] = useState(false);
  const [agencyToSuspend, setAgencyToSuspend] = useState<AgencyListItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [requestInfoNote, setRequestInfoNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Per-agency metrics + documents for detail dialog
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [agencyMetrics, setAgencyMetrics] = useState<AgencyMetrics | null>(null);
  const [documents, setDocuments] = useState<AgencyDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  useEffect(() => {
    fetchAllAgencies();
    const unsubscribe = subscribeToAllAgencies();
    return unsubscribe;
  }, [fetchAllAgencies, subscribeToAllAgencies]);

  const filteredAgencies = allAgencies.filter((item) => {
    const matchesSearch =
      item.agency.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.agency.email ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.verification.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── Fetch per-agency metrics + documents ───────────────────────────

  const loadAgencyDetail = async (item: AgencyListItem) => {
    setMetricsLoading(true);
    setAgencyMetrics(null);
    setDocumentsLoading(true);
    setDocuments([]);

    const [bookingsRes, listingsRes, reviewsRes, docs] = await Promise.all([
      supabase.from("bookings").select("*").eq("agency_id", item.agency.id).eq("payment_status", "paid"),
      supabase.from("listings").select("*", { count: "exact", head: true }).eq("agency_id", item.agency.id).eq("status", "published"),
      supabase.from("reviews").select("rating").eq("agency_id", item.agency.id),
      fetchAgencyDocuments(item.agency.id),
    ]);

    // total_amount lives on booking_quotes, not bookings, in the Phase 2
    // schema — bookings only stores quote_id. Join client-side rather than
    // a server-side join here since this is a small, on-demand admin-panel
    // enrichment query, not a hot path.
    const bookings = bookingsRes.data ?? [];
    let totalRevenue = 0;
    if (bookings.length > 0) {
      const quoteIds = bookings.map((b) => b.quote_id as string);
      const { data: quotes } = await supabase.from("booking_quotes").select("id, product_value").in("id", quoteIds);
      const valueByQuote = new Map((quotes ?? []).map((q) => [q.id as string, Number(q.product_value)]));
      totalRevenue = bookings.reduce((s, b) => s + (valueByQuote.get(b.quote_id as string) ?? 0), 0);
    }
    const dates = bookings.map((b) => b.created_at as string).sort();
    const lastActiveDate = dates.length > 0 ? dates[dates.length - 1] : null;
    const ratings = (reviewsRes.data ?? []).map((r) => Number(r.rating)).filter(Boolean);
    const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

    setAgencyMetrics({
      totalBookings: bookings.length,
      totalRevenue,
      avgRating,
      listingCount: listingsRes.count ?? 0,
      lastActiveDate,
    });
    setMetricsLoading(false);
    setDocuments(docs);
    setDocumentsLoading(false);
  };

  const openDetail = (item: AgencyListItem) => {
    setSelectedAgency(item);
    setShowDetailDialog(true);
    void loadAgencyDetail(item);
  };

  // ── Actions ────────────────────────────────────────────────────────

  const runAction = async (
    item: AgencyListItem,
    action: "start_review" | "request_info" | "approve" | "reject" | "suspend" | "reinstate",
    extra: { reason?: string; note?: string } | undefined,
    successMessage: string,
  ) => {
    setActionLoading(item.agency.id);
    const { error } = await reviewAction(item.agency.id, action, extra);
    setActionLoading(null);
    if (error) { toast.error(error); return false; }
    toast.success(successMessage);
    return true;
  };

  const handleStartReview = (item: AgencyListItem) =>
    void runAction(item, "start_review", undefined, `${item.agency.display_name} is now under review.`);

  const handleApprove = (item: AgencyListItem) =>
    void runAction(item, "approve", undefined, `${item.agency.display_name} has been approved!`);

  const handleReject = async () => {
    if (!selectedAgency) return;
    const ok = await runAction(selectedAgency, "reject", { reason: rejectionReason }, `${selectedAgency.agency.display_name} has been rejected.`);
    if (ok) { setShowRejectDialog(false); setRejectionReason(""); setSelectedAgency(null); }
  };

  const handleRequestInfo = async () => {
    if (!selectedAgency) return;
    const ok = await runAction(selectedAgency, "request_info", { note: requestInfoNote }, `Requested more information from ${selectedAgency.agency.display_name}.`);
    if (ok) { setShowRequestInfoDialog(false); setRequestInfoNote(""); setSelectedAgency(null); }
  };

  const handleSuspend = async () => {
    if (!agencyToSuspend) return;
    const ok = await runAction(agencyToSuspend, "suspend", { reason: suspendReason }, `${agencyToSuspend.agency.display_name} has been suspended.`);
    if (ok) { setShowSuspendDialog(false); setSuspendReason(""); setAgencyToSuspend(null); }
  };

  const handleReinstate = (item: AgencyListItem) =>
    void runAction(item, "reinstate", undefined, `${item.agency.display_name} has been reinstated.`);

  // ── Status badge ───────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-primary text-primary-foreground">Verified</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "submitted":
        return <Badge variant="secondary">Pending</Badge>;
      case "in_review":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Review</Badge>;
      case "more_info_required":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Info Requested</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "suspended":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Suspended</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const pendingCount   = allAgencies.filter((a) => a.verification.status === "submitted" || a.verification.status === "more_info_required").length;
  const inReviewCount  = allAgencies.filter((a) => a.verification.status === "in_review").length;
  const verifiedCount  = allAgencies.filter((a) => a.verification.status === "approved").length;
  const rejectedCount  = allAgencies.filter((a) => a.verification.status === "rejected").length;
  const suspendedCount = allAgencies.filter((a) => a.verification.status === "suspended").length;

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
            { label: "Total",        value: allAgencies.length, color: "" },
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
            {["all", "submitted", "in_review", "more_info_required", "approved", "rejected", "suspended"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status.replace(/_/g, " ")}
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
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgencies.map((item) => (
                    <TableRow key={item.agency.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{item.agency.display_name}</p>
                            <p className="text-sm text-muted-foreground">{item.agency.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {[item.agency.city, item.agency.district].filter(Boolean).join(", ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.verification.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.verification.submitted_at ? formatDate(item.verification.submitted_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Actions" disabled={actionLoading === item.agency.id}>
                              {actionLoading === item.agency.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(item)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {item.verification.status === "submitted" && (
                              <DropdownMenuItem onClick={() => handleStartReview(item)}>
                                <Clock className="h-4 w-4 mr-2" />
                                Mark In Review
                              </DropdownMenuItem>
                            )}
                            {(item.verification.status === "submitted" || item.verification.status === "in_review" || item.verification.status === "more_info_required") && (
                              <>
                                <DropdownMenuItem onClick={() => { setSelectedAgency(item); setShowRequestInfoDialog(true); }}>
                                  <HelpCircle className="h-4 w-4 mr-2" />
                                  Request Info
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleApprove(item)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedAgency(item); setShowRejectDialog(true); }}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {item.verification.status === "approved" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setAgencyToSuspend(item); setShowSuspendDialog(true); }}
                                >
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  Suspend Agency
                                </DropdownMenuItem>
                              </>
                            )}
                            {item.verification.status === "suspended" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleReinstate(item)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Reinstate Agency
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
          item={selectedAgency}
          documents={documents}
          documentsLoading={documentsLoading}
          metrics={agencyMetrics}
          metricsLoading={metricsLoading}
          statusBadge={getStatusBadge}
          formatDate={formatDate}
          onStartReview={handleStartReview}
          onRequestInfo={() => setShowRequestInfoDialog(true)}
          onApprove={handleApprove}
          onReject={() => setShowRejectDialog(true)}
          onSuspend={() => { setAgencyToSuspend(selectedAgency); setShowSuspendDialog(true); }}
          onReinstate={handleReinstate}
        />

        <AgencyRejectDialog
          open={showRejectDialog}
          onOpenChange={setShowRejectDialog}
          agency={selectedAgency}
          rejectionReason={rejectionReason}
          onReasonChange={setRejectionReason}
          onConfirm={() => void handleReject()}
          actionLoading={actionLoading}
        />

        <AgencyRequestInfoDialog
          open={showRequestInfoDialog}
          onOpenChange={setShowRequestInfoDialog}
          agency={selectedAgency}
          note={requestInfoNote}
          onNoteChange={setRequestInfoNote}
          onConfirm={() => void handleRequestInfo()}
          actionLoading={actionLoading}
        />

        <AgencySuspendDialog
          open={showSuspendDialog}
          onOpenChange={setShowSuspendDialog}
          agency={agencyToSuspend}
          reason={suspendReason}
          onReasonChange={setSuspendReason}
          onConfirm={() => void handleSuspend()}
          actionLoading={actionLoading}
        />
      </div>
    </AdminLayout>
  );
}
