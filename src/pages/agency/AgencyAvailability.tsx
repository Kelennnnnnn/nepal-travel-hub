import { useEffect, useMemo, useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Pencil, Trash2, Ban, PlayCircle, PauseCircle, CalendarOff, Tag } from "lucide-react";
import { toast } from "sonner";
import { useListingsStore } from "@/stores/listingsStore";
import { useDeparturesStore, availableCapacity, type Departure, type DepartureStatus } from "@/stores/departuresStore";

const SEASON_TEMPLATES = [
  { label: "Autumn Peak (Oct – Nov)", start: "10-01", end: "11-30", mult: 1.5 },
  { label: "Spring Peak (Mar – May)", start: "03-01", end: "05-31", mult: 1.4 },
  { label: "Winter (Dec – Feb)", start: "12-01", end: "02-28", mult: 1.2 },
  { label: "Monsoon Off-Peak (Jun – Aug)", start: "06-01", end: "08-31", mult: 0.8 },
];

const statusBadge: Record<DepartureStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-primary/10 text-primary" },
  closed: { label: "Closed", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const currentYear = new Date().getFullYear();

export default function AgencyAvailability() {
  const { myListings, fetchMyListings } = useListingsStore();
  const {
    departures, seasonalPricing, blackoutDates, isLoading,
    fetchDepartures, createDeparture, setCapacity, setDepartureStatus, deleteDeparture,
    fetchSeasonalPricing, addSeasonalPricing, deleteSeasonalPricing,
    fetchBlackoutDates, addBlackoutDate, deleteBlackoutDate,
  } = useDeparturesStore();

  const [selectedListing, setSelectedListing] = useState("");
  const activeListing = useMemo(() => myListings.find((l) => l.id === selectedListing), [myListings, selectedListing]);

  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [editCapacityFor, setEditCapacityFor] = useState<Departure | null>(null);
  const [editCapacityValue, setEditCapacityValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Departure | null>(null);

  const [blackoutDate, setBlackoutDate] = useState("");
  const [blackoutReason, setBlackoutReason] = useState("");

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonName, setSeasonName] = useState("");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [seasonPrice, setSeasonPrice] = useState("");

  useEffect(() => {
    if (myListings.length === 0) fetchMyListings();
  }, [fetchMyListings, myListings.length]);

  useEffect(() => {
    if (!selectedListing && myListings.length > 0) setSelectedListing(myListings[0].id);
  }, [myListings, selectedListing]);

  useEffect(() => {
    if (!selectedListing) return;
    fetchDepartures(selectedListing);
    fetchSeasonalPricing(selectedListing);
    fetchBlackoutDates(selectedListing);
  }, [selectedListing, fetchDepartures, fetchSeasonalPricing, fetchBlackoutDates]);

  useEffect(() => {
    setNewCapacity(String(activeListing?.max_participants ?? ""));
  }, [activeListing]);

  const handleAddDeparture = async () => {
    if (!activeListing || !newDate) return;
    const capacity = Number(newCapacity);
    if (!capacity || capacity < 1) { toast.error("Enter a valid capacity."); return; }
    setIsSaving(true);
    const { data, error } = await createDeparture(activeListing.id, activeListing.agency_id, newDate);
    if (error || !data) {
      toast.error(error ?? "Failed to create departure.");
      setIsSaving(false);
      return;
    }
    const { error: capError } = await setCapacity(data.id, capacity);
    setIsSaving(false);
    if (capError) { toast.error(capError); return; }
    toast.success("Departure added.");
    setAddOpen(false);
    setNewDate("");
  };

  const openEditCapacity = (d: Departure) => {
    setEditCapacityFor(d);
    setEditCapacityValue(String(d.inventory?.capacity_total ?? activeListing?.max_participants ?? ""));
  };

  const handleSaveCapacity = async () => {
    if (!editCapacityFor) return;
    const capacity = Number(editCapacityValue);
    if (!capacity || capacity < 0) { toast.error("Enter a valid capacity."); return; }
    setIsSaving(true);
    const { error } = await setCapacity(editCapacityFor.id, capacity);
    setIsSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Capacity updated.");
    setEditCapacityFor(null);
  };

  const handleStatusChange = async (d: Departure, status: DepartureStatus) => {
    const { error } = await setDepartureStatus(d.id, status);
    if (error) toast.error(error);
    else toast.success(`Departure ${status === "cancelled" ? "cancelled" : status === "closed" ? "closed" : "reopened"}.`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteDeparture(deleteTarget.id);
    setDeleteTarget(null);
    if (error) toast.error(error);
    else toast.success("Departure removed.");
  };

  const handleAddBlackout = async () => {
    if (!selectedListing || !blackoutDate) return;
    const { error } = await addBlackoutDate(selectedListing, blackoutDate, blackoutReason);
    if (error) { toast.error(error); return; }
    toast.success("Blackout date added.");
    setBlackoutDate("");
    setBlackoutReason("");
  };

  const applyTemplate = (tpl: (typeof SEASON_TEMPLATES)[number]) => {
    setSeasonName(tpl.label);
    setSeasonStart(`${currentYear}-${tpl.start}`);
    setSeasonEnd(`${currentYear}-${tpl.end}`);
    if (activeListing) setSeasonPrice(String(Math.round(Number(activeListing.base_price) * tpl.mult)));
  };

  const handleAddSeason = async () => {
    if (!selectedListing || !seasonName || !seasonStart || !seasonEnd || !seasonPrice) {
      toast.error("Fill in all fields.");
      return;
    }
    setIsSaving(true);
    const { error } = await addSeasonalPricing({
      listing_id: selectedListing,
      season_name: seasonName,
      start_date: seasonStart,
      end_date: seasonEnd,
      price: Number(seasonPrice),
    });
    setIsSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Seasonal price added.");
    setSeasonOpen(false);
    setSeasonName(""); setSeasonStart(""); setSeasonEnd(""); setSeasonPrice("");
  };

  return (
    <AgencyLayout title="Availability">
      <div className="space-y-6">
        <div className="w-64">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Activity</Label>
          <Select value={selectedListing} onValueChange={setSelectedListing}>
            <SelectTrigger><SelectValue placeholder="Select a listing" /></SelectTrigger>
            <SelectContent>
              {myListings.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!activeListing ? (
          <div className="text-center py-16 text-muted-foreground">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "Create a listing first to manage its departures."}
          </div>
        ) : (
          <>
            {/* Departures */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Departures</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Departure
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
                ) : departures.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No departures scheduled yet. Add one so travelers can book a real date.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departures.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{formatDate(d.departure_date)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {d.inventory ? `${d.inventory.capacity_total} total (${d.inventory.capacity_held} held, ${d.inventory.capacity_confirmed} confirmed)` : "Not set"}
                          </TableCell>
                          <TableCell className="font-medium">{availableCapacity(d.inventory)}</TableCell>
                          <TableCell><Badge className={statusBadge[d.status].className}>{statusBadge[d.status].label}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="Edit capacity" onClick={() => openEditCapacity(d)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {d.status === "scheduled" && (
                                <Button variant="ghost" size="icon" title="Close (stop new bookings)" onClick={() => handleStatusChange(d, "closed")}>
                                  <PauseCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {d.status === "closed" && (
                                <Button variant="ghost" size="icon" title="Reopen" onClick={() => handleStatusChange(d, "scheduled")}>
                                  <PlayCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {d.status !== "cancelled" && (
                                <Button variant="ghost" size="icon" title="Cancel departure" onClick={() => handleStatusChange(d, "cancelled")}>
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                              {!d.inventory || (d.inventory.capacity_held === 0 && d.inventory.capacity_confirmed === 0) ? (
                                <Button variant="ghost" size="icon" className="text-destructive" title="Delete" onClick={() => setDeleteTarget(d)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Blackout dates */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarOff className="h-4 w-4 text-primary" /> Blackout Dates</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={blackoutDate} onChange={(e) => setBlackoutDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[180px]">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} placeholder="e.g. Public holiday" />
                  </div>
                  <Button onClick={handleAddBlackout} disabled={!blackoutDate}>Add</Button>
                </div>
                {blackoutDates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {blackoutDates.map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
                        {formatDate(b.blackout_date)}{b.reason ? ` — ${b.reason}` : ""}
                        <button onClick={() => deleteBlackoutDate(b.id)} className="text-muted-foreground hover:text-destructive">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seasonal pricing */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Seasonal Pricing</CardTitle>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setSeasonOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Season
                </Button>
              </CardHeader>
              <CardContent>
                {seasonalPricing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No seasonal pricing rules yet — the base price applies year-round.</p>
                ) : (
                  <div className="space-y-2">
                    {seasonalPricing.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/40">
                        <span>{s.season_name} <span className="text-muted-foreground">({formatDate(s.start_date)} – {formatDate(s.end_date)})</span></span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">${Number(s.price).toLocaleString()}</span>
                          <button onClick={() => deleteSeasonalPricing(s.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Note: which price actually applies to a given departure (base vs. seasonal, when ranges overlap) is resolved at quote time — not shown live here yet.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Add departure dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Departure</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" min={1} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDeparture} disabled={isSaving || !newDate}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit capacity dialog */}
      <Dialog open={!!editCapacityFor} onOpenChange={(open) => !open && setEditCapacityFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Capacity — {editCapacityFor && formatDate(editCapacityFor.departure_date)}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Total capacity</Label>
            <Input type="number" min={0} value={editCapacityValue} onChange={(e) => setEditCapacityValue(e.target.value)} />
            {editCapacityFor?.inventory && (editCapacityFor.inventory.capacity_held > 0 || editCapacityFor.inventory.capacity_confirmed > 0) && (
              <p className="text-xs text-muted-foreground">
                Cannot go below {editCapacityFor.inventory.capacity_held + editCapacityFor.inventory.capacity_confirmed} (already held/confirmed).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCapacityFor(null)}>Cancel</Button>
            <Button onClick={handleSaveCapacity} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add season dialog */}
      <Dialog open={seasonOpen} onOpenChange={setSeasonOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Seasonal Price</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {SEASON_TEMPLATES.map((tpl) => (
                <button key={tpl.label} type="button" onClick={() => applyTemplate(tpl)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground">
                  {tpl.label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Season name</Label>
              <Input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="e.g. Autumn Peak" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} min={seasonStart} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Price per person ($)</Label>
              <Input type="number" min={0} step="0.01" value={seasonPrice} onChange={(e) => setSeasonPrice(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSeason} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this departure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && formatDate(deleteTarget.departure_date)} will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AgencyLayout>
  );
}
