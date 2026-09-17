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
import { type AdminUser, type PlatformRole, displayName } from "./UserDetailDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  newRole: PlatformRole;
  onNewRoleChange: (role: PlatformRole) => void;
  onConfirm: () => void;
  actionLoading: string | null;
  /** Only a super_admin may grant admin/super_admin — see admin-users edge
   *  function's ADMIN_GRANTABLE/SUPER_ADMIN_ONLY_GRANTABLE split. Hiding
   *  those two options for a plain admin caller avoids a confusing 403 on
   *  submit for an action the UI shouldn't have offered in the first place. */
  callerIsSuperAdmin: boolean;
}

export function UserChangeRoleDialog({
  open, onOpenChange, user, newRole, onNewRoleChange, onConfirm, actionLoading, callerIsSuperAdmin,
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
          <Select value={newRole} onValueChange={(v) => onNewRoleChange(v as PlatformRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="traveler">Traveler</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              {callerIsSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
              {callerIsSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
            </SelectContent>
          </Select>
          {!callerIsSuperAdmin && (
            <p className="text-xs text-muted-foreground">
              Only a Super Admin can grant Admin or Super Admin access.
            </p>
          )}
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
