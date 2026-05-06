import { useState, useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Eye, CheckCircle, XCircle,
  Calendar, Users, Mail, Phone,
  Download, Printer, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type Booking as DbBooking } from "@/stores/bookingsStore";
import { useAuthStore } from "@/stores/authStore";

// ─── View types ───────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  booking_ref: string;
  activity: string;
  customer: string;
  email: string;
  phone: string;
  date: string;
  guests: number;
  amount: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  bookedAt: string;
  notes?: string;
}

interface TripGroup {
  key: string;
  date: string;
  activity: string;
  bookings: Booking[];
  totalGuests: number;
  totalRevenue: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const statusStyle: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toViewBooking(b: DbBooking): Booking {
  return {
    id: b.id,
    booking_ref: b.booking_ref,
    activity: b.listing?.title ?? "Listing",
    customer: b.traveler_name ?? "—",
    email: b.traveler_email ?? "—",
    phone: b.traveler_phone ?? "—",
    date: b.trip_date,
    guests: b.guests,
    amount: b.total_amount,
    status: b.status === "pending_payment" ? "pending" : b.status,
    bookedAt: b.created_at.split("T")[0],
  };
}

function csvEscape(v: string) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function generateCSV(bookings: Booking[]): string {
  const headers = [
    "Booking Ref", "Activity", "Customer Name", "Email", "Phone",
    "Date", "Guests", "Amount", "Status", "Booked At",
  ];
  const rows = bookings.map((b) => [
    b.booking_ref, b.activity, b.customer, b.email, b.phone,
    b.date, String(b.guests), `$${b.amount}`, b.status, b.bookedAt,
  ]);
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildTripGroups(bookings: Booking[]): TripGroup[] {
  const map = new Map<string, TripGroup>();
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const key = `${b.date}::${b.activity}`;
    if (!map.has(key)) {
      map.set(key, { key, date: b.date, activity: b.activity, bookings: [], totalGuests: 0, totalRevenue: 0 });
    }
    const g = map.get(key)!;
    g.bookings.push(b);
    g.totalGuests += b.guests;
    g.totalRevenue += b.amount;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildManifestHtml(group: TripGroup, agencyName: string): string {
  const generatedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const rows = group.bookings
    .map(
      (b) => `
      <tr>
        <td>${b.booking_ref}</td>
        <td>${b.customer}</td>
        <td>${b.email}</td>
        <td>${b.phone}</td>
        <td style="text-align:center">${b.guests}</td>
        <td>${b.notes ?? "—"}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Guest Manifest – ${group.activity} – ${group.date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; max-width: 920px; margin: 0 auto; padding: 40px 32px; color: #111; font-size: 13px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 28px; }
    .summary { display: flex; gap: 0; margin-bottom: 28px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; }
    .summary-item { flex: 1; padding: 14px 20px; border-right: 1px solid #e5e5e5; }
    .summary-item:last-child { border-right: none; }
    .summary-item .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
    .summary-item .value { font-size: 24px; font-weight: 700; color: #111; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #111; color: #fff; }
    th { text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; }
    td { padding: 10px 14px; border-bottom: 1px solid #e5e5e5; }
    tbody tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 36px; font-size: 11px; color: #bbb; text-align: center; border-top: 1px solid #e5e5e5; padding-top: 16px; }
    @media print {
      body { padding: 16px; }
      .footer { position: fixed; bottom: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <h1>${group.activity}</h1>
  <p class="subtitle">Guest Manifest &nbsp;·&nbsp; Generated ${generatedDate} &nbsp;·&nbsp; ${agencyName}</p>
  <div class="summary">
    <div class="summary-item"><div class="label">Trip Date</div><div class="value">${group.date}</div></div>
    <div class="summary-item"><div class="label">Total Guests</div><div class="value">${group.totalGuests}</div></div>
    <div class="summary-item"><div class="label">Bookings</div><div class="value">${group.bookings.length}</div></div>
    <div class="summary-item"><div class="label">Total Revenue</div><div class="value">$${group.totalRevenue.toLocaleString()}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Booking Ref</th>
        <th>Guest Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th style="text-align:center">Guests</th>
        <th>Special Requests / Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Yatra Nepal &nbsp;·&nbsp; Guest Manifest &nbsp;·&nbsp; Confidential — Do not distribute</div>
</body>
</html>`;
}

// ─── GuestManifestDialog ──────────────────────────────────────────────────────

function GuestManifestDialog({
  group,
  open,
  onOpenChange,
  agencyName,
}: {
  group: TripGroup;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agencyName: string;
}) {
  const handlePrint = () => {
    const html = buildManifestHtml(group, agencyName);
    const w = window.open("", "_blank", "width=960,height=720");
    if (!w) {
      toast.error("Pop-ups are blocked. Please allow pop-ups to print.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Guest Manifest — {group.activity}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{group.date}</p>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 py-1">
          {[
            { label: "Trip Date", value: group.date },
            { label: "Total Guests", value: group.totalGuests },
            { label: "Bookings", value: group.bookings.length },
            { label: "Total Revenue", value: `$${group.totalRevenue.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-muted/30 border border-border p-3 text-center">
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Guest table */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Booking Ref
                </th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Guest Name
                </th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Phone
                </th>
                <th className="text-center p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Guests
                </th>
                <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {group.bookings.map((b) => (
                <tr key={b.id} className="hover:bg-muted/20">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{b.booking_ref}</td>
                  <td className="p-3 font-medium">{b.customer}</td>
                  <td className="p-3 text-muted-foreground text-xs">{b.email}</td>
                  <td className="p-3 text-muted-foreground text-xs">{b.phone}</td>
                  <td className="p-3 text-center font-semibold">{b.guests}</td>
                  <td className="p-3 text-muted-foreground text-xs">{b.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Print Manifest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AgencyBookings ───────────────────────────────────────────────────────────

export default function AgencyBookings() {
  const {
    agencyBookings, isLoading,
    fetchAgencyBookings, updateBookingStatus, subscribeToAgencyBookings,
  } = useBookingsStore();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [manifestOpen, setManifestOpen] = useState(false);
  const [manifestGroup, setManifestGroup] = useState<TripGroup | null>(null);

  useEffect(() => { void fetchAgencyBookings(); }, [fetchAgencyBookings]);
  useEffect(() => { const unsub = subscribeToAgencyBookings(); return unsub; }, [subscribeToAgencyBookings]);

  const bookings = useMemo(() => agencyBookings.map(toViewBooking), [agencyBookings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter((b) => {
      const matchSearch =
        !q ||
        b.customer.toLowerCase().includes(q) ||
        b.booking_ref.toLowerCase().includes(q) ||
        b.activity.toLowerCase().includes(q);
      const matchTab = tab === "all" || tab === "manifests" || b.status === tab;
      return matchSearch && matchTab;
    });
  }, [bookings, search, tab]);

  const tripGroups = useMemo(() => buildTripGroups(bookings), [bookings]);

  const counts = useMemo(() => ({
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    manifests: tripGroups.length,
  }), [bookings, tripGroups]);

  const handleAction = async (id: string, action: "confirm" | "cancel") => {
    const ref = bookings.find((b) => b.id === id)?.booking_ref ?? id;
    const { error } = await updateBookingStatus(id, action === "confirm" ? "confirmed" : "cancelled");
    if (error) { toast.error(error); return; }
    toast.success(action === "confirm" ? `Booking ${ref} confirmed.` : `Booking ${ref} cancelled.`);
  };

  const handleExportCSV = () => {
    const toExport = tab === "manifests" ? bookings : filtered;
    if (!toExport.length) { toast.error("No bookings to export."); return; }
    const date = new Date().toISOString().split("T")[0];
    downloadCSV(generateCSV(toExport), `bookings-${date}.csv`);
    toast.success(`Exported ${toExport.length} booking${toExport.length !== 1 ? "s" : ""}`);
  };

  const agencyName = user?.agencyName ?? user?.name ?? "Agency";

  return (
    <AgencyLayout title="Bookings">
      <div className="space-y-5">

        {/* ── Top bar ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ref, or activity…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={handleExportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All ({bookings.length})</TabsTrigger>
            <TabsTrigger value="pending">
              Pending{counts.pending > 0 && ` (${counts.pending})`}
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              Confirmed{counts.confirmed > 0 && ` (${counts.confirmed})`}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="manifests" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Manifests{counts.manifests > 0 && ` (${counts.manifests})`}
            </TabsTrigger>
          </TabsList>

          {/* ── Booking list tabs ────────────────────────────── */}
          {["all", "pending", "confirmed", "completed", "cancelled"].map((tabVal) => (
            <TabsContent key={tabVal} value={tabVal} className="mt-4">
              <div className="grid gap-3">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-4 w-3/4 max-w-md" />
                            <Skeleton className="h-4 w-52" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-20" />
                            <Skeleton className="h-9 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : filtered.length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground text-sm">No bookings found.</p>
                ) : (
                  filtered.map((booking) => (
                    <Card key={booking.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-medium text-foreground">
                                {booking.booking_ref}
                              </span>
                              <Badge variant="secondary" className={statusStyle[booking.status]}>
                                {booking.status}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-foreground">{booking.activity}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {booking.customer} &middot; {booking.guests} guest{booking.guests !== 1 ? "s" : ""}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {booking.date}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <p className="text-lg font-bold text-foreground">${booking.amount}</p>

                            {/* Detail dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1">
                                  <Eye className="h-3 w-3" /> Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Booking {booking.booking_ref}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Activity</p>
                                    <p className="font-medium text-foreground">{booking.activity}</p>
                                  </div>
                                  <Separator />
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">Customer</p>
                                      <p className="font-medium">{booking.customer}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Guests</p>
                                      <p className="font-medium">{booking.guests}</p>
                                    </div>
                                    <div className="flex items-center gap-1 col-span-2 flex-wrap">
                                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <a href={`mailto:${booking.email}`} className="text-sm hover:text-primary">{booking.email}</a>
                                    </div>
                                    <div className="flex items-center gap-1 col-span-2">
                                      <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <a href={`tel:${booking.phone}`} className="text-sm hover:text-primary">{booking.phone}</a>
                                    </div>
                                  </div>
                                  <Separator />
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">Trip Date</p>
                                      <p className="font-medium">{booking.date}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Booked On</p>
                                      <p className="font-medium">{booking.bookedAt}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Amount</p>
                                      <p className="font-medium text-lg">${booking.amount}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Status</p>
                                      <Badge className={statusStyle[booking.status]}>{booking.status}</Badge>
                                    </div>
                                  </div>
                                  {booking.notes && (
                                    <>
                                      <Separator />
                                      <div>
                                        <p className="text-sm text-muted-foreground">Notes</p>
                                        <p className="text-sm">{booking.notes}</p>
                                      </div>
                                    </>
                                  )}
                                  {booking.status === "pending" && (
                                    <>
                                      <Separator />
                                      <div className="flex gap-2">
                                        <Button
                                          className="flex-1 gap-1"
                                          onClick={() => handleAction(booking.id, "confirm")}
                                        >
                                          <CheckCircle className="h-4 w-4" /> Confirm
                                        </Button>
                                        <Button
                                          variant="outline"
                                          className="flex-1 gap-1 text-destructive"
                                          onClick={() => handleAction(booking.id, "cancel")}
                                        >
                                          <XCircle className="h-4 w-4" /> Cancel
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>

                            {booking.status === "pending" && (
                              <Button
                                size="sm"
                                onClick={() => handleAction(booking.id, "confirm")}
                                className="gap-1"
                              >
                                <CheckCircle className="h-3 w-3" /> Confirm
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          ))}

          {/* ── Manifests tab ─────────────────────────────────── */}
          <TabsContent value="manifests" className="mt-4">
            <div className="space-y-3">
              {tripGroups.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">No trip manifests yet</p>
                  <p className="text-xs text-muted-foreground">
                    Manifests are generated for confirmed bookings grouped by trip date.
                  </p>
                </div>
              ) : (
                tripGroups.map((group) => (
                  <Card key={group.key}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{group.activity}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" /> {group.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {group.totalGuests} guest{group.totalGuests !== 1 ? "s" : ""}
                              &nbsp;&middot;&nbsp;
                              {group.bookings.length} booking{group.bookings.length !== 1 ? "s" : ""}
                            </span>
                            <span className="text-foreground font-medium">
                              ${group.totalRevenue.toLocaleString()} total
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => { setManifestGroup(group); setManifestOpen(true); }}
                        >
                          <ClipboardList className="h-4 w-4" /> View Manifest
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Guest Manifest Dialog ─────────────────────────────── */}
      {manifestGroup && (
        <GuestManifestDialog
          group={manifestGroup}
          open={manifestOpen}
          onOpenChange={setManifestOpen}
          agencyName={agencyName}
        />
      )}
    </AgencyLayout>
  );
}
