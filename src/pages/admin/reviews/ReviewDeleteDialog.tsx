import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StarRating, type AdminReview } from "./ReviewDetailDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: AdminReview | null;
  deleteReason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function ReviewDeleteDialog({
  open, onOpenChange, review, deleteReason, onReasonChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Review</DialogTitle>
          <DialogDescription>
            This will permanently delete the review from{" "}
            <strong>{review?.traveler_name ?? "this reviewer"}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <StarRating rating={review?.rating ?? 0} />
            <p className="mt-1 text-muted-foreground line-clamp-2">{review?.comment}</p>
          </div>
          <div className="space-y-1">
            <Label>Reason for deletion</Label>
            <Textarea
              placeholder="e.g. Violates community guidelines — contains inappropriate content..."
              value={deleteReason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); onReasonChange(""); }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!deleteReason.trim() || actionLoading !== null}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Delete Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
