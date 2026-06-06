import { useState, useEffect, useMemo, useCallback } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, CalendarRange, Zap,
  Trash2, Loader2, Pencil, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isToday, isBefore, startOfDay, addDays, format,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useListingsStore } from "@/stores/listingsStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import type { AvailabilitySlot } from "@/stores/listingsStore";
import { BulkRangeDialog } from "./availability/BulkRangeDialog";
import { SeasonalPricingDialog } from "./availability/SeasonalPricingDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDatesInRange(start: string, end: string, dows: number[]): string[] {
  if (!start || !end || !dows.length) return [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s > e) return [];
  const result: string[] = [];
  let cur = s;
  while (cur <= e) {
    if (dows.includes(cur.getDay())) result.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return result;
}

function calendarCells(viewMonth: Date): (Date | null)[] {
  const start = startOfMonth(viewMonth);
  const end = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start, end });
  const cells: (Date | null)[] = Array<null>(getDay(start)).fill(null);
  days.forEach(d => cells.push(d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function cellClasses(
  slot: AvailabilitySlot | undefined,
  inMonth: boolean,
  isPast: boolean,
  selected: boolean,
): string {
  if (!inMonth) return "opacity-0 pointer-events-none h-[72px] rounded-md border border-transparent";
  const base = "h-[72px] rounded-md border p-1.5 cursor-pointer select-none transition-colors";
  const ring = selected ? " ring-2 ring-primary ring-offset-1" : "";
  if (isPast) return cn(base, ring, "opacity-40 bg-muted/10 border-muted/20 cursor-default");
  if (!slot) return cn(base, ring, "bg-muted/20 border-muted/40 hover:bg-muted/40");
  if (slot.blocked) return cn(base, ring, "bg-destructive/10 border-destructive/20 hover:bg-destructive/15");
  if (slot.spots_remaining === 0) return cn(base, ring, "bg-destructive/10 border-destructive/20 hover:bg-destructive/15");
  const low = slot.spots_remaining <= Math.ceil(slot.spots_total * 0.25);
  if (low) return cn(base, ring, "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800");
  return cn(base, ring, "bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800");
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgencyAvailability() {
  const { user } = useAuthStore();
  const {
    myListings, myAvailability, isLoading,
    fetchMyListings, fetchMyAvailability, upsertAvailability, deleteAvailability,
  } = useListingsStore();

  // Listing selection
  const [selectedListing, setSelectedListing] = useState("");
  const activeListing = useMemo(
    () => myListings.find(l => l.id === selectedListing),
    [myListings, selectedListing],
  );

  // Calendar navigation
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Single-slot edit mode
  const [editMode, setEditMode] = useState(false);
  const [editSpots, setEditSpots] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Add slot form (for dates without a slot)
  const [addSpots, setAddSpots] = useState("");
  const [addPrice, setAddPrice] = useState("");

  // Saving
  const [isSaving, setIsSaving] = useState(false);

  // Clear range dialog
  const [clearOpen, setClearOpen] = useState(false);
  const [clearStart, setClearStart] = useState("");
  const [clearEnd, setClearEnd] = useState("");

  // Bulk range dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkDows, setBulkDows] = useState<number[]>(ALL_DOWS);
  const [bulkSpots, setBulkSpots] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkBlocked, setBulkBlocked] = useState(false);

  // Seasonal pricing dialog
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [seasonDows, setSeasonDows] = useState<number[]>(ALL_DOWS);
  const [seasonMode, setSeasonMode] = useState<"fixed" | "multiplier">("multiplier");
  const [seasonValue, setSeasonValue] = useState("");
  const [seasonSpots, setSeasonSpots] = useState("");

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (myListings.length === 0) fetchMyListings();
  }, [fetchMyListings, myListings.length]);

  useEffect(() => {
    if (!selectedListing && myListings.length > 0) setSelectedListing(myListings[0].id);
  }, [myListings, selectedListing]);

  useEffect(() => {
    if (selectedListing) fetchMyAvailability(selectedListing);
  }, [selectedListing, fetchMyAvailability]);

  // Reset add form defaults when listing changes
  useEffect(() => {
    setAddSpots(String(activeListing?.max_participants ?? ""));
  }, [activeListing]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const slotMap = useMemo(
    () => Object.fromEntries(myAvailability.map(s => [s.date, s])),
    [myAvailability],
  );

  const selectedSlot = selectedDate ? slotMap[selectedDate] : undefined;
  const cells = useMemo(() => calendarCells(viewMonth), [viewMonth]);
  const today = startOfDay(new Date());

  // ── Single-slot actions ───────────────────────────────────────────────────

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing || !user || !selectedDate) return;
    const spots = Number(addSpots);
    if (!spots || spots < 1) { toast.error("Enter valid spot count."); return; }
    setIsSaving(true);
    const { error } = await upsertAvailability({
      listing_id: selectedListing,
      agency_id: user.id,
      date: selectedDate,
      spots_total: spots,
      spots_remaining: spots,
      price_override: addPrice ? Number(addPrice) : null,
      blocked: false,
    });
    setIsSaving(false);
    if (error) toast.error(error);
    else { toast.success("Slot added"); setAddSpots(String(activeListing?.max_participants ?? "")); setAddPrice(""); }
  };

  const handleEditSave = async () => {
    if (!selectedSlot || !user) return;
    const newTotal = Number(editSpots);
    if (!newTotal || newTotal < 1) { toast.error("Enter valid spot count."); return; }
    const bookingsMade = selectedSlot.spots_total - selectedSlot.spots_remaining;
    setIsSaving(true);
    const { error } = await upsertAvailability({
      ...selectedSlot,
      spots_total: newTotal,
      spots_remaining: Math.max(0, newTotal - bookingsMade),
      price_override: editPrice ? Number(editPrice) : null,
    });
    setIsSaving(false);
    if (error) toast.error(error);
    else { toast.success("Slot updated"); setEditMode(false); }
  };

  const toggleBlock = async (slot: AvailabilitySlot) => {
    setIsSaving(true);
    const { error } = await upsertAvailability({ ...slot, blocked: !slot.blocked });
    setIsSaving(false);
    if (error) toast.error(error);
  };

  const removeSlot = async (id: string) => {
    setIsSaving(true);
    const { error } = await deleteAvailability(id);
    setIsSaving(false);
    if (error) toast.error(error);
    else { toast.success("Slot removed"); setSelectedDate(null); }
  };

  // ── Bulk upsert ───────────────────────────────────────────────────────────

  const bulkUpsertSlots = useCallback(async (
    slots: Array<Omit<AvailabilitySlot, "id" | "created_at">>,
  ) => {
    if (!slots.length) { toast.error("No dates match the selection."); return; }
    setIsSaving(true);
    const { error } = await supabase
      .from("availability")
      .upsert(slots, { onConflict: "listing_id,date" });
    if (error) {
      toast.error(error.message);
    } else {
      await fetchMyAvailability(selectedListing);
      toast.success(`Applied to ${slots.length} date${slots.length !== 1 ? "s" : ""}`);
    }
    setIsSaving(false);
  }, [selectedListing, fetchMyAvailability]);

  const handleClearRange = async () => {
    if (!clearStart || !clearEnd) return;
    const dates = getDatesInRange(clearStart, clearEnd, [0, 1, 2, 3, 4, 5, 6]);
    if (dates.length === 0) { toast.error("No dates in the selected range."); return; }
    // Collect IDs of existing slots that fall in the range
    const idsToDelete = dates
      .map(d => slotMap[d]?.id)
      .filter(Boolean) as string[];
    if (idsToDelete.length === 0) {
      toast.info("No slots found in the selected range.");
      setClearOpen(false);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("availability")
      .delete()
      .in("id", idsToDelete);
    if (error) {
      toast.error(error.message);
    } else {
      await fetchMyAvailability(selectedListing);
      toast.success(`Cleared ${idsToDelete.length} slot${idsToDelete.length !== 1 ? "s" : ""}.`);
      setSelectedDate(null);
    }
    setIsSaving(false);
    setClearOpen(false);
  };

  const handleBulkApply = async () => {
    if (!user || !selectedListing || !activeListing) return;
    const dates = getDatesInRange(bulkStart, bulkEnd, bulkDows);
    const spots = Number(bulkSpots) || activeListing.max_participants;
    const slots = dates.map(date => {
      const existing = slotMap[date];
      const bookingsMade = existing ? existing.spots_total - existing.spots_remaining : 0;
      return {
        listing_id: selectedListing,
        agency_id: user.id,
        date,
        spots_total: spots,
        spots_remaining: Math.max(0, spots - bookingsMade),
        price_override: bulkPrice ? Number(bulkPrice) : null,
        blocked: bulkBlocked,
      };
    });
    await bulkUpsertSlots(slots);
    setBulkOpen(false);
  };

  const handleSeasonApply = async () => {
    if (!user || !selectedListing || !activeListing) return;
    const numVal = Number(seasonValue);
    if (!numVal || numVal <= 0) { toast.error("Enter a valid price or multiplier."); return; }
    const priceOverride = seasonMode === "fixed"
      ? numVal
      : Math.round(activeListing.price * numVal);
    const dates = getDatesInRange(seasonStart, seasonEnd, seasonDows);
    const customSpots = seasonSpots ? Number(seasonSpots) : null;
    const slots = dates.map(date => {
      const existing = slotMap[date];
      const totalSpots = customSpots ?? existing?.spots_total ?? activeListing.max_participants;
      const bookingsMade = existing ? existing.spots_total - existing.spots_remaining : 0;
      return {
        listing_id: selectedListing,
        agency_id: user.id,
        date,
        spots_total: totalSpots,
        spots_remaining: Math.max(0, totalSpots - bookingsMade),
        price_override: priceOverride,
        blocked: existing?.blocked ?? false,
      };
    });
    await bulkUpsertSlots(slots);
    setSeasonOpen(false);
  };

  // ── Calendar click ────────────────────────────────────────────────────────

  const handleDayClick = (day: Date) => {
    if (isBefore(startOfDay(day), today)) return;
    const dateStr = format(day, "yyyy-MM-dd");
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    setEditMode(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AgencyLayout title="Availability">
      <div className="space-y-5">

        {/* Activity selector + action buttons */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Activity</Label>
            {myListings.length === 0 && isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Select value={selectedListing} onValueChange={setSelectedListing}>
                <SelectTrigger><SelectValue placeholder="Select a listing" /></SelectTrigger>
                <SelectContent>
                  {myListings.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!selectedListing}
              onClick={() => setBulkOpen(true)}
            >
              <CalendarRange className="h-4 w-4" /> Bulk Range
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!selectedListing}
              onClick={() => setSeasonOpen(true)}
            >
              <Zap className="h-4 w-4" /> Peak Pricing
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
              disabled={!selectedListing}
              onClick={() => { setClearStart(""); setClearEnd(""); setClearOpen(true); }}
            >
              <Trash2 className="h-4 w-4" /> Clear Range
            </Button>
          </div>
        </div>

        {/* Loading indicator */}
        {isLoading && selectedListing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading availability…
          </div>
        )}

        {/* ── Main layout ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

          {/* Month Calendar */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setViewMonth(m => subMonths(m, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-base">
                  {format(viewMonth, "MMMM yyyy")}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setViewMonth(m => addMonths(m, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DOW_LABELS.map(d => (
                  <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1.5">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = format(day, "yyyy-MM-dd");
                  const slot = slotMap[dateStr];
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isPast = isBefore(startOfDay(day), today);
                  const isSelected = selectedDate === dateStr;
                  const isTodayDay = isToday(day);

                  return (
                    <div
                      key={i}
                      className={cellClasses(slot, inMonth, isPast, isSelected)}
                      onClick={() => !isPast && inMonth && handleDayClick(day)}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium leading-none",
                          isTodayDay && "text-primary font-bold",
                          isPast && "text-muted-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {slot && !isPast && (
                        <div className="mt-1 space-y-0.5">
                          {slot.blocked ? (
                            <span className="text-[10px] leading-none text-destructive font-medium">Blocked</span>
                          ) : (
                            <>
                              <div className="text-[10px] leading-none text-foreground/70">
                                {slot.spots_remaining}/{slot.spots_total} spots
                              </div>
                              {slot.price_override != null && (
                                <div className="text-[10px] leading-none text-foreground/60">
                                  {fmt.format(slot.price_override)}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 text-[11px] text-muted-foreground px-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-green-200 border border-green-300 dark:bg-green-900/40" /> Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-amber-200 border border-amber-300 dark:bg-amber-900/40" /> Low spots
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-destructive/20 border border-destructive/30" /> Blocked / Full
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-muted/40 border border-muted/50" /> No slot
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Right panel: slot editor + upcoming */}
          <div className="space-y-4">

            {/* Slot editor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {selectedDate
                    ? format(new Date(selectedDate + "T00:00:00"), "EEEE, MMM d, yyyy")
                    : "Select a date"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedDate && (
                  <p className="text-sm text-muted-foreground">
                    Click any future date on the calendar to manage its availability.
                  </p>
                )}

                {selectedDate && !selectedSlot && (
                  <form onSubmit={handleAddSlot} className="space-y-3">
                    <p className="text-xs text-muted-foreground mb-2">No slot — add availability:</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Spots</Label>
                      <Input
                        type="number" min={1}
                        value={addSpots}
                        onChange={e => setAddSpots(e.target.value)}
                        placeholder={String(activeListing?.max_participants ?? 10)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Price override (optional)</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={addPrice}
                        onChange={e => setAddPrice(e.target.value)}
                        placeholder={activeListing ? fmt.format(activeListing.price) : "Default price"}
                      />
                    </div>
                    <Button type="submit" size="sm" className="w-full" disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Availability"}
                    </Button>
                  </form>
                )}

                {selectedDate && selectedSlot && (
                  <div className="space-y-3">
                    {editMode ? (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Spots total</Label>
                          <Input
                            type="number" min={1}
                            value={editSpots}
                            onChange={e => setEditSpots(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Price override</Label>
                          <Input
                            type="number" min={0} step="0.01"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            placeholder="Blank = default price"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 gap-1" onClick={handleEditSave} disabled={isSaving}>
                            <Check className="h-3.5 w-3.5" /> Save
                          </Button>
                          <Button size="sm" variant="ghost" className="flex-1 gap-1" onClick={() => setEditMode(false)}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Spots total</span>
                          <span className="font-medium">{selectedSlot.spots_total}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Remaining</span>
                          <span className="font-medium">{selectedSlot.spots_remaining}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price</span>
                          <span className="font-medium">
                            {selectedSlot.price_override != null
                              ? fmt.format(selectedSlot.price_override)
                              : activeListing ? fmt.format(activeListing.price) : "—"}
                            {selectedSlot.price_override != null && (
                              <Badge variant="secondary" className="ml-1.5 text-[10px] py-0">override</Badge>
                            )}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Block date</span>
                          <Switch
                            checked={selectedSlot.blocked}
                            onCheckedChange={() => toggleBlock(selectedSlot)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm" variant="outline" className="flex-1 gap-1"
                            onClick={() => {
                              setEditMode(true);
                              setEditSpots(String(selectedSlot.spots_total));
                              setEditPrice(selectedSlot.price_override != null ? String(selectedSlot.price_override) : "");
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 gap-1 text-destructive hover:text-destructive"
                            onClick={() => removeSlot(selectedSlot.id)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming slots */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Upcoming Slots</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-72 overflow-y-auto divide-y">
                  {myAvailability
                    .filter(s => !isBefore(new Date(s.date + "T00:00:00"), today))
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(slot => (
                      <button
                        key={slot.id}
                        type="button"
                        className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => { setSelectedDate(slot.date); setEditMode(false); setViewMonth(startOfMonth(new Date(slot.date + "T00:00:00"))); }}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(slot.date + "T00:00:00"), "MMM d, yyyy")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {slot.blocked
                              ? "Blocked"
                              : `${slot.spots_remaining}/${slot.spots_total} spots${slot.price_override != null ? ` · ${fmt.format(slot.price_override)}` : ""}`}
                          </p>
                        </div>
                        {slot.blocked ? (
                          <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                        ) : slot.spots_remaining === 0 ? (
                          <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">Full</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">Open</Badge>
                        )}
                      </button>
                    ))}
                  {myAvailability.filter(s => !isBefore(new Date(s.date + "T00:00:00"), today)).length === 0 && (
                    <p className="px-5 py-4 text-sm text-muted-foreground">No upcoming slots.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Clear Range Dialog ───────────────────────────────────────────── */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Clear Availability Range
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              All availability slots (including price overrides and blocked dates) in the
              selected range will be permanently deleted. Existing bookings are not affected.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={clearStart} onChange={e => setClearStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End date</Label>
                <Input type="date" value={clearEnd} onChange={e => setClearEnd(e.target.value)} min={clearStart} />
              </div>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleClearRange}
              disabled={isSaving || !clearStart || !clearEnd}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete All Slots in Range
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BulkRangeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        activeListing={activeListing}
        isSaving={isSaving}
        bulkStart={bulkStart}
        bulkEnd={bulkEnd}
        bulkDows={bulkDows}
        bulkSpots={bulkSpots}
        bulkPrice={bulkPrice}
        bulkBlocked={bulkBlocked}
        setBulkStart={setBulkStart}
        setBulkEnd={setBulkEnd}
        setBulkDows={setBulkDows}
        setBulkSpots={setBulkSpots}
        setBulkPrice={setBulkPrice}
        setBulkBlocked={setBulkBlocked}
        onApply={handleBulkApply}
      />

      <SeasonalPricingDialog
        open={seasonOpen}
        onOpenChange={setSeasonOpen}
        activeListing={activeListing}
        isSaving={isSaving}
        viewMonth={viewMonth}
        seasonStart={seasonStart}
        seasonEnd={seasonEnd}
        seasonDows={seasonDows}
        seasonMode={seasonMode}
        seasonValue={seasonValue}
        seasonSpots={seasonSpots}
        setSeasonStart={setSeasonStart}
        setSeasonEnd={setSeasonEnd}
        setSeasonDows={setSeasonDows}
        setSeasonMode={setSeasonMode}
        setSeasonValue={setSeasonValue}
        setSeasonSpots={setSeasonSpots}
        onApply={handleSeasonApply}
      />
    </AgencyLayout>
  );
}
