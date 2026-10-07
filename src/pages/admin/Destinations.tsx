import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { useDestinations, type Destination } from "@/hooks/useDestinations";

const emptyForm = { name: "", district: "", province: "", region: "", active: true };

export default function AdminDestinations() {
  const queryClient = useQueryClient();
  const { data: destinations = [], isLoading } = useDestinations({ activeOnly: false });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["destinations"] });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (d: Destination) => {
    setEditing(d);
    setForm({ name: d.name, district: d.district, province: d.province, region: d.region ?? "", active: d.active });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.district.trim() || !form.province.trim()) {
      toast.error("Name, district, and province are required.");
      return;
    }
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      district: form.district.trim(),
      province: form.province.trim(),
      region: form.region.trim() || null,
      active: form.active,
    };
    const { error } = editing
      ? await supabase.from("destinations").update(payload).eq("id", editing.id)
      : await supabase.from("destinations").insert({ ...payload, sort_order: destinations.length });
    setIsSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAdminAction(editing ? "update_destination" : "create_destination", "destination", editing?.id, payload, editing as unknown as Record<string, unknown> | undefined);
    toast.success(editing ? "Destination updated." : "Destination created.");
    setOpen(false);
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("destinations").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Could not delete — listings still use this destination. Deactivate it instead.");
      setDeleteTarget(null);
      return;
    }
    await logAdminAction("delete_destination", "destination", deleteTarget.id, undefined, deleteTarget as unknown as Record<string, unknown>);
    toast.success("Destination deleted.");
    setDeleteTarget(null);
    invalidate();
  };

  const toggleActive = async (d: Destination) => {
    const { error } = await supabase.from("destinations").update({ active: !d.active }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    await logAdminAction("update_destination", "destination", d.id, { active: !d.active }, { active: d.active });
    invalidate();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = destinations[index + direction];
    const current = destinations[index];
    if (!target) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("destinations").update({ sort_order: target.sort_order }).eq("id", current.id),
      supabase.from("destinations").update({ sort_order: current.sort_order }).eq("id", target.id),
    ]);
    if (e1 || e2) { toast.error("Could not reorder."); return; }
    invalidate();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Destinations</h1>
            <p className="text-muted-foreground">
              Manage the locations travelers filter by and agencies choose when listing.
              Deactivating a destination hides it from new listings and traveler filters —
              existing listings in it keep displaying.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> New Destination
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : destinations.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No destinations yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Province</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {destinations.map((d, i) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === destinations.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.district}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.province}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.region ?? "—"}</TableCell>
                      <TableCell>
                        <Switch checked={d.active} onCheckedChange={() => toggleActive(d)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Destination" : "New Destination"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Pokhara" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>District</Label>
                <Input value={form.district} onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Province</Label>
                <Input value={form.province} onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Region label <span className="text-xs text-muted-foreground">(optional, shown to travelers)</span></Label>
              <Input value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This only succeeds if no listing currently uses this destination. If any do, deactivate
            it instead — that hides it from new listings while existing ones keep displaying.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
