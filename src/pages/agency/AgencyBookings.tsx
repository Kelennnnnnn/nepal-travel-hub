import { useState, useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Eye, CheckCircle, XCircle, Calendar, Users, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { useBookingsStore, type Booking as DbBooking } from "@/stores/bookingsStore";

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

const statusStyle: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

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

export default function AgencyBookings() {
  const {
    agencyBookings,
    isLoading,
    fetchAgencyBookings,
    updateBookingStatus,
    subscribeToAgencyBookings,
  } = useBookingsStore();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    void fetchAgencyBookings();
  }, [fetchAgencyBookings]);

  useEffect(() => {
    const unsubscribe = subscribeToAgencyBookings();
    return unsubscribe;
  }, [subscribeToAgencyBookings]);

  const bookings = useMemo(() => agencyBookings.map(toViewBooking), [agencyBookings]);

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      b.customer.toLowerCase().includes(q) ||
      b.booking_ref.toLowerCase().includes(q) ||
      b.activity.toLowerCase().includes(q);
    const matchTab = tab === "all" || b.status === tab;
    return matchSearch && matchTab;
  });

  const handleAction = async (id: string, action: "confirm" | "cancel") => {
    const ref = bookings.find((b) => b.id === id)?.booking_ref ?? id;
    const status = action === "confirm" ? "confirmed" : "cancelled";
    const { error } = await updateBookingStatus(id, status);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(action === "confirm" ? `Booking ${ref} confirmed.` : `Booking ${ref} cancelled.`);
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
              {isLoading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-4 w-3/4 max-w-md" />
                            <Skeleton className="h-4 w-52" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-20" />
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="h-9 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                filtered.map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{booking.booking_ref}</span>
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
                              <DialogHeader><DialogTitle>Booking {booking.booking_ref}</DialogTitle></DialogHeader>
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
                ))
              )}
              {!isLoading && filtered.length === 0 && <div className="text-center py-12 text-muted-foreground">No bookings found.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AgencyLayout>
  );
}
