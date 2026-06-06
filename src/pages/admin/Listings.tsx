import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Search,
  Download,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  Pause,
  Play,
  ImageIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  useAgencyStore,
  type AgencyApplication,
} from "@/stores/agencyStore";
import type { Listing, ListingStatus } from "@/stores/listingsStore";
import { ListingDetailDialog } from "./listings/ListingDetailDialog";
import { ListingRejectDialog } from "./listings/ListingRejectDialog";

function companyForAgency(
  agencyId: string,
  applications: AgencyApplication[]
): string {
  return applications.find((a) => a.user_id === agencyId)?.company_name ?? "—";
}

function agencyApplication(
  agencyId: string,
  applications: AgencyApplication[]
): AgencyApplication | undefined {
  return applications.find((a) => a.user_id === agencyId);
}

export default function AdminListings() {
  const {
    allApplications,
    isLoadingAll,
    fetchAllApplications,
    subscribeToAllApplications,
  } = useAgencyStore();

  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to load listings:", error.message);
      toast.error(`Failed to load listings: ${error.message}`);
      setListings([]);
      setIsLoadingListings(false);
      return;
    }

    setListings((data ?? []) as Listing[]);
    setIsLoadingListings(false);
  }, []);

  useEffect(() => {
    void fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchAllApplications();
    const unsubscribe = subscribeToAllApplications();
    return unsubscribe;
  }, [fetchAllApplications, subscribeToAllApplications]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-listings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listings" },
        () => {
          void fetchListings();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchListings]);

  const updateListingStatus = async (id: string, status: ListingStatus) => {
    setActionLoading(id);
    const { error } = await supabase
      .from("listings")
      .update({ status })
      .eq("id", id);
    setActionLoading(null);
    if (error) {
      toast.error(`Update failed: ${error.message}`);
      return false;
    }
    await fetchListings();
    return true;
  };

  const handleApprove = async (listing: Listing) => {
    const ok = await updateListingStatus(listing.id, "published");
    if (ok) {
      toast.success(`"${listing.title}" is now published.`);
      void logAdminAction("publish_listing", "listing", listing.id, { title: listing.title });
    }
  };

  const handlePause = async (listing: Listing) => {
    const ok = await updateListingStatus(listing.id, "paused");
    if (ok) {
      toast.success(`"${listing.title}" has been paused.`);
      void logAdminAction("pause_listing", "listing", listing.id, { title: listing.title });
    }
  };

  const handleUnpause = async (listing: Listing) => {
    const ok = await updateListingStatus(listing.id, "published");
    if (ok) {
      toast.success(`"${listing.title}" is live again.`);
      void logAdminAction("unpause_listing", "listing", listing.id, { title: listing.title });
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedListing || !rejectionReason.trim()) return;
    setActionLoading(selectedListing.id);
    const { error } = await supabase
      .from("listings")
      .update({ status: "rejected" as ListingStatus })
      .eq("id", selectedListing.id);
    setActionLoading(null);
    if (error) {
      toast.error(`Reject failed: ${error.message}`);
      return;
    }
    toast.success(`Listing rejected`, { description: rejectionReason.trim() });
    void logAdminAction("reject_listing", "listing", selectedListing.id, {
      title: selectedListing.title,
      reason: rejectionReason.trim(),
    });
    setShowRejectDialog(false);
    setRejectionReason("");
    setSelectedListing(null);
    await fetchListings();
  };

  const filteredListings = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return listings.filter((l) => {
      const company = companyForAgency(l.agency_id, allApplications).toLowerCase();
      const matchesSearch =
        l.title.toLowerCase().includes(q) || company.includes(q);
      const matchesStatus =
        statusFilter === "all" || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [listings, searchQuery, statusFilter, allApplications]);

  const handleExportCSV = () => {
    if (filteredListings.length === 0) {
      toast.error("No listings to export.");
      return;
    }
    const csvEscape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = ["Title", "Category", "Location", "Price (USD)", "Duration", "Max Guests", "Status", "Agency", "Rating", "Reviews", "Submitted"];
    const rows = filteredListings.map((l) => [
      csvEscape(l.title),
      csvEscape(l.category),
      csvEscape(l.location),
      csvEscape(Number(l.price)),
      csvEscape(l.duration),
      csvEscape(l.max_participants),
      csvEscape(l.status),
      csvEscape(companyForAgency(l.agency_id, allApplications)),
      csvEscape(Number(l.rating).toFixed(1)),
      csvEscape(l.review_count),
      csvEscape(formatDate(l.created_at)),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `listings-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredListings.length} listing${filteredListings.length !== 1 ? "s" : ""}`);
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-primary text-primary-foreground">Published</Badge>
        );
      case "pending_review":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
            Pending Review
          </Badge>
        );
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "paused":
        return (
          <Badge className="bg-muted text-muted-foreground border">Paused</Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(n);

  const totalListed = listings.length;
  const pendingReviewCount = listings.filter(
    (l) => l.status === "pending_review"
  ).length;
  const publishedCount = listings.filter((l) => l.status === "published").length;
  const rejectedCount = listings.filter((l) => l.status === "rejected").length;

  const filterButtons: { value: string; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending_review", label: "Pending Review" },
    { value: "published", label: "Published" },
    { value: "paused", label: "Paused" },
    { value: "rejected", label: "Rejected" },
  ];

  const showTableSkeleton = isLoadingListings && listings.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Listings</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Moderate activities and approve submissions
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-xs">Live</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={isLoadingListings}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Listed</p>
              {showTableSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{totalListed}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending Review</p>
              {showTableSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-amber-600">
                  {pendingReviewCount}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Published</p>
              {showTableSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">{publishedCount}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Rejected</p>
              {showTableSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  {rejectedCount}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or agency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {filterButtons.map((btn) => (
              <Button
                key={btn.value}
                variant={statusFilter === btn.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(btn.value)}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {showTableSkeleton ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-8 w-20 hidden sm:block" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No listings found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14"> </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredListings.map((listing) => {
                    const thumb = listing.images?.[0];
                    return (
                      <TableRow key={listing.id}>
                        <TableCell>
                          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium line-clamp-2 max-w-[200px]">
                            {listing.title}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">{listing.category}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm max-w-[140px]">
                            <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            <span className="truncate">{listing.location}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {money(Number(listing.price))}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">
                          {isLoadingAll ? (
                            <Skeleton className="h-4 w-24" />
                          ) : (
                            companyForAgency(listing.agency_id, allApplications)
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(listing.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(listing.created_at)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionLoading === listing.id}
                              >
                                {actionLoading === listing.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedListing(listing);
                                  setShowDetailDialog(true);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {(listing.status === "pending_review" ||
                                listing.status === "draft") && (
                                <DropdownMenuItem
                                  onClick={() => handleApprove(listing)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {(listing.status === "pending_review" ||
                                listing.status === "draft" ||
                                listing.status === "published") && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedListing(listing);
                                    setShowRejectDialog(true);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              )}
                              {listing.status === "published" && (
                                <DropdownMenuItem
                                  onClick={() => handlePause(listing)}
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                              )}
                              {listing.status === "paused" && (
                                <DropdownMenuItem
                                  onClick={() => handleUnpause(listing)}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Unpause
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ListingDetailDialog
          open={showDetailDialog}
          onOpenChange={setShowDetailDialog}
          listing={selectedListing}
          allApplications={allApplications}
          isLoadingAll={isLoadingAll}
          statusBadge={getStatusBadge}
          onApprove={handleApprove}
          onReject={() => setShowRejectDialog(true)}
        />

        <ListingRejectDialog
          open={showRejectDialog}
          onOpenChange={setShowRejectDialog}
          listing={selectedListing}
          rejectionReason={rejectionReason}
          onReasonChange={setRejectionReason}
          onConfirm={() => void handleRejectSubmit()}
          actionLoading={actionLoading}
        />
      </div>
    </AdminLayout>
  );
}
