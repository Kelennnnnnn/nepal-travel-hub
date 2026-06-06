import { UserCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { type AdminUser, displayName } from "./UserDetailDialog";

type UserRole = "user" | "agency" | "admin";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  newRole: UserRole;
  onNewRoleChange: (role: UserRole) => void;
  onConfirm: () => void;
  actionLoading: string | null;
}

export function UserChangeRoleDialog({
  open, onOpenChange, user, newRole, onNewRoleChange, onConfirm, actionLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change User Role</DialogTitle>
          <DialogDescription>
            Update the role for <strong>{user ? displayName(user) : ""}</strong>.
            This affects what they can access on the platform.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>New Role</Label>
          <Select value={newRole} onValueChange={(v) => onNewRoleChange(v as UserRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Traveler</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={actionLoading !== null}>
            {actionLoading
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <UserCog className="h-4 w-4 mr-1" />}
            Save Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
