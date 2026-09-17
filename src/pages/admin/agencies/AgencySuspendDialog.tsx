import { AlertTriangle, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AgencyListItem } from "@/stores/agencyStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agency: AgencyListItem | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function AgencySuspendDialog({
  open, onOpenChange, agency, reason, onReasonChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend Agency</DialogTitle>
          <DialogDescription>
            This will suspend <strong>{agency?.agency.display_name}</strong> and pause
            all their published listings. Their account stays accessible — they'll see
            their suspended status when they sign in. This action can be reversed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Reason</Label>
          <Textarea
            placeholder="e.g. Multiple traveler complaints about listing accuracy..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
          />
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          Published listings will be paused immediately. Active bookings will not be affected.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={actionLoading !== null || !reason.trim()}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ShieldOff className="h-4 w-4 mr-1" />
            )}
            Suspend Agency
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
