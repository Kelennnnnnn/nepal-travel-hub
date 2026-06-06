import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { type AdminUser, displayName, AvatarInitials } from "./UserDetailDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function UserDeleteDialog({ open, onOpenChange, user, onConfirm, actionLoading }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) onOpenChange(false);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete User
          </DialogTitle>
          <DialogDescription>
            This action is <strong>permanent and cannot be undone</strong>.
            The user's account, bookings, and all associated data will be deleted.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <AvatarInitials user={user} />
              <div>
                <p className="font-medium text-sm">{displayName(user)}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={actionLoading === user?.id}
            onClick={onConfirm}
          >
            {actionLoading === user?.id
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
              : <><Trash2 className="h-4 w-4 mr-2" />Delete Permanently</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
