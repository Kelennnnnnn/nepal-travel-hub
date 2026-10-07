import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Matches public.audit_logs (supabase/migrations/20260916000015_admin_and_audit.sql)
// exactly — actor_id/resource_type/resource_id/before_state/after_state,
// not the old system's admin_user_id/entity_type/entity_id/details.
export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  request_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
  admin_email?: string;
}

const ENTITY_COLORS: Record<string, string> = {
  agency:      "bg-blue-100 text-blue-700 border-blue-200",
  listing:     "bg-warning text-warning-foreground border-warning",
  user:        "bg-purple-100 text-purple-700 border-purple-200",
  booking:     "bg-green-100 text-green-700 border-green-200",
  settings:    "bg-muted text-muted-foreground border",
  category:    "bg-amber-100 text-amber-700 border-amber-200",
  destination: "bg-teal-100 text-teal-700 border-teal-200",
};

const ACTION_LABELS: Record<string, string> = {
  approve_agency:     "Approved Agency",
  reject_agency:      "Rejected Agency",
  suspend_agency:     "Suspended Agency",
  reactivate_agency:  "Reactivated Agency",
  publish_listing:    "Published Listing",
  pause_listing:      "Paused Listing",
  unpause_listing:    "Unpaused Listing",
  reject_listing:     "Rejected Listing",
  suspend_user:       "Suspended User",
  unsuspend_user:     "Unsuspended User",
  change_role:        "Changed Role",
  delete_user:        "Deleted User",
  update_setting:     "Updated Setting",
  create_category:    "Created Category",
  update_category:    "Updated Category",
  delete_category:    "Deleted Category",
  create_destination: "Created Destination",
  update_destination: "Updated Destination",
  delete_destination: "Deleted Destination",
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
                <p className="font-medium">{entry.admin_email ?? entry.actor_id ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Action</p>
                <p className="font-medium">{actionLabel(entry.action)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Resource Type</p>
                <Badge className={`capitalize ${ENTITY_COLORS[entry.resource_type] ?? ""}`}>
                  {entry.resource_type}
                </Badge>
              </div>
              {entry.resource_id && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Resource ID</p>
                  <p className="font-mono text-xs break-all">{entry.resource_id}</p>
                </div>
              )}
            </div>
            {entry.before_state && Object.keys(entry.before_state).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Before</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {Object.entries(entry.before_state).map(([k, v]) => (
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
            {entry.after_state && Object.keys(entry.after_state).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">After</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {Object.entries(entry.after_state).map(([k, v]) => (
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
