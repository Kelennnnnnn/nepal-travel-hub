import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { toast } from "sonner";

export default function AdminSettings() {
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [payoutsEnabled, setPayoutsEnabled] = useState(true);
  const [commissionRate, setCommissionRate] = useState("10");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("platform_settings").select("key, value").then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      setPaymentsEnabled(m.payments_enabled !== false);
      setMaintenanceMode(m.maintenance_mode === true);
      setPayoutsEnabled(m.payouts_enabled !== false);
      setCommissionRate(String(m.commission_rate ?? 10));
      setLoading(false);
    });
  }, []);

  const save = async (key: string, value: unknown) => {
    const { error } = await supabase
      .from("platform_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) { toast.error(error.message); return; }
    await logAdminAction("update_setting", "settings", key, { value });
    toast.success("Setting updated");
  };

  if (loading) return <AdminLayout><p className="p-6">Loading…</p></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Platform configuration &amp; emergency controls</p>
        </div>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Emergency Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Row label="Maintenance Mode" desc="Freezes the entire platform. Blocks all new bookings and payments.">
              <Switch
                checked={maintenanceMode}
                onCheckedChange={(v) => { setMaintenanceMode(v); save("maintenance_mode", v); }}
              />
            </Row>
            <Row label="Payments Enabled" desc="Master switch for new charges. Turn off to stop all new bookings instantly.">
              <Switch
                checked={paymentsEnabled}
                onCheckedChange={(v) => { setPaymentsEnabled(v); save("payments_enabled", v); }}
              />
            </Row>
            <Row label="Payouts Enabled" desc="Master switch for agency payouts.">
              <Switch
                checked={payoutsEnabled}
                onCheckedChange={(v) => { setPayoutsEnabled(v); save("payouts_enabled", v); }}
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Platform Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Commission Rate (%)</Label>
              <div className="flex gap-2">
                <Input
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="max-w-32"
                />
                <Button onClick={() => save("commission_rate", Number(commissionRate))}>Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Single source of truth. Applied to all new bookings server-side.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
