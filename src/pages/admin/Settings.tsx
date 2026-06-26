import { useEffect, useState } from "react";
import { Settings, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
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

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated successfully");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
  };

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button onClick={handleChangePassword} disabled={pwLoading} className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {pwLoading ? "Updating…" : "Update Password"}
            </Button>
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
