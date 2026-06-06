import { XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AgencyApplication } from "@/stores/agencyStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agency: AgencyApplication | null;
  rejectionReason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function AgencyRejectDialog({
  open, onOpenChange, agency, rejectionReason, onReasonChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Application</DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting{" "}
            <strong>{agency?.company_name}</strong>. The agency will
            see this feedback and can resubmit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Rejection Reason</Label>
          <Textarea
            placeholder="e.g. Documents appear to be expired. Please upload current tourism license..."
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
            Reject Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
