import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users, Search, MoreHorizontal, Eye, ShieldCheck, ShieldOff,
  UserCog, Loader2, Mail, Calendar, AlertTriangle, Trash2,
  ArrowLeft, ArrowRight, RefreshCw, BookOpen, Star, Building2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";

// ── Types ────────────────────────────────────────────────────────────

type UserRole = "user" | "agency" | "admin";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  user_metadata: {
    name?: string;
    full_name?: string;
    role?: UserRole;
    agency_name?: string;
  };
}

interface PlatformStats {
  total: number;
  travelers: number;
  agencies: number;
  admins: number;
  suspended: number;
}

interface UserDetail {
  bookingsCount: number;
  reviewsCount: number;
  agencyStatus: string | null;
  agencyName: string | null;
}

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────

function displayName(u: AdminUser): string {
  return u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email.split("@")[0];
}

function userRole(u: AdminUser): UserRole {
  return u.user_metadata?.role ?? "user";
}

function isSuspended(u: AdminUser): boolean {
  return !!u.banned_until && new Date(u.banned_until) > new Date();
}

function initials(u: AdminUser): string {
  const name = displayName(u);
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Sub-components ───────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const cfg: Record<UserRole, { label: string; className: string }> = {
    admin:  { label: "Admin",    className: "bg-amber-100 text-amber-800 border-amber-200" },
    agency: { label: "Agency",   className: "bg-primary/10 text-primary border-primary/20" },
    user:   { label: "Traveler", className: "bg-blue-100 text-blue-800 border-blue-200" },
  };
  const { label, className } = cfg[role];
  return <Badge className={className}>{label}</Badge>;
}

function AvatarInitials({ user }: { user: AdminUser }) {
  const role = userRole(user);
  const colorMap: Record<UserRole, string> = {
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

function StatCard({ label, value, color, loading }: {
  label: string; value: number; color?: string; loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading
          ? <Skeleton className="h-8 w-16 mt-1" />
          : <p className={`text-2xl font-bold mt-1 ${color ?? ""}`}>{value}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [allUsers, setAllUsers]       = useState<AdminUser[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading]     = useState(true);

  // Search (server-side via edge function)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const searchDebounce                = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role filter (client-side on returned set)
  const [roleFilter, setRoleFilter]   = useState("all");

  // Pagination
  const [page, setPage]               = useState(1);

  // Dialogs
  const [selectedUser, setSelectedUser]     = useState<AdminUser | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog]     = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete]         = useState<AdminUser | null>(null);
  const [newRole, setNewRole]               = useState<UserRole>("user");
  const [actionLoading, setActionLoading]   = useState<string | null>(null);

  // Detail enrichment
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData]       = useState<UserDetail | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async (q = search) => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "list", search: q },
    });
    if (error) {
      toast.error(`Failed to load users: ${error.message}`);
      setIsLoading(false);
      return;
    }
    setAllUsers((data?.users ?? []) as AdminUser[]);
    if (data?.stats) setPlatformStats(data.stats as PlatformStats);
    setIsLoading(false);
  }, [search]);

  useEffect(() => { void fetchUsers(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(v.trim());
      setPage(1);
      void fetchUsers(v.trim());
    }, 350);
  };

  // ── Filtered + paginated set ───────────────────────────────────────

  const filtered = useMemo(
    () => roleFilter === "all" ? allUsers : allUsers.filter((u) => userRole(u) === roleFilter),
    [allUsers, roleFilter],
  );

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage      = Math.min(page, totalPages);
  const paginatedUsers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when role filter changes
  useEffect(() => { setPage(1); }, [roleFilter]);

  // ── Invoke helper ──────────────────────────────────────────────────

  const invoke = async (body: Record<string, unknown>): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error as string };
    return { error: null };
  };

  // ── Actions ────────────────────────────────────────────────────────

  const handleSuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "suspend", user_id: user.id });
    setActionLoading(null);
    if (error) { toast.error(`Failed to suspend: ${error}`); return; }
    toast.success(`${displayName(user)} has been suspended.`);
    void logAdminAction("suspend_user", "user", user.id, { email: user.email, name: displayName(user) });
    void fetchUsers();
  };

  const handleUnsuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "unsuspend", user_id: user.id });
    setActionLoading(null);
    if (error) { toast.error(`Failed to unsuspend: ${error}`); return; }
    toast.success(`${displayName(user)} has been unsuspended.`);
    void logAdminAction("unsuspend_user", "user", user.id, { email: user.email, name: displayName(user) });
    void fetchUsers();
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    setActionLoading(selectedUser.id);
    const oldRole = userRole(selectedUser);
    const { error } = await invoke({ action: "change_role", user_id: selectedUser.id, role: newRole });
    setActionLoading(null);
    if (error) { toast.error(`Failed to change role: ${error}`); return; }
    toast.success(`${displayName(selectedUser)}'s role changed to ${newRole}.`);
    void logAdminAction("change_role", "user", selectedUser.id, {
      email: selectedUser.email,
      old_role: oldRole,
      new_role: newRole,
    });
    setShowRoleDialog(false);
    setSelectedUser(null);
    void fetchUsers();
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    setActionLoading(userToDelete.id);
    const { error } = await invoke({ action: "delete", user_id: userToDelete.id });
    setActionLoading(null);
    if (error) { toast.error(`Failed to delete user: ${error}`); return; }
    toast.success(`${displayName(userToDelete)} has been permanently deleted.`);
    void logAdminAction("delete_user", "user", userToDelete.id, {
      email: userToDelete.email,
      name: displayName(userToDelete),
    });
    setShowDeleteDialog(false);
    setUserToDelete(null);
    void fetchUsers();
  };

  // ── Detail dialog ──────────────────────────────────────────────────

  const openDetail = async (user: AdminUser) => {
    setSelectedUser(user);
    setDetailData(null);
    setDetailLoading(true);
    setShowDetailDialog(true);

    const [bookingsRes, reviewsRes, agencyRes] = await Promise.all([
      supabase.from("bookings").select("*", { count: "exact", head: true }).eq("traveler_id", user.id),
      supabase.from("reviews").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("agency_applications").select("status, company_name").eq("user_id", user.id).maybeSingle(),
    ]);

    setDetailData({
      bookingsCount: bookingsRes.count ?? 0,
      reviewsCount:  reviewsRes.count ?? 0,
      agencyStatus:  agencyRes.data?.status ?? null,
      agencyName:    agencyRes.data?.company_name ?? null,
    });
    setDetailLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────

  const filterButtons = [
    { value: "all",    label: "All" },
    { value: "user",   label: "Travelers" },
    { value: "agency", label: "Agencies" },
    { value: "admin",  label: "Admins" },
  ];

  const showSkeleton = isLoading && allUsers.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} user${filtered.length !== 1 ? "s" : ""}${search ? " matching search" : ""}`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 self-start"
            onClick={() => void fetchUsers()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="Total Users"  value={platformStats?.total ?? 0}     loading={showSkeleton} />
          <StatCard label="Travelers"    value={platformStats?.travelers ?? 0}  color="text-blue-600"  loading={showSkeleton} />
          <StatCard label="Agencies"     value={platformStats?.agencies ?? 0}   color="text-primary"   loading={showSkeleton} />
          <StatCard label="Admins"       value={platformStats?.admins ?? 0}     color="text-amber-600" loading={showSkeleton} />
          <StatCard label="Suspended"    value={platformStats?.suspended ?? 0}  color="text-destructive" loading={showSkeleton} />
        </div>

        {/* Search & filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {filterButtons.map((btn) => (
              <Button
                key={btn.value}
                variant={roleFilter === btn.value ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter(btn.value)}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {showSkeleton ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-6 w-16 hidden sm:block" />
                    <Skeleton className="h-6 w-14 hidden sm:block" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </div>
            ) : paginatedUsers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No users found</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"> </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last Sign In</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.map((user) => {
                      const suspended = isSuspended(user);
                      return (
                        <TableRow key={user.id} className={suspended ? "opacity-60" : ""}>
                          <TableCell className="pl-4">
                            <AvatarInitials user={user} />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{displayName(user)}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </TableCell>
                          <TableCell><RoleBadge role={userRole(user)} /></TableCell>
                          <TableCell>
                            {suspended
                              ? <Badge variant="destructive" className="text-xs">Suspended</Badge>
                              : <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(user.created_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(user.last_sign_in_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                  disabled={actionLoading === user.id}>
                                  {actionLoading === user.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <MoreHorizontal className="h-4 w-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => void openDetail(user)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedUser(user);
                                  setNewRole(userRole(user));
                                  setShowRoleDialog(true);
                                }}>
                                  <UserCog className="h-4 w-4 mr-2" />
                                  Change Role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {suspended ? (
                                  <DropdownMenuItem onClick={() => void handleUnsuspend(user)}>
                                    <ShieldCheck className="h-4 w-4 mr-2" />
                                    Unsuspend
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-amber-600 focus:text-amber-600"
                                    onClick={() => void handleSuspend(user)}>
                                    <ShieldOff className="h-4 w-4 mr-2" />
                                    Suspend
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => { setUserToDelete(user); setShowDeleteDialog(true); }}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Page {safePage} of {totalPages} · {filtered.length} users
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        Next
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Detail Dialog ────────────────────────────────────── */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Account information and activity</DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-5">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <AvatarInitials user={selectedUser} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base truncate">{displayName(selectedUser)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <RoleBadge role={userRole(selectedUser)} />
                    {isSuspended(selectedUser) && (
                      <Badge variant="destructive" className="text-xs">Suspended</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{selectedUser.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  Joined {formatDate(selectedUser.created_at)}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  Last sign in {formatDate(selectedUser.last_sign_in_at)}
                </div>
              </div>

              {isSuspended(selectedUser) && selectedUser.banned_until && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Suspended until {new Date(selectedUser.banned_until).toLocaleDateString()}</span>
                </div>
              )}

              <Separator />

              {/* Activity stats */}
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
                <code className="text-xs break-all">{selectedUser.id}</code>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Close
            </Button>
            {selectedUser && (
              isSuspended(selectedUser) ? (
                <Button onClick={() => { void handleUnsuspend(selectedUser); setShowDetailDialog(false); }}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Unsuspend
                </Button>
              ) : (
                <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => { void handleSuspend(selectedUser); setShowDetailDialog(false); }}>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Suspend
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Role Dialog ───────────────────────────────── */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for <strong>{selectedUser ? displayName(selectedUser) : ""}</strong>.
              This affects what they can access on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
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
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleChangeRole()} disabled={actionLoading !== null}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserCog className="h-4 w-4 mr-1" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        if (!open) { setShowDeleteDialog(false); setUserToDelete(null); }
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
          {userToDelete && (
            <div className="py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <AvatarInitials user={userToDelete} />
                <div>
                  <p className="font-medium text-sm">{displayName(userToDelete)}</p>
                  <p className="text-xs text-muted-foreground">{userToDelete.email}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setUserToDelete(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading === userToDelete?.id}
              onClick={() => void handleDelete()}
            >
              {actionLoading === userToDelete?.id
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
                : <><Trash2 className="h-4 w-4 mr-2" />Delete Permanently</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
}
