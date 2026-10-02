import { Star, Flag, Award, Trash2, EyeOff, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AdminReview {
  id: string;
  listing_id: string | null;
  traveler_id: string | null;
  traveler_name: string | null;
  agency_id: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  helpful_count: number;
  is_flagged: boolean;
  is_featured: boolean;
  hidden_at: string | null;
  created_at: string;
  listing: { title: string } | null;
}

export function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? "fill-rating text-rating" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  );
}

export function formatReviewDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

interface Props {
  review: AdminReview | null;
  onClose: () => void;
  onFlag: (review: AdminReview) => void;
  onFeature: (review: AdminReview) => void;
  onHide: (review: AdminReview) => void;
  onDelete: (review: AdminReview) => void;
  /** Hard delete is restricted to super_admin server-side (reviews_admin_delete) — hide the action entirely for a plain admin. */
  canDelete: boolean;
}

export function ReviewDetailDialog({ review, onClose, onFlag, onFeature, onHide, onDelete, canDelete }: Props) {
  return (
    <Dialog open={!!review} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Details</DialogTitle>
        </DialogHeader>
        {review && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Reviewer</p>
                <p className="font-medium">{review.traveler_name ?? "Anonymous"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="font-medium">{formatReviewDate(review.created_at)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Listing</p>
                <p className="font-medium">
                  {(review.listing as { title: string } | null)?.title ?? "—"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Rating</p>
              <StarRating rating={review.rating} />
            </div>
            {review.title && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Title</p>
                <p className="font-semibold">{review.title}</p>
              </div>
            )}
            {review.comment && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Comment</p>
                <p className="text-sm leading-relaxed">{review.comment}</p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {review.is_flagged && (
                <Badge className="bg-warning text-warning-foreground border-warning">
                  <Flag className="h-3 w-3 mr-1" /> Flagged
                </Badge>
              )}
              {review.is_featured && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  <Award className="h-3 w-3 mr-1" /> Featured
                </Badge>
              )}
              {review.hidden_at && (
                <Badge className="bg-muted text-muted-foreground border-border">
                  <EyeOff className="h-3 w-3 mr-1" /> Hidden
                </Badge>
              )}
            </div>
            <div className="flex gap-2 pt-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { onFlag(review); onClose(); }}>
                <Flag className="h-4 w-4 mr-1" />
                {review.is_flagged ? "Remove Flag" : "Flag"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onFeature(review); onClose(); }}>
                <Award className="h-4 w-4 mr-1" />
                {review.is_featured ? "Unfeature" : "Feature"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onHide(review); onClose(); }}>
                {review.hidden_at ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {review.hidden_at ? "Unhide" : "Hide"}
              </Button>
              {canDelete && (
                <Button size="sm" variant="destructive" onClick={() => { onDelete(review); onClose(); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
