import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Loader2, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { useCategories, type Category } from "@/hooks/useCategories";

const emptyForm = {
  slug: "", name: "", description: "", icon: "🌍",
  is_multi_day_default: false,
  default_confirmation_mode: "instant" as "instant" | "agency_confirm",
  active: true,
};

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading } = useCategories({ activeOnly: false });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["categories"] });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({
      slug: c.slug, name: c.name, description: c.description, icon: c.icon,
      is_multi_day_default: c.is_multi_day_default,
      default_confirmation_mode: c.default_confirmation_mode,
      active: c.active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.slug.trim() || !form.name.trim()) { toast.error("Slug and name are required."); return; }
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      icon: form.icon.trim() || "🌍",
      is_multi_day_default: form.is_multi_day_default,
      default_confirmation_mode: form.default_confirmation_mode,
      active: form.active,
    };
    const { error } = editing
      ? await supabase.from("categories").update(payload).eq("slug", editing.slug)
      : await supabase.from("categories").insert({ ...payload, slug: form.slug.trim(), sort_order: categories.length });
    setIsSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAdminAction(editing ? "update_category" : "create_category", "category", form.slug, payload, editing as unknown as Record<string, unknown> | undefined);
    toast.success(editing ? "Category updated." : "Category created.");
    setOpen(false);
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("categories").delete().eq("slug", deleteTarget.slug);
    if (error) {
      toast.error("Could not delete — listings still use this category. Deactivate it instead.");
      setDeleteTarget(null);
      return;
    }
    await logAdminAction("delete_category", "category", deleteTarget.slug, undefined, deleteTarget as unknown as Record<string, unknown>);
    toast.success("Category deleted.");
    setDeleteTarget(null);
    invalidate();
  };

  const toggleActive = async (c: Category) => {
    const { error } = await supabase.from("categories").update({ active: !c.active }).eq("slug", c.slug);
    if (error) { toast.error(error.message); return; }
    await logAdminAction("update_category", "category", c.slug, { active: !c.active }, { active: c.active });
    invalidate();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = categories[index + direction];
    const current = categories[index];
    if (!target) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("categories").update({ sort_order: target.sort_order }).eq("slug", current.slug),
      supabase.from("categories").update({ sort_order: current.sort_order }).eq("slug", target.slug),
    ]);
    if (e1 || e2) { toast.error("Could not reorder."); return; }
    invalidate();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Categories</h1>
            <p className="text-muted-foreground">
              Manage the activity categories travelers filter by and agencies choose when listing.
              Deactivating a category hides it from new listings and traveler filters — existing
              listings in it keep displaying.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> New Category
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No categories yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Order</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Default mode</TableHead>
                    <TableHead>Multi-day</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c, i) => (
                    <TableRow key={c.slug}>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === categories.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="mr-1.5">{c.icon}</span>
                        <span className="font-medium">{c.name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{c.slug}</TableCell>
                      <TableCell className="text-sm capitalize">{c.default_confirmation_mode.replace("_", " ")}</TableCell>
                      <TableCell className="text-sm">{c.is_multi_day_default ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)}>
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
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Input value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} maxLength={4} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Slug {editing && <span className="text-xs text-muted-foreground">(cannot be changed once listings use it)</span>}</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                disabled={!!editing}
                placeholder="e.g. Trekking"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Default confirmation mode</Label>
              <Select
                value={form.default_confirmation_mode}
                onValueChange={(v: "instant" | "agency_confirm") => setForm((p) => ({ ...p, default_confirmation_mode: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Instant</SelectItem>
                  <SelectItem value="agency_confirm">Agency confirms</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Multi-day by default</Label>
              <Switch checked={form.is_multi_day_default} onCheckedChange={(v) => setForm((p) => ({ ...p, is_multi_day_default: v }))} />
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
            This only succeeds if no listing currently uses this category. If any do, deactivate it
            instead — that hides it from new listings while existing ones keep displaying.
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
