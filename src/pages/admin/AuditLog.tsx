import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  AuditEntryDialog, actionLabel, formatDateTime, ENTITY_COLORS, type AuditEntry,
} from "./audit/AuditEntryDialog";

interface AdminUser {
  id: string;
  email: string;
}

const PAGE_SIZE = 25;

const ENTITY_TYPES = ["agency", "listing", "booking", "user", "payout", "settings"];

// ── Page ─────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [entries, setEntries]       = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading]   = useState(true);
  const [page, setPage]             = useState(1);

  // Filters
  const [entityFilter, setEntityFilter] = useState("all");
  const [adminFilter, setAdminFilter]   = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [searchInput, setSearchInput]   = useState("");
  const [search, setSearch]             = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Admin users list for filter dropdown
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  // Detail dialog
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  // ── Admin users (for filter) ───────────────────────────────────────

  useEffect(() => {
    supabase.functions
      .invoke("admin-users", { body: { action: "list" } })
      .then(({ data }) => {
        const admins = ((data?.users ?? []) as { id: string; email: string; user_metadata?: { role?: string } }[])
          .filter((u) => u.user_metadata?.role === "admin")
          .map((u) => ({ id: u.id, email: u.email }));
        setAdminUsers(admins);
      });
  }, []);

  // ── Fetch entries ──────────────────────────────────────────────────

  const fetchEntries = useCallback(async (opts?: { page?: number; search?: string }) => {
    const activePage   = opts?.page   ?? page;
    const activeSearch = opts?.search ?? search;
    setIsLoading(true);

    let query = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE - 1);

    if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
    if (adminFilter  !== "all") query = query.eq("admin_user_id", adminFilter);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo)   query = query.lte("created_at", dateTo + "T23:59:59");
    if (activeSearch) query = query.ilike("action", `%${activeSearch}%`);

    const { data, count, error } = await query;
    if (error) {
      setIsLoading(false);
      return;
    }

    // Enrich with admin email from adminUsers list
    const enriched: AuditEntry[] = (data ?? []).map((row) => ({
      ...row,
      admin_email: adminUsers.find((u) => u.id === row.admin_user_id)?.email,
    }));

    setEntries(enriched);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [page, search, entityFilter, adminFilter, dateFrom, dateTo, adminUsers]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  // Debounced search
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(v.trim());
      setPage(1);
      void fetchEntries({ page: 1, search: v.trim() });
    }, 350);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const goPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setPage(clamped);
    void fetchEntries({ page: clamped });
  };

  const resetFilters = () => {
    setEntityFilter("all");
    setAdminFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const showSkeleton = isLoading && entries.length === 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-muted-foreground">
              Track all admin actions across the platform
            </p>
          </div>
          <Button variant="outline" onClick={() => void fetchEntries()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Entries</p>
              {isLoading
                ? <Skeleton className="h-8 w-16 mt-1" />
                : <p className="text-2xl font-bold mt-1">{totalCount}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Shown on Page</p>
              {isLoading
                ? <Skeleton className="h-8 w-16 mt-1" />
                : <p className="text-2xl font-bold mt-1">{entries.length}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active Admins</p>
              <p className="text-2xl font-bold mt-1">{adminUsers.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              {/* Search */}
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-xs">Search action</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g. suspend, approve..."
                    value={searchInput}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Entity type */}
              <div className="space-y-1">
                <Label className="text-xs">Entity type</Label>
                <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ENTITY_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Admin user */}
              <div className="space-y-1">
                <Label className="text-xs">Admin</Label>
                <Select value={adminFilter} onValueChange={(v) => { setAdminFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All admins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All admins</SelectItem>
                    {adminUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reset */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetFilters} className="w-full">
                  <Filter className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </div>

            {/* Date range */}
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1">
                <Label className="text-xs">From date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {showSkeleton ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No audit entries found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(entry.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.admin_email ?? entry.admin_user_id.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {actionLabel(entry.action)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`capitalize text-xs ${ENTITY_COLORS[entry.entity_type] ?? "bg-muted text-muted-foreground"}`}>
                          {entry.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {entry.entity_id ? entry.entity_id.slice(0, 8) + "…" : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {Object.keys(entry.details).length > 0
                          ? Object.entries(entry.details)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(", ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1 || isLoading}
                onClick={() => goPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= totalPages - 3) {
                  p = totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 text-xs"
                    onClick={() => goPage(p)}
                    disabled={isLoading}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages || isLoading}
                onClick={() => goPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AuditEntryDialog
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </AdminLayout>
  );
}
