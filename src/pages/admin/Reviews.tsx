import { useCallback, useEffect, useRef, useState } from "react";
import {
  Star,
  Search,
  Trash2,
  Flag,
  Award,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";

// ── Types ────────────────────────────────────────────────────────────

interface AdminReview {
  id: string;
  listing_id: string | null;
  traveler_id: string | null;
  traveler_name: string | null;
  agency_id: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  helpful_count: number;
  verified: boolean;
  flagged: boolean;
  featured: boolean;
  admin_note: string | null;
  created_at: string;
  listing: { title: string } | null;
}

const PAGE_SIZE = 25;

// ── Helpers ──────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminReviews() {
  const [reviews, setReviews]         = useState<AdminReview[]>([]);
  const [totalCount, setTotalCount]   = useState(0);
  const [isLoading, setIsLoading]     = useState(true);
  const [page, setPage]               = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [viewFilter, setViewFilter]   = useState<"all" | "flagged" | "low_rating" | "featured" | "recent">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [reviewToDelete, setReviewToDelete]     = useState<AdminReview | null>(null);
  const [deleteReason, setDeleteReason]         = useState("");

  // Detail dialog
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────

  const fetchReviews = useCallback(async (opts?: { page?: number; search?: string; view?: string }) => {
    const activePage   = opts?.page   ?? page;
    const activeSearch = opts?.search ?? search;
    const activeView   = opts?.view   ?? viewFilter;
    setIsLoading(true);

    let query = supabase
      .from("reviews")
      .select("id,listing_id,traveler_id,traveler_name,agency_id,rating,title,comment,helpful_count,verified,flagged,featured,admin_note,created_at,listing:listings(title)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE - 1);

    if (activeView === "flagged")    query = query.eq("flagged", true);
    if (activeView === "low_rating") query = query.lte("rating", 2);
    if (activeView === "featured")   query = query.eq("featured", true);
    if (activeView === "recent") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      query = query.gte("created_at", cutoff.toISOString());
    }
    if (activeSearch) query = query.ilike("comment", `%${activeSearch}%`);

    const { data, count, error } = await query;
    if (error) {
      toast.error("Failed to load reviews");
      setIsLoading(false);
      return;
    }

    setReviews((data ?? []) as unknown as AdminReview[]);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [page, search, viewFilter]);

  useEffect(() => { void fetchReviews(); }, [fetchReviews]);

  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(v.trim());
      setPage(1);
      void fetchReviews({ page: 1, search: v.trim() });
    }, 350);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const goPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setPage(clamped);
    void fetchReviews({ page: clamped });
  };

  // ── Actions ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!reviewToDelete) return;
    setActionLoading(reviewToDelete.id);
    const { error } = await supabase.from("reviews").delete().eq("id", reviewToDelete.id);
    setActionLoading(null);
    if (error) { toast.error(`Failed to delete: ${error.message}`); return; }
    toast.success("Review deleted.");
    void logAdminAction("delete_review", "listing", reviewToDelete.listing_id ?? undefined, {
      reviewer: reviewToDelete.traveler_name,
      rating: reviewToDelete.rating,
      reason: deleteReason,
    });
    setShowDeleteDialog(false);
    setReviewToDelete(null);
    setDeleteReason("");
    void fetchReviews();
  };

  const handleFlag = async (review: AdminReview) => {
    setActionLoading(review.id);
    const newFlag = !review.flagged;
    const { error } = await supabase
      .from("reviews")
      .update({ flagged: newFlag })
      .eq("id", review.id);
    setActionLoading(null);
    if (error) { toast.error(`Failed to flag: ${error.message}`); return; }
    toast.success(newFlag ? "Review flagged for agency response." : "Flag removed.");
    void logAdminAction(newFlag ? "flag_review" : "unflag_review", "listing", review.listing_id ?? undefined, {
      reviewer: review.traveler_name,
    });
    void fetchReviews();
  };

  const handleFeature = async (review: AdminReview) => {
    setActionLoading(review.id);
    const newFeatured = !review.featured;
    const { error } = await supabase
      .from("reviews")
      .update({ featured: newFeatured })
      .eq("id", review.id);
    setActionLoading(null);
    if (error) { toast.error(`Failed to update: ${error.message}`); return; }
    toast.success(newFeatured ? "Review featured." : "Review unfeatured.");
    void logAdminAction(newFeatured ? "feature_review" : "unfeature_review", "listing", review.listing_id ?? undefined, {
      reviewer: review.traveler_name,
    });
    void fetchReviews();
  };

  // ── Stats ──────────────────────────────────────────────────────────

  const flaggedCount = reviews.filter((r) => r.flagged).length;
  const lowRatingCount = reviews.filter((r) => r.rating <= 2).length;
  const featuredCount = reviews.filter((r) => r.featured).length;

  const showSkeleton = isLoading && reviews.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Review Moderation</h1>
            <p className="text-muted-foreground">Manage traveler reviews across all listings</p>
          </div>
          <Button variant="outline" onClick={() => void fetchReviews()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4">
          {[
            { label: "Total Reviews",  value: totalCount,      color: "" },
            { label: "Flagged",        value: flaggedCount,    color: "text-amber-600" },
            { label: "Low Rating (≤2)", value: lowRatingCount, color: "text-destructive" },
            { label: "Featured",       value: featuredCount,   color: "text-primary" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                {isLoading
                  ? <Skeleton className="h-8 w-12 mt-1" />
                  : <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search review content..."
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={viewFilter}
            onValueChange={(v) => {
              setViewFilter(v as typeof viewFilter);
              setPage(1);
              void fetchReviews({ page: 1, view: v });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reviews</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="low_rating">Low Rating (≤2★)</SelectItem>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="recent">Recent (7 days)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {showSkeleton ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No reviews found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((review) => (
                    <TableRow
                      key={review.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedReview(review)}
                    >
                      <TableCell className="font-medium text-sm">
                        {review.traveler_name ?? "Anonymous"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {(review.listing as { title: string } | null)?.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StarRating rating={review.rating} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                        {review.comment ?? review.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {review.flagged && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                              <Flag className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                          {review.featured && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                              <Award className="h-3 w-3 mr-1" />
                              Featured
                            </Badge>
                          )}
                          {review.rating <= 2 && !review.flagged && (
                            <Badge variant="destructive" className="text-xs">Low</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(review.created_at)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={actionLoading === review.id}
                            >
                              {actionLoading === review.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <span className="text-lg leading-none">⋯</span>}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleFlag(review)}>
                              <Flag className="h-4 w-4 mr-2" />
                              {review.flagged ? "Remove Flag" : "Flag for Agency"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleFeature(review)}>
                              <Award className="h-4 w-4 mr-2" />
                              {review.featured ? "Unfeature" : "Feature Review"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { setReviewToDelete(review); setShowDeleteDialog(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Review
                            </DropdownMenuItem>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1 || isLoading}
                onClick={() => goPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7)        p = i + 1;
                else if (page <= 4)         p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else                        p = page - 3 + i;
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 text-xs"
                    onClick={() => goPage(p)}
                    disabled={isLoading}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages || isLoading}
                onClick={() => goPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reviewer</p>
                  <p className="font-medium">{selectedReview.traveler_name ?? "Anonymous"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p className="font-medium">{formatDate(selectedReview.created_at)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Listing</p>
                  <p className="font-medium">
                    {(selectedReview.listing as { title: string } | null)?.title ?? "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <StarRating rating={selectedReview.rating} />
              </div>
              {selectedReview.title && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Title</p>
                  <p className="font-semibold">{selectedReview.title}</p>
                </div>
              )}
              {selectedReview.comment && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Comment</p>
                  <p className="text-sm leading-relaxed">{selectedReview.comment}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {selectedReview.flagged && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                    <Flag className="h-3 w-3 mr-1" />
                    Flagged
                  </Badge>
                )}
                {selectedReview.featured && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    <Award className="h-3 w-3 mr-1" />
                    Featured
                  </Badge>
                )}
                {selectedReview.verified && (
                  <Badge className="bg-green-100 text-green-700 border-green-200">Verified</Badge>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { handleFlag(selectedReview); setSelectedReview(null); }}
                >
                  <Flag className="h-4 w-4 mr-1" />
                  {selectedReview.flagged ? "Remove Flag" : "Flag"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { handleFeature(selectedReview); setSelectedReview(null); }}
                >
                  <Award className="h-4 w-4 mr-1" />
                  {selectedReview.featured ? "Unfeature" : "Feature"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { setReviewToDelete(selectedReview); setSelectedReview(null); setShowDeleteDialog(true); }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
            <DialogDescription>
              This will permanently delete the review from{" "}
              <strong>{reviewToDelete?.traveler_name ?? "this reviewer"}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <StarRating rating={reviewToDelete?.rating ?? 0} />
              <p className="mt-1 text-muted-foreground line-clamp-2">{reviewToDelete?.comment}</p>
            </div>
            <div className="space-y-1">
              <Label>Reason for deletion</Label>
              <Textarea
                placeholder="e.g. Violates community guidelines — contains inappropriate content..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deleteReason.trim() || actionLoading !== null}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
