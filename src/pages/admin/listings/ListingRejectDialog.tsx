import { XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Listing } from "@/stores/listingsStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  rejectionReason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function ListingRejectDialog({
  open, onOpenChange, listing, rejectionReason, onReasonChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject listing</DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting{" "}
            <strong>{listing?.title}</strong>. The agency can revise and resubmit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Rejection reason</Label>
          <Textarea
            placeholder="e.g. Description does not meet quality guidelines..."
            value={rejectionReason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); onReasonChange(""); }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!rejectionReason.trim() || actionLoading !== null}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-1" />
            )}
            Reject listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
