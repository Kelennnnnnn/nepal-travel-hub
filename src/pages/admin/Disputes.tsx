import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ShieldAlert, Loader2, Receipt, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/currency";

interface DisputeRow {
  id: string;
  booking_id: string;
  kind: string;
  statement: string;
  status: string;
  resolution: string | null;
  created_at: string;
  booking: { booking_ref: string; listing: { title: string } | null; agency: { display_name: string } | null } | null;
}

interface RefundRow {
  id: string;
  booking_id: string;
  kind: string;
  payer_side: string;
  amount: number;
  currency: string;
  reason_code: string;
  status: string;
  due_by: string | null;
  created_at: string;
  booking: { booking_ref: string } | null;
}

interface PenaltyRow {
  id: string;
  agency_id: string;
  booking_id: string | null;
  kind: string;
  amount: number;
  created_at: string;
  agency: { display_name: string } | null;
}

const RESOLUTION_OPTIONS = [
  { value: "uphold_no_show", label: "Uphold — no fault found" },
  { value: "traveler_was_present_agency_failed", label: "Agency failed (full refund + strike + penalty)" },
  { value: "partial", label: "Partial refund (admin-chosen %)" },
];

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DisputesQueue() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [target, setTarget] = useState<DisputeRow | null>(null);
  const [resolution, setResolution] = useState("uphold_no_show");
  const [feeRefundPercent, setFeeRefundPercent] = useState("50");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = () => {
    setIsLoading(true);
    supabase
      .from("booking_disputes")
      .select("id, booking_id, kind, statement, status, resolution, created_at, booking:bookings(booking_ref, listing:listings(title), agency:agencies(display_name))")
      .order("status", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (!error) setDisputes((data ?? []) as unknown as DisputeRow[]);
        setIsLoading(false);
      });
  };

  useEffect(load, []);

  const openTarget = (d: DisputeRow) => {
    setTarget(d);
    setResolution("uphold_no_show");
    setFeeRefundPercent("50");
    setNote("");
  };

  const handleResolve = async () => {
    if (!target) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc("admin_resolve_dispute", {
        p_dispute_id: target.id,
        p_resolution: resolution,
        p_fee_refund_percent: resolution === "partial" ? Number(feeRefundPercent) : null,
        p_note: note || null,
      });
      if (error) throw error;
      toast.success("Dispute resolved.");
      setTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve the dispute.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (disputes.length === 0) return <div className="text-center py-16 text-muted-foreground"><ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No disputes</p></div>;

  return (
    <>
      <div className="space-y-3">
        {disputes.map((d) => {
          const ageHours = Math.round((Date.now() - new Date(d.created_at).getTime()) / 3_600_000);
          return (
            <Card key={d.id} className={d.status === "open" ? "border-destructive/30" : ""}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={d.status === "open" ? "destructive" : "secondary"}>{d.status === "open" ? "Open" : "Resolved"}</Badge>
                    <Badge variant="outline">{d.kind === "no_show" ? "Traveler disputing no-show" : "Agency no-show report"}</Badge>
                    {d.status === "open" && <span className="text-xs text-muted-foreground">{ageHours}h old</span>}
                  </div>
                  <p className="font-medium">{d.booking?.listing?.title ?? "—"} <span className="text-muted-foreground text-sm font-normal">· {d.booking?.booking_ref}</span></p>
                  <p className="text-xs text-muted-foreground mb-1.5">{d.booking?.agency?.display_name ?? "—"}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{d.statement}</p>
                  {d.resolution && <p className="text-xs text-success mt-1">Resolved: {d.resolution.replace(/_/g, " ")}</p>}
                </div>
                {d.status === "open" && <Button size="sm" onClick={() => openTarget(d)}>Resolve</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve dispute</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{target?.statement}</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {resolution === "partial" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Fee refund percent (applied to fee and balance)</Label>
                <Input type="number" min={0} max={100} value={feeRefundPercent} onChange={(e) => setFeeRefundPercent(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={isSubmitting}>Back</Button>
            <Button onClick={handleResolve} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const REFUND_STATUS_OPTIONS = ["all", "pending_provider", "processing", "succeeded", "failed", "agency_owed", "settled_by_agency", "offset_from_deposit"];
const PAYER_SIDE_OPTIONS = ["all", "platform", "agency"];

function RefundRecordsList() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");

  useEffect(() => {
    supabase
      .from("refund_records")
      .select("id, booking_id, kind, payer_side, amount, currency, reason_code, status, due_by, created_at, booking:bookings(booking_ref)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (!error) setRefunds((data ?? []) as unknown as RefundRow[]);
        setIsLoading(false);
      });
  }, []);

  const filtered = useMemo(
    () => refunds.filter((r) => (statusFilter === "all" || r.status === statusFilter) && (payerFilter === "all" || r.payer_side === payerFilter)),
    [refunds, statusFilter, payerFilter]
  );

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="w-56">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REFUND_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Payer</Label>
          <Select value={payerFilter} onValueChange={setPayerFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYER_SIDE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All payers" : s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No refund records</p></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.booking?.booking_ref ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize">{r.kind.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-sm capitalize">{r.payer_side}</TableCell>
                <TableCell className="font-medium">{formatPrice(r.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.reason_code.replace(/_/g, " ")}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.status.replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.due_by ? formatDateTime(r.due_by) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AgencyPenaltiesList() {
  const [penalties, setPenalties] = useState<PenaltyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("agency_penalties")
      .select("id, agency_id, booking_id, kind, amount, created_at, agency:agencies(display_name)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (!error) setPenalties((data ?? []) as unknown as PenaltyRow[]);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (penalties.length === 0) return <div className="text-center py-16 text-muted-foreground"><AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No penalties</p></div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agency</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {penalties.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.agency?.display_name ?? "—"}</TableCell>
            <TableCell className="text-sm capitalize">{p.kind.replace(/_/g, " ")}</TableCell>
            <TableCell className="font-medium">{formatPrice(p.amount)}</TableCell>
            <TableCell><Badge variant="outline">Open — to recover from deposit</Badge></TableCell>
            <TableCell className="text-xs text-muted-foreground">{formatDateTime(p.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AdminDisputes() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Disputes & Refunds</h1>
          <p className="text-muted-foreground">No-show disputes, refund decisions, and agency penalties</p>
        </div>

        <Tabs defaultValue="disputes">
          <TabsList>
            <TabsTrigger value="disputes">Disputes</TabsTrigger>
            <TabsTrigger value="refunds">Refund Records</TabsTrigger>
            <TabsTrigger value="penalties">Agency Penalties</TabsTrigger>
          </TabsList>
          <TabsContent value="disputes" className="mt-4"><DisputesQueue /></TabsContent>
          <TabsContent value="refunds" className="mt-4"><RefundRecordsList /></TabsContent>
          <TabsContent value="penalties" className="mt-4"><AgencyPenaltiesList /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
