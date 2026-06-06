import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { logAdminAction } from "@/lib/audit";
import {
  UserDetailDialog, AvatarInitials, RoleBadge,
  displayName, userRole, isSuspended, formatDate,
  type AdminUser, type UserDetail,
} from "./users/UserDetailDialog";
import { UserChangeRoleDialog } from "./users/UserChangeRoleDialog";
import { UserDeleteDialog } from "./users/UserDeleteDialog";

// ── Types ────────────────────────────────────────────────────────────

type UserRole = "user" | "agency" | "admin";

interface PlatformStats {
  total: number;
  travelers: number;
  agencies: number;
  admins: number;
  suspended: number;
}

const PAGE_SIZE = 20;

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
