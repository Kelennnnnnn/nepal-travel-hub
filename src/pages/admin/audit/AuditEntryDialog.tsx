import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AuditEntry {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  admin_email?: string;
}

const ENTITY_COLORS: Record<string, string> = {
  agency:   "bg-blue-100 text-blue-700 border-blue-200",
  listing:  "bg-amber-100 text-amber-700 border-amber-200",
  user:     "bg-purple-100 text-purple-700 border-purple-200",
  booking:  "bg-green-100 text-green-700 border-green-200",
  payout:   "bg-primary/10 text-primary border-primary/20",
  settings: "bg-muted text-muted-foreground border",
};

const ACTION_LABELS: Record<string, string> = {
  approve_agency:    "Approved Agency",
  reject_agency:     "Rejected Agency",
  suspend_agency:    "Suspended Agency",
  reactivate_agency: "Reactivated Agency",
  publish_listing:   "Published Listing",
  pause_listing:     "Paused Listing",
  unpause_listing:   "Unpaused Listing",
  reject_listing:    "Rejected Listing",
  suspend_user:      "Suspended User",
  unsuspend_user:    "Unsuspended User",
  change_role:       "Changed Role",
  delete_user:       "Deleted User",
  process_payout:    "Processed Payout",
  update_settings:   "Updated Settings",
};

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  entry: AuditEntry | null;
  onClose: () => void;
}

export function AuditEntryDialog({ entry, onClose }: Props) {
  return (
    <Dialog open={!!entry} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Audit Entry Details</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                <p className="font-medium">{formatDateTime(entry.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Admin</p>
                <p className="font-medium">{entry.admin_email ?? entry.admin_user_id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Action</p>
                <p className="font-medium">{actionLabel(entry.action)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Entity Type</p>
                <Badge className={`capitalize ${ENTITY_COLORS[entry.entity_type] ?? ""}`}>
                  {entry.entity_type}
                </Badge>
              </div>
              {entry.entity_id && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Entity ID</p>
                  <p className="font-mono text-xs break-all">{entry.entity_id}</p>
                </div>
              )}
            </div>
            {Object.keys(entry.details).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Details</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {Object.entries(entry.details).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground capitalize min-w-[100px]">
                        {k.replace(/_/g, " ")}:
                      </span>
                      <span className="font-medium break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entry ID</p>
              <p className="font-mono text-xs text-muted-foreground">{entry.id}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ENTITY_COLORS };
