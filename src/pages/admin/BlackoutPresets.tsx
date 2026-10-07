import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { useBookingRulesStore, type BlackoutPreset } from "@/stores/bookingRulesStore";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const emptyForm = {
  name: "", start_date: "", end_date: "", year: new Date().getFullYear(), description: "", active: true,
};

export default function AdminBlackoutPresets() {
  const adminId = useAuthStore((s) => s.user?.id);
  const { allPresets, isLoading, fetchAllPresets, createPreset, updatePreset, deletePreset } = useBookingRulesStore();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlackoutPreset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlackoutPreset | null>(null);

  useEffect(() => { fetchAllPresets(); }, [fetchAllPresets]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: BlackoutPreset) => {
    setEditing(p);
    setForm({
      name: p.name, start_date: p.start_date, end_date: p.end_date,
      year: p.year, description: p.description ?? "", active: p.active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error("Name, start date, and end date are required.");
      return;
    }
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      year: Number(form.year),
      description: form.description.trim() || null,
      active: form.active,
      created_by: adminId ?? null,
    };
    const { error } = editing ? await updatePreset(editing.id, payload) : await createPreset(payload);
    setIsSaving(false);
    if (error) { toast.error(error); return; }
    toast.success(editing ? "Preset updated." : "Preset created.");
    setOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deletePreset(deleteTarget.id);
    setDeleteTarget(null);
    if (error) { toast.error(error); return; }
    toast.success("Preset deleted.");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PartyPopper className="h-6 w-6 text-primary" /> Festival Blackout Presets
            </h1>
            <p className="text-muted-foreground">
              Festival dates change every year — manage them here rather than hardcoding them. Agencies apply a preset to their own calendar from Availability &amp; Booking Rules.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Preset</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">All Presets</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : allPresets.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No presets yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPresets.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.year}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.start_date)} – {formatDate(p.end_date)}</TableCell>
                      <TableCell>
                        <Badge className={p.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                          {p.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Preset" : "New Preset"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Dashain" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Active</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this preset?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.name} will be permanently removed. Agencies that already applied it keep their existing blackout periods.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
