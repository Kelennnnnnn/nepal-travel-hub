import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, Search, MoreHorizontal, Eye, ShieldCheck, ShieldOff,
  UserCog, Loader2, Trash2, ArrowLeft, ArrowRight, RefreshCw,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { invokeEdge } from "@/lib/edge";
import {
  UserDetailDialog, AvatarInitials, RoleBadge,
  displayName, userRole, isSuspended, formatDate,
  type AdminUser, type UserDetail, type PlatformRole,
} from "./users/UserDetailDialog";
import { UserChangeRoleDialog } from "./users/UserChangeRoleDialog";
import { UserDeleteDialog } from "./users/UserDeleteDialog";

// ── Types ────────────────────────────────────────────────────────────

interface PlatformStats {
  total: number;
  travelers: number;
  agencies: number;
  admins: number;
  support: number;
  finance: number;
  suspended: number;
}

const PAGE_SIZE = 50;

// ── Sub-components ───────────────────────────────────────────────────

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
  const selfId = useAuthStore((s) => s.user?.id);
  const callerIsSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");

  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [totalCount, setTotalCount]   = useState(0);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading]     = useState(true);

  // Search (server-side via edge function → admin_user_directory(), debounced)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const searchDebounce                = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role filter — also server-side now (admin_user_directory()'s p_role)
  const [roleFilter, setRoleFilter]   = useState("all");

  // Pagination — server-side (admin_user_directory()'s p_limit/p_offset);
  // PAGE_SIZE=50 matches the RPC call below.
  const [page, setPage]               = useState(1);

  // Dialogs
  const [selectedUser, setSelectedUser]     = useState<AdminUser | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog]     = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete]         = useState<AdminUser | null>(null);
  const [newRole, setNewRole]               = useState<PlatformRole>("traveler");
  const [actionLoading, setActionLoading]   = useState<string | null>(null);

  // Detail enrichment
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData]       = useState<UserDetail | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────

  // Note: the "Admins" filter button matches only role="admin" here (not
  // admin+super_admin) — admin_user_directory()'s p_role is a single exact
  // value, and the RPC has no "admin-or-super_admin" concept to pass
  // through. A super_admin viewing "All" still sees every role, just not
  // as a distinct filter button of its own — same tradeoff the stats
  // cards already made differently (admins counts both together there).
  const fetchUsers = useCallback(async (opts?: { search?: string; role?: string; page?: number }) => {
    const activeSearch = opts?.search ?? search;
    const activeRole    = opts?.role   ?? roleFilter;
    const activePage    = opts?.page   ?? page;

    setIsLoading(true);
    const { data, error } = await invokeEdge<{
      users?: AdminUser[];
      stats?: PlatformStats;
      pagination?: { limit: number; offset: number; total: number };
    }>("admin-users", {
      body: {
        action: "list",
        search: activeSearch || undefined,
        role: activeRole === "all" ? undefined : activeRole,
        limit: PAGE_SIZE,
        offset: (activePage - 1) * PAGE_SIZE,
      },
    });
    if (error) {
      toast.error(`Failed to load users: ${error.message}`);
      setIsLoading(false);
      return;
    }
    setUsers((data?.users ?? []) as AdminUser[]);
    setTotalCount(data?.pagination?.total ?? 0);
    if (data?.stats) setPlatformStats(data.stats as PlatformStats);
    setIsLoading(false);
  }, [search, roleFilter, page]);

  useEffect(() => { void fetchUsers(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      const trimmed = v.trim();
      setSearch(trimmed);
      setPage(1);
      void fetchUsers({ search: trimmed, page: 1 });
    }, 350);
  };

  const handleRoleFilterChange = (role: string) => {
    setRoleFilter(role);
    setPage(1);
    void fetchUsers({ role, page: 1 });
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    void fetchUsers({ page: nextPage });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ── Invoke helper ──────────────────────────────────────────────────

  const invoke = async (body: Record<string, unknown>): Promise<{ error: string | null }> => {
    // A fresh key per call (invokeEdge's default) — NOT a deterministic
    // one derived from action+user_id, which would wrongly dedupe two
    // genuinely separate actions taken at different times (suspend, then
    // later suspend again after an unsuspend) as if they were the same
    // retried request.
    const { error } = await invokeEdge("admin-users", { body });
    if (error) return { error: error.message };
    return { error: null };
  };

  // ── Actions ────────────────────────────────────────────────────────

  // Suspend/unsuspend/change_role/delete are all logged to audit_logs
  // SERVER-SIDE by the admin-users edge function itself now (see
  // supabase/functions/admin-users/index.ts — each calls record_audit_log()
  // with service_role after the mutation succeeds). Phase 2 deliberately
  // revoked client INSERT on audit_logs entirely, so a separate frontend
  // logAdminAction() call here would fail anyway, not just be redundant —
  // this is the correct single source of truth, not a decision to log less.

  const handleSuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "suspend", user_id: user.id });
    setActionLoading(null);
    if (error) { toast.error(`Failed to suspend: ${error}`); return; }
    toast.success(`${displayName(user)} has been suspended.`);
    void fetchUsers();
  };

  const handleUnsuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "unsuspend", user_id: user.id });
    setActionLoading(null);
    if (error) { toast.error(`Failed to unsuspend: ${error}`); return; }
    toast.success(`${displayName(user)} has been unsuspended.`);
    void fetchUsers();
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    setActionLoading(selectedUser.id);
    const { error } = await invoke({ action: "change_role", user_id: selectedUser.id, role: newRole });
    setActionLoading(null);
    if (error) { toast.error(`Failed to change role: ${error}`); return; }
    toast.success(`${displayName(selectedUser)}'s role changed to ${newRole}.`);
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

    // Table/column names updated for the Phase 2 schema: reviews.traveler_id
    // (was user_id), and agency identity/status now live on separate
    // agencies + agency_verification tables reached via agency_users (was
    // one flat agency_applications row) — see PHASE_1_ARCHITECTURE.md §3.1.
    const [bookingsRes, reviewsRes, membershipRes] = await Promise.all([
      supabase.from("bookings").select("*", { count: "exact", head: true }).eq("traveler_id", user.id),
      supabase.from("reviews").select("*", { count: "exact", head: true }).eq("traveler_id", user.id),
      supabase.from("agency_users").select("agency_id").eq("user_id", user.id).is("removed_at", null).maybeSingle(),
    ]);

    let agencyStatus: string | null = null;
    let agencyName: string | null = null;
    if (membershipRes.data?.agency_id) {
      const [agencyRes, verificationRes] = await Promise.all([
        supabase.from("agencies").select("display_name").eq("id", membershipRes.data.agency_id).maybeSingle(),
        supabase.from("agency_verification").select("status").eq("agency_id", membershipRes.data.agency_id).maybeSingle(),
      ]);
      agencyName = agencyRes.data?.display_name ?? null;
      agencyStatus = verificationRes.data?.status ?? null;
    }

    setDetailData({
      bookingsCount: bookingsRes.count ?? 0,
      reviewsCount:  reviewsRes.count ?? 0,
      agencyStatus,
      agencyName,
    });
    setDetailLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────

  const filterButtons = [
    { value: "all",      label: "All" },
    { value: "traveler", label: "Travelers" },
    { value: "agency",   label: "Agencies" },
    { value: "admin",    label: "Admins" },     // exact role="admin" only — see handleRoleFilterChange's note
    { value: "support",  label: "Support" },
    { value: "finance",  label: "Finance" },
  ];

  const showSkeleton = isLoading && users.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${totalCount.toLocaleString()} user${totalCount !== 1 ? "s" : ""}${search ? " matching search" : ""}`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 self-start"
            onClick={() => void fetchUsers()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard label="Total Users"  value={platformStats?.total ?? 0}     loading={showSkeleton} />
          <StatCard label="Travelers"    value={platformStats?.travelers ?? 0}  color="text-blue-600"  loading={showSkeleton} />
          <StatCard label="Agencies"     value={platformStats?.agencies ?? 0}   color="text-primary"   loading={showSkeleton} />
          <StatCard label="Admins"       value={platformStats?.admins ?? 0}     color="text-warning-foreground" loading={showSkeleton} />
          <StatCard label="Support"      value={platformStats?.support ?? 0}    color="text-violet-600" loading={showSkeleton} />
          <StatCard label="Finance"      value={platformStats?.finance ?? 0}    color="text-emerald-600" loading={showSkeleton} />
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
                onClick={() => handleRoleFilterChange(btn.value)}
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
            ) : users.length === 0 ? (
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
                    {users.map((user) => {
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
                                {user.id !== selfId && (
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedUser(user);
                                    setNewRole(userRole(user));
                                    setShowRoleDialog(true);
                                  }}>
                                    <UserCog className="h-4 w-4 mr-2" />
                                    Change Role
                                  </DropdownMenuItem>
                                )}
                                {user.id !== selfId && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {suspended ? (
                                      <DropdownMenuItem onClick={() => void handleUnsuspend(user)}>
                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                        Unsuspend
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        className="text-warning-foreground focus:text-warning-foreground"
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
                                  </>
                                )}
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
                      Page {page} of {totalPages} · {totalCount} users
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1 || isLoading}
                        onClick={() => handlePageChange(Math.max(1, page - 1))}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading}
                        onClick={() => handlePageChange(Math.min(totalPages, page + 1))}>
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

      <UserDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        user={selectedUser}
        detailData={detailData}
        detailLoading={detailLoading}
        onSuspend={(u) => void handleSuspend(u)}
        onUnsuspend={(u) => void handleUnsuspend(u)}
      />

      <UserChangeRoleDialog
        open={showRoleDialog}
        onOpenChange={setShowRoleDialog}
        user={selectedUser}
        newRole={newRole}
        onNewRoleChange={setNewRole}
        onConfirm={() => void handleChangeRole()}
        actionLoading={actionLoading}
        callerIsSuperAdmin={callerIsSuperAdmin}
      />

      <UserDeleteDialog
        open={showDeleteDialog}
        onOpenChange={(v) => { if (!v) { setShowDeleteDialog(false); setUserToDelete(null); } }}
        user={userToDelete}
        onConfirm={() => void handleDelete()}
        actionLoading={actionLoading}
      />

    </AdminLayout>
  );
}
