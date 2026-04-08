import { useState, useEffect, useMemo } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useListingsStore } from "@/stores/listingsStore";
import { useAuthStore } from "@/stores/authStore";

const priceFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default function AgencyAvailability() {
  const { user } = useAuthStore();
  const {
    myListings,
    myAvailability,
    isLoading,
    fetchMyListings,
    fetchMyAvailability,
    upsertAvailability,
    deleteAvailability,
  } = useListingsStore();

  const [selectedListing, setSelectedListing] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const activeListing = useMemo(
    () => myListings.find((l) => l.id === selectedListing),
    [myListings, selectedListing]
  );

  // Fetch listings on mount if empty
  useEffect(() => {
    if (myListings.length === 0) {
      fetchMyListings();
    }
  }, [fetchMyListings, myListings.length]);

  // Default to first listing once loaded
  useEffect(() => {
    if (!selectedListing && myListings.length > 0) {
      setSelectedListing(myListings[0].id);
    }
  }, [myListings, selectedListing]);

  // Fetch availability whenever selected listing changes
  useEffect(() => {
    if (selectedListing) {
      fetchMyAvailability(selectedListing);
    }
  }, [selectedListing, fetchMyAvailability]);

  // Map store slots for calendar modifiers
  const bookedDates = myAvailability
    .filter((s) => !s.blocked && s.spots_total > 0)
    .map((s) => new Date(s.date + "T00:00:00"));
  const blockedDates = myAvailability
    .filter((s) => s.blocked)
    .map((s) => new Date(s.date + "T00:00:00"));

  const selectedSlot = selectedDate
    ? myAvailability.find(
        (s) => s.date === selectedDate.toISOString().split("T")[0]
      )
    : undefined;

  const handleAddSlot = async (date: Date, spots: number, price?: number) => {
    if (!selectedListing || !user) return;
    setIsSaving(true);
    const dateStr = date.toISOString().split("T")[0];

    const { error } = await upsertAvailability({
      listing_id: selectedListing,
      agency_id: user.id,
      date: dateStr,
      spots_total: spots,
      spots_remaining: spots,
      price_override:
        price !== undefined && Number.isFinite(price) ? price : null,
      blocked: false,
    });

    setIsSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`${spots} spots on ${dateStr}`);
    }
  };

  const toggleBlock = async (slot: typeof myAvailability[0]) => {
    setIsSaving(true);
    const { error } = await upsertAvailability({
      ...slot,
      blocked: !slot.blocked,
    });
    setIsSaving(false);
    if (error) {
      toast.error(error);
    }
  };

  const removeSlot = async (id: string) => {
    setIsSaving(true);
    const { error } = await deleteAvailability(id);
    setIsSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Slot removed");
    }
  };

  return (
    <AgencyLayout title="Availability">
      <div className="space-y-5">
        <div className="max-w-xs">
          <Label>Select Activity</Label>
          {myListings.length === 0 && isLoading ? (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading listings…
            </div>
          ) : (
            <Select value={selectedListing} onValueChange={setSelectedListing}>
              <SelectTrigger><SelectValue placeholder="Select a listing" /></SelectTrigger>
              <SelectContent>
                {myListings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Loading availability */}
        {isLoading && selectedListing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading availability…
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          {/* Calendar */}
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className={cn("p-3 pointer-events-auto")}
                modifiers={{ booked: bookedDates, blocked: blockedDates }}
                modifiersStyles={{
                  booked: { backgroundColor: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))", fontWeight: 600 },
                  blocked: { backgroundColor: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))", textDecoration: "line-through" },
                }}
              />
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground px-3">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-primary/20" /> Available</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-destructive/20" /> Blocked</span>
              </div>
            </CardContent>
          </Card>

          {/* Slot Details / Add */}
          <div className="space-y-4">
            {selectedDate && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </CardTitle>
                  {!selectedSlot && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1" disabled={isSaving}><Plus className="h-4 w-4" /> Add Slot</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader><DialogTitle>Add Availability</DialogTitle></DialogHeader>
                        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleAddSlot(selectedDate, Number(fd.get("spots")), fd.get("price") ? Number(fd.get("price")) : undefined); }} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Available Spots</Label>
                            <Input
                              key={`spots-${selectedListing}`}
                              name="spots"
                              type="number"
                              min={1}
                              defaultValue={activeListing?.max_participants ?? ""}
                              required
                            />
                          </div>
                          <div className="space-y-2"><Label>Price Override (optional)</Label><Input name="price" type="number" placeholder="Leave blank for default" /></div>
                          <Button type="submit" className="w-full" disabled={isSaving}>
                            {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Add Availability"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {selectedSlot ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Spots Total</span>
                        <span className="font-medium text-foreground">{selectedSlot.spots_total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Spots Remaining</span>
                        <span className="font-medium text-foreground">{selectedSlot.spots_remaining}</span>
                      </div>
                      {selectedSlot.price_override && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Price Override</span>
                          <span className="font-medium text-foreground">
                            {priceFormatter.format(selectedSlot.price_override)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Block Date</span>
                        <Switch
                          checked={selectedSlot.blocked}
                          onCheckedChange={() => toggleBlock(selectedSlot)}
                          disabled={isSaving}
                        />
                      </div>
                      <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => removeSlot(selectedSlot.id)} disabled={isSaving}>
                        <Trash2 className="h-3 w-3" /> Remove Slot
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No availability set for this date. Add a slot to open bookings.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Upcoming Slots */}
            <Card>
              <CardHeader><CardTitle className="text-base">Upcoming Slots</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {myAvailability
                    .filter((s) => !s.blocked)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(slot.date + "T00:00:00").toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {slot.spots_remaining}/{slot.spots_total} spots
                            {slot.price_override != null
                              ? ` · ${priceFormatter.format(slot.price_override)}`
                              : ""}
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">Open</Badge>
                      </div>
                    ))}
                  {myAvailability.filter((s) => !s.blocked).length === 0 && (
                    <p className="text-sm text-muted-foreground">No upcoming slots.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AgencyLayout>
  );
}
