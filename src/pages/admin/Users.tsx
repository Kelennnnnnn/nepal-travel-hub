import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Loader2,
  Mail,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// ── Types ───────────────────────────────────────────────────

type UserRole = "user" | "agency" | "admin";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata: {
    name?: string;
    full_name?: string;
    role?: UserRole;
    disabled?: boolean;
    agency_name?: string;
  };
}

// ── Helpers ─────────────────────────────────────────────────

function displayName(u: AdminUser): string {
  return (
    u.user_metadata?.name ??
    u.user_metadata?.full_name ??
    u.email.split("@")[0]
  );
}

function userRole(u: AdminUser): UserRole {
  return u.user_metadata?.role ?? "user";
}

function isSuspended(u: AdminUser): boolean {
  return u.user_metadata?.disabled === true;
}

function initials(u: AdminUser): string {
  const name = displayName(u);
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Role badge ───────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  switch (role) {
    case "admin":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
          Admin
        </Badge>
      );
    case "agency":
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          Agency
        </Badge>
      );
    default:
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          Traveler
        </Badge>
      );
  }
}

// ── Avatar ───────────────────────────────────────────────────

function AvatarInitials({ user }: { user: AdminUser }) {
  const role = userRole(user);
  const colorMap: Record<UserRole, string> = {
    admin: "bg-amber-100 text-amber-700",
    agency: "bg-primary/10 text-primary",
    user: "bg-blue-100 text-blue-700",
  };
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${colorMap[role]}`}
    >
      {initials(user)}
    </div>
  );
}

// ── Page component ───────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "list", page: 1, limit: 50 },
    });

    if (error) {
      toast.error(`Failed to load users: ${error.message}`);
      setIsLoading(false);
      return;
    }

    setUsers((data?.users ?? []) as AdminUser[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const invoke = async (
    body: Record<string, unknown>
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error as string };
    return { error: null };
  };

  const handleSuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "suspend", user_id: user.id });
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to suspend: ${error}`);
      return;
    }
    toast.success(`${displayName(user)} has been suspended.`);
    await fetchUsers();
  };

  const handleUnsuspend = async (user: AdminUser) => {
    setActionLoading(user.id);
    const { error } = await invoke({ action: "unsuspend", user_id: user.id });
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to unsuspend: ${error}`);
      return;
    }
    toast.success(`${displayName(user)} has been unsuspended.`);
    await fetchUsers();
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    setActionLoading(selectedUser.id);
    const { error } = await invoke({
      action: "change_role",
      user_id: selectedUser.id,
      role: newRole,
    });
    setActionLoading(null);
    if (error) {
      toast.error(`Failed to change role: ${error}`);
      return;
    }
    toast.success(`${displayName(selectedUser)}'s role changed to ${newRole}.`);
    setShowRoleDialog(false);
    setSelectedUser(null);
    await fetchUsers();
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        displayName(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);
      const matchesRole =
        roleFilter === "all" || userRole(u) === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const totalUsers = users.length;
  const travelerCount = users.filter((u) => userRole(u) === "user").length;
  const agencyCount = users.filter((u) => userRole(u) === "agency").length;
  const adminCount = users.filter((u) => userRole(u) === "admin").length;

  const filterButtons = [
    { value: "all", label: "All" },
    { value: "user", label: "Travelers" },
    { value: "agency", label: "Agencies" },
    { value: "admin", label: "Admins" },
  ];

  const showSkeleton = isLoading && users.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Manage platform users and permissions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void fetchUsers()}>
              <Filter className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Users</p>
              {showSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{totalUsers}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Travelers</p>
              {showSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-blue-600">
                  {travelerCount}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Agencies</p>
              {showSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {agencyCount}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Admins</p>
              {showSkeleton ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-amber-600">{adminCount}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
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
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
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
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14"> </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Last Sign In</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const suspended = isSuspended(user);
                    return (
                      <TableRow
                        key={user.id}
                        className={suspended ? "opacity-60" : ""}
                      >
                        <TableCell>
                          <AvatarInitials user={user} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{displayName(user)}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={userRole(user)} />
                        </TableCell>
                        <TableCell>
                          {suspended ? (
                            <Badge variant="destructive">Suspended</Badge>
                          ) : (
                            <Badge className="bg-primary/10 text-primary border-primary/20">
                              Active
                            </Badge>
                          )}
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
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionLoading === user.id}
                              >
                                {actionLoading === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowDetailDialog(true);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setNewRole(userRole(user));
                                  setShowRoleDialog(true);
                                }}
                              >
                                <UserCog className="h-4 w-4 mr-2" />
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {suspended ? (
                                <DropdownMenuItem
                                  onClick={() => void handleUnsuspend(user)}
                                >
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Unsuspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => void handleSuspend(user)}
                                >
                                  <ShieldOff className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>User Details</DialogTitle>
              <DialogDescription>
                Account information and metadata
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <AvatarInitials user={selectedUser} />
                  <div className="flex-1">
                    <p className="font-semibold text-lg">
                      {displayName(selectedUser)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <RoleBadge role={userRole(selectedUser)} />
                      {isSuspended(selectedUser) && (
                        <Badge variant="destructive">Suspended</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {selectedUser.email}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Joined {formatDate(selectedUser.created_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Last sign in {formatDate(selectedUser.last_sign_in_at)}
                  </div>
                </div>

                {selectedUser.user_metadata?.agency_name && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <span className="text-muted-foreground">Agency:</span>{" "}
                    {selectedUser.user_metadata.agency_name}
                  </div>
                )}

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    User ID
                  </p>
                  <code className="text-xs break-all">{selectedUser.id}</code>
                </div>

                {isSuspended(selectedUser) && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    This account is suspended and cannot sign in.
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDetailDialog(false)}
              >
                Close
              </Button>
              {selectedUser && (
                <>
                  {isSuspended(selectedUser) ? (
                    <Button
                      onClick={() => {
                        void handleUnsuspend(selectedUser);
                        setShowDetailDialog(false);
                      }}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Unsuspend
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        void handleSuspend(selectedUser);
                        setShowDetailDialog(false);
                      }}
                    >
                      <ShieldOff className="h-4 w-4 mr-2" />
                      Suspend
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Role Dialog */}
        <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change User Role</DialogTitle>
              <DialogDescription>
                Update the role for{" "}
                <strong>{selectedUser ? displayName(selectedUser) : ""}</strong>
                . This affects what they can access on the platform.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>New Role</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as UserRole)}
              >
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
              <Button
                variant="outline"
                onClick={() => setShowRoleDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleChangeRole()}
                disabled={actionLoading !== null}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <UserCog className="h-4 w-4 mr-1" />
                )}
                Save Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
