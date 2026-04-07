import { useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Eye, CheckCircle, XCircle, Calendar, Users, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

interface Booking {
  id: string;
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

const mockBookings: Booking[] = [
  { id: "BK-001", activity: "Everest Base Camp Trek", customer: "John Smith", email: "john@example.com", phone: "+1 555-0101", date: "2026-04-15", guests: 2, amount: 3798, status: "confirmed", bookedAt: "2026-03-20" },
  { id: "BK-002", activity: "Paragliding Over Pokhara", customer: "Sarah Lee", email: "sarah@example.com", phone: "+44 7700-0102", date: "2026-04-12", guests: 1, amount: 120, status: "pending", bookedAt: "2026-03-28" },
  { id: "BK-003", activity: "Chitwan Safari Experience", customer: "Mike Chen", email: "mike@example.com", phone: "+86 138-0103", date: "2026-04-20", guests: 4, amount: 1800, status: "confirmed", bookedAt: "2026-03-15" },
  { id: "BK-004", activity: "Langtang Valley Trek", customer: "Emma Wilson", email: "emma@example.com", phone: "+1 555-0104", date: "2026-04-25", guests: 3, amount: 3297, status: "pending", bookedAt: "2026-03-29" },
  { id: "BK-005", activity: "Everest Base Camp Trek", customer: "Alex Turner", email: "alex@example.com", phone: "+61 400-0105", date: "2026-03-10", guests: 2, amount: 3798, status: "completed", bookedAt: "2026-02-15" },
  { id: "BK-006", activity: "Paragliding Over Pokhara", customer: "Nina Patel", email: "nina@example.com", phone: "+91 98765-0106", date: "2026-03-05", guests: 1, amount: 120, status: "cancelled", bookedAt: "2026-02-28", notes: "Customer requested cancellation due to schedule conflict." },
];

const statusStyle: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function AgencyBookings() {
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = bookings.filter((b) => {
    const matchSearch = b.customer.toLowerCase().includes(search.toLowerCase()) || b.id.toLowerCase().includes(search.toLowerCase()) || b.activity.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || b.status === tab;
    return matchSearch && matchTab;
  });

  const handleAction = (id: string, action: "confirm" | "cancel") => {
    setBookings((prev) =>
      prev.map((b) => b.id === id ? { ...b, status: action === "confirm" ? "confirmed" : "cancelled" } : b)
    );
    toast.success(action === "confirm" ? `Booking ${id} confirmed.` : `Booking ${id} cancelled.`);
  };

  return (
    <AgencyLayout title="Bookings">
      <div className="space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bookings…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending ({bookings.filter((b) => b.status === "pending").length})</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed ({bookings.filter((b) => b.status === "confirmed").length})</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="grid gap-3">
              {filtered.map((booking) => (
                <Card key={booking.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{booking.id}</span>
                          <Badge variant="secondary" className={statusStyle[booking.status]}>{booking.status}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">{booking.activity}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {booking.customer} ({booking.guests} guests)</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {booking.date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold text-foreground">${booking.amount}</p>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1"><Eye className="h-3 w-3" /> Details</Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader><DialogTitle>Booking {booking.id}</DialogTitle></DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Activity</p>
                                <p className="font-medium text-foreground">{booking.activity}</p>
                              </div>
                              <Separator />
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><p className="text-muted-foreground">Customer</p><p className="font-medium">{booking.customer}</p></div>
                                <div><p className="text-muted-foreground">Guests</p><p className="font-medium">{booking.guests}</p></div>
                                <div className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" /><p className="text-sm">{booking.email}</p></div>
                                <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /><p className="text-sm">{booking.phone}</p></div>
                              </div>
                              <Separator />
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><p className="text-muted-foreground">Trip Date</p><p className="font-medium">{booking.date}</p></div>
                                <div><p className="text-muted-foreground">Booked On</p><p className="font-medium">{booking.bookedAt}</p></div>
                                <div><p className="text-muted-foreground">Amount</p><p className="font-medium text-lg">${booking.amount}</p></div>
                                <div><p className="text-muted-foreground">Status</p><Badge className={statusStyle[booking.status]}>{booking.status}</Badge></div>
                              </div>
                              {booking.notes && (
                                <>
                                  <Separator />
                                  <div><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm">{booking.notes}</p></div>
                                </>
                              )}
                              {booking.status === "pending" && (
                                <>
                                  <Separator />
                                  <div className="flex gap-2">
                                    <Button className="flex-1 gap-1" onClick={() => handleAction(booking.id, "confirm")}><CheckCircle className="h-4 w-4" /> Confirm</Button>
                                    <Button variant="outline" className="flex-1 gap-1 text-destructive" onClick={() => handleAction(booking.id, "cancel")}><XCircle className="h-4 w-4" /> Cancel</Button>
                                  </div>
                                </>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        {booking.status === "pending" && (
                          <Button size="sm" onClick={() => handleAction(booking.id, "confirm")} className="gap-1"><CheckCircle className="h-3 w-3" /> Confirm</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground">No bookings found.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AgencyLayout>
  );
}
