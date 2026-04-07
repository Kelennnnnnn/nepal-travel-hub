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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch + subscribe on mount
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

  const handleApprove = async (agency: AgencyApplication) => {
    setActionLoading(agency.id);
    const { error } = await updateApplicationStatus(agency.id, "verified");
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to approve: ${error}`);
      return;
    }
    toast.success(`${agency.company_name} has been approved!`);
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
    setShowRejectDialog(false);
    setRejectionReason("");
    setSelectedAgency(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-primary text-primary-foreground">Verified</Badge>
        );
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "in_review":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            In Review
          </Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pendingCount = allApplications.filter((a) => a.status === "pending").length;
  const inReviewCount = allApplications.filter((a) => a.status === "in_review").length;
  const verifiedCount = allApplications.filter((a) => a.status === "verified").length;
  const rejectedCount = allApplications.filter((a) => a.status === "rejected").length;

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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-xs">Live</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Applications</p>
              <p className="text-2xl font-bold">{allApplications.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Verified</p>
              <p className="text-2xl font-bold text-primary">{verifiedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending / In Review</p>
              <p className="text-2xl font-bold text-amber-600">
                {pendingCount + inReviewCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Rejected</p>
              <p className="text-2xl font-bold text-destructive">{rejectedCount}</p>
            </CardContent>
          </Card>
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
            {["all", "pending", "in_review", "verified", "rejected"].map(
              (status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="capitalize"
                >
                  {status.replace("_", " ")}
                </Button>
              )
            )}
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
                    <TableHead></TableHead>
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
                            <p className="text-sm text-muted-foreground">
                              {agency.email}
                            </p>
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
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {agency.pan_number}
                        </code>
                      </TableCell>
                      <TableCell>{getStatusBadge(agency.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(agency.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={actionLoading === agency.id}
                            >
                              {actionLoading === agency.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedAgency(agency);
                                setShowDetailDialog(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {agency.status === "pending" && (
                              <DropdownMenuItem
                                onClick={() => handleSetInReview(agency)}
                              >
                                <Clock className="h-4 w-4 mr-2" />
                                Mark In Review
                              </DropdownMenuItem>
                            )}
                            {(agency.status === "pending" ||
                              agency.status === "in_review") && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleApprove(agency)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAgency(agency);
                                    setShowRejectDialog(true);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
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
              <DialogTitle>Agency Application Details</DialogTitle>
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
                    <h3 className="text-xl font-semibold">
                      {selectedAgency.company_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusBadge(selectedAgency.status)}
                      <span className="text-sm text-muted-foreground">
                        Reg: {selectedAgency.registration_number}
                      </span>
                    </div>
                  </div>
                </div>

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
                    {selectedAgency.address}, {selectedAgency.city},{" "}
                    {selectedAgency.district}
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
                      <span className="text-muted-foreground">
                        Registration:
                      </span>{" "}
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
                    <p className="text-sm text-muted-foreground">
                      {selectedAgency.description}
                    </p>
                  </div>
                )}

                {/* Documents */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Documents
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      {selectedAgency.license_url ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                      Tourism License:{" "}
                      {selectedAgency.license_url || "Not uploaded"}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAgency.pan_url ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                      PAN Certificate:{" "}
                      {selectedAgency.pan_url || "Not uploaded"}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAgency.insurance_url ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-muted-foreground inline-block" />
                      )}
                      Insurance:{" "}
                      {selectedAgency.insurance_url || "Not uploaded (optional)"}
                    </div>
                  </div>
                </div>

                {/* Rejection reason if rejected */}
                {selectedAgency.status === "rejected" &&
                  selectedAgency.rejection_reason && (
                    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-2">
                      <h4 className="font-semibold text-sm text-destructive">
                        Rejection Reason
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedAgency.rejection_reason}
                      </p>
                    </div>
                  )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDetailDialog(false)}
              >
                Close
              </Button>
              {selectedAgency &&
                (selectedAgency.status === "pending" ||
                  selectedAgency.status === "in_review") && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setShowDetailDialog(false);
                        setShowRejectDialog(true);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      onClick={() => {
                        handleApprove(selectedAgency);
                        setShowDetailDialog(false);
                      }}
                    >
                      Approve Agency
                    </Button>
                  </>
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
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectionReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectionReason.trim() || actionLoading !== null}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Reject Application
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
