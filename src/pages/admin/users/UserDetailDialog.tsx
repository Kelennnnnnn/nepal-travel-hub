import {
  Mail, Calendar, AlertTriangle, ShieldCheck, ShieldOff,
  BookOpen, Star, Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  user_metadata: {
    name?: string;
    full_name?: string;
    role?: "user" | "agency" | "admin";
    agency_name?: string;
  };
}

export interface UserDetail {
  bookingsCount: number;
  reviewsCount: number;
  agencyStatus: string | null;
  agencyName: string | null;
}

export function displayName(u: AdminUser): string {
  return u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email.split("@")[0];
}

export function userRole(u: AdminUser): "user" | "agency" | "admin" {
  return u.user_metadata?.role ?? "user";
}

export function isSuspended(u: AdminUser): boolean {
  return !!u.banned_until && new Date(u.banned_until) > new Date();
}

export function initials(u: AdminUser): string {
  const name = displayName(u);
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function RoleBadge({ role }: { role: "user" | "agency" | "admin" }) {
  const cfg = {
    admin:  { label: "Admin",    className: "bg-amber-100 text-amber-800 border-amber-200" },
    agency: { label: "Agency",   className: "bg-primary/10 text-primary border-primary/20" },
    user:   { label: "Traveler", className: "bg-blue-100 text-blue-800 border-blue-200" },
  };
  const { label, className } = cfg[role];
  return <Badge className={className}>{label}</Badge>;
}

export function AvatarInitials({ user }: { user: AdminUser }) {
  const role = userRole(user);
  const colorMap = {
    admin:  "bg-amber-100 text-amber-700",
    agency: "bg-primary/10 text-primary",
    user:   "bg-blue-100 text-blue-700",
  };
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${colorMap[role]}`}>
      {initials(user)}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  detailData: UserDetail | null;
  detailLoading: boolean;
  onSuspend: (user: AdminUser) => void;
  onUnsuspend: (user: AdminUser) => void;
}

export function UserDetailDialog({
  open, onOpenChange, user, detailData, detailLoading, onSuspend, onUnsuspend,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>Account information and activity</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <AvatarInitials user={user} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">{displayName(user)}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <RoleBadge role={userRole(user)} />
                  {isSuspended(user) && (
                    <Badge variant="destructive" className="text-xs">Suspended</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                Joined {formatDate(user.created_at)}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                Last sign in {formatDate(user.last_sign_in_at)}
              </div>
            </div>

            {isSuspended(user) && user.banned_until && (
              <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Suspended until {new Date(user.banned_until).toLocaleDateString()}</span>
              </div>
            )}

            <Separator />

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Activity</p>
              {detailLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <Skeleton className="h-6 w-10 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : detailData ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">{detailData.bookingsCount}</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                      <BookOpen className="h-3 w-3" /> Bookings
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">{detailData.reviewsCount}</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                      <Star className="h-3 w-3" /> Reviews
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    {detailData.agencyStatus ? (
                      <>
                        <p className="text-sm font-semibold capitalize">{detailData.agencyStatus}</p>
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" /> Agency
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-muted-foreground">—</p>
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" /> Agency
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              {detailData?.agencyName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Agency name: <span className="font-medium text-foreground">{detailData.agencyName}</span>
                </p>
              )}
            </div>

            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">User ID</p>
              <code className="text-xs break-all">{user.id}</code>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {user && (
            isSuspended(user) ? (
              <Button onClick={() => { onUnsuspend(user); onOpenChange(false); }}>
                <ShieldCheck className="h-4 w-4 mr-2" /> Unsuspend
              </Button>
            ) : (
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => { onSuspend(user); onOpenChange(false); }}>
                <ShieldOff className="h-4 w-4 mr-2" /> Suspend
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
