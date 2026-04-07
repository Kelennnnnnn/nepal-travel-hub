import { useState } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AvailabilitySlot {
  id: string;
  date: string;
  spots: number;
  priceOverride?: number;
  blocked: boolean;
}

const listings = [
  { id: "1", title: "Everest Base Camp Trek" },
  { id: "2", title: "Chitwan Safari Experience" },
  { id: "3", title: "Annapurna Circuit Trek" },
  { id: "4", title: "Langtang Valley Trek" },
];

const initialSlots: AvailabilitySlot[] = [
  { id: "s1", date: "2026-04-15", spots: 8, blocked: false },
  { id: "s2", date: "2026-04-20", spots: 12, blocked: false },
  { id: "s3", date: "2026-04-25", spots: 10, priceOverride: 2099, blocked: false },
  { id: "s4", date: "2026-05-01", spots: 0, blocked: true },
];

export default function AgencyAvailability() {
  const [selectedListing, setSelectedListing] = useState("1");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(2026, 3, 15));
  const [slots, setSlots] = useState<AvailabilitySlot[]>(initialSlots);

  const bookedDates = slots.filter((s) => !s.blocked && s.spots > 0).map((s) => new Date(s.date));
  const blockedDates = slots.filter((s) => s.blocked).map((s) => new Date(s.date));

  const selectedSlot = selectedDate ? slots.find((s) => s.date === selectedDate.toISOString().split("T")[0]) : undefined;

  const handleAddSlot = (date: Date, spots: number, price?: number) => {
    const dateStr = date.toISOString().split("T")[0];
    setSlots([...slots.filter((s) => s.date !== dateStr), { id: `s-${Date.now()}`, date: dateStr, spots, priceOverride: price, blocked: false }]);
    toast({ title: "Availability added", description: `${spots} spots on ${dateStr}` });
  };

  const toggleBlock = (dateStr: string) => {
    setSlots(slots.map((s) => s.date === dateStr ? { ...s, blocked: !s.blocked } : s));
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter((s) => s.id !== id));
    toast({ title: "Slot removed" });
  };

  return (
    <AgencyLayout title="Availability">
      <div className="space-y-5">
        <div className="max-w-xs">
          <Label>Select Activity</Label>
          <Select value={selectedListing} onValueChange={setSelectedListing}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{listings.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>

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
                  <CardTitle className="text-base">{selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</CardTitle>
                  {!selectedSlot && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Slot</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader><DialogTitle>Add Availability</DialogTitle></DialogHeader>
                        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleAddSlot(selectedDate, Number(fd.get("spots")), fd.get("price") ? Number(fd.get("price")) : undefined); }} className="space-y-4">
                          <div className="space-y-2"><Label>Available Spots</Label><Input name="spots" type="number" defaultValue={10} required /></div>
                          <div className="space-y-2"><Label>Price Override (optional)</Label><Input name="price" type="number" placeholder="Leave blank for default" /></div>
                          <Button type="submit" className="w-full">Add Availability</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {selectedSlot ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Spots Available</span>
                        <span className="font-medium text-foreground">{selectedSlot.spots}</span>
                      </div>
                      {selectedSlot.priceOverride && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Price Override</span>
                          <span className="font-medium text-foreground">${selectedSlot.priceOverride}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Block Date</span>
                        <Switch checked={selectedSlot.blocked} onCheckedChange={() => toggleBlock(selectedSlot.date)} />
                      </div>
                      <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => removeSlot(selectedSlot.id)}>
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
                  {slots.filter((s) => !s.blocked).sort((a, b) => a.date.localeCompare(b.date)).map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{new Date(slot.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                        <p className="text-xs text-muted-foreground">{slot.spots} spots{slot.priceOverride ? ` · $${slot.priceOverride}` : ""}</p>
                      </div>
                      <Badge variant="secondary" className="bg-primary/10 text-primary">Open</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AgencyLayout>
  );
}
