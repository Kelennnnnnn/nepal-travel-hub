import { AlertTriangle, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AgencyApplication } from "@/stores/agencyStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agency: AgencyApplication | null;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function AgencySuspendDialog({
  open, onOpenChange, agency, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend Agency</DialogTitle>
          <DialogDescription>
            This will suspend <strong>{agency?.company_name}</strong>, ban their
            user account, and pause all their active listings. This action can be reversed.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          The agency will immediately lose access to their dashboard. Active bookings will not be affected.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={actionLoading !== null}
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
