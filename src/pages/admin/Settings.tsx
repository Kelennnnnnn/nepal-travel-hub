import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Settings as SettingsIcon, Lock, Eye, EyeOff, ShieldCheck, Mail, SlidersHorizontal,
  DollarSign, PartyPopper, Loader2, Lock as LockIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
import { logAdminAction } from "@/lib/audit";
import { invokeEdge } from "@/lib/edge";
import { useAuthStore } from "@/stores/authStore";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-policy";
import { toast } from "sonner";

interface SettingRow {
  key: string;
  value: unknown;
  value_type: "number" | "boolean" | "string" | "json";
  min_value: number | null;
  max_value: number | null;
  sensitivity: "normal" | "financial";
}

type SettingsMap = Record<string, SettingRow>;

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function AdminSettings() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");

  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);

  // Section-local editable state, initialized from `settings` once loaded.
  const [platform, setPlatform] = useState({ platform_name: "", site_url: "" });
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [contact, setContact] = useState({ support_email: "", legal_email: "", privacy_email: "", support_phone: "", support_hours: "" });
  const [bookingRules, setBookingRules] = useState({
    inventory_hold_ttl_minutes: "", max_holds_per_traveler: "",
    agency_confirm_window_hours: "", agency_confirm_reminder_hours: "", auto_complete_after_hours: "",
  });
  const [fees, setFees] = useState({
    reservation_fee_percent: "", fee_free_cancel_hours_day: "",
    fee_free_cancel_hours_multiday: "", no_show_dispute_hours: "",
  });

  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [feeConfirmOpen, setFeeConfirmOpen] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("key, value, value_type, min_value, max_value, sensitivity")
      .then(({ data }) => {
        const map: SettingsMap = {};
        for (const row of data ?? []) map[row.key] = row as unknown as SettingRow;
        setSettings(map);

        const str = (k: string, fallback = "") => (map[k]?.value as string | null | undefined) ?? fallback;
        const num = (k: string, fallback = "") => (map[k] ? String(map[k].value) : fallback);

        setPlatform({ platform_name: str("platform_name"), site_url: str("site_url") });
        setMaintenanceMode(map.maintenance_mode?.value === true);
        setContact({
          support_email: str("support_email"), legal_email: str("legal_email"),
          privacy_email: str("privacy_email"), support_phone: str("support_phone", ""),
          support_hours: str("support_hours"),
        });
        setBookingRules({
          inventory_hold_ttl_minutes: num("inventory_hold_ttl_minutes"),
          max_holds_per_traveler: num("max_holds_per_traveler"),
          agency_confirm_window_hours: num("agency_confirm_window_hours"),
          agency_confirm_reminder_hours: num("agency_confirm_reminder_hours"),
          auto_complete_after_hours: num("auto_complete_after_hours"),
        });
        setFees({
          reservation_fee_percent: num("reservation_fee_percent"),
          fee_free_cancel_hours_day: num("fee_free_cancel_hours_day"),
          fee_free_cancel_hours_multiday: num("fee_free_cancel_hours_multiday"),
          no_show_dispute_hours: num("no_show_dispute_hours"),
        });
        setLoading(false);
      });
  }, []);

  /** Updates every changed key in `next` relative to `settings`, logging one audit entry per key. Returns false (and toasts the error) on the first failure. */
  const saveKeys = async (next: Record<string, string | number | boolean | null>): Promise<boolean> => {
    for (const [key, rawValue] of Object.entries(next)) {
      const existing = settings[key];
      if (!existing) continue;
      const value = existing.value_type === "number" ? Number(rawValue) : rawValue;
      if (JSON.stringify(value) === JSON.stringify(existing.value)) continue;
      const { error } = await supabase.from("platform_settings").update({ value }).eq("key", key);
      if (error) { toast.error(error.message); return false; }
      await logAdminAction("update_setting", "settings", key, { value }, { value: existing.value });
      setSettings((s) => ({ ...s, [key]: { ...existing, value } }));
    }
    return true;
  };

  const savePlatform = async () => {
    setSavingSection("platform");
    const ok = await saveKeys({ platform_name: platform.platform_name, site_url: platform.site_url });
    setSavingSection(null);
    if (ok) toast.success("Platform settings updated.");
  };

  const toggleMaintenanceMode = async (v: boolean) => {
    const old = maintenanceMode;
    setMaintenanceMode(v);
    const ok = await saveKeys({ maintenance_mode: v });
    if (!ok) setMaintenanceMode(old);
  };

  const saveContact = async () => {
    setSavingSection("contact");
    const ok = await saveKeys({
      support_email: contact.support_email,
      legal_email: contact.legal_email,
      privacy_email: contact.privacy_email,
      support_phone: contact.support_phone.trim() || null,
      support_hours: contact.support_hours,
    });
    setSavingSection(null);
    if (ok) toast.success("Contact settings updated.");
  };

  const saveBookingRules = async () => {
    setSavingSection("booking_rules");
    const ok = await saveKeys(bookingRules);
    setSavingSection(null);
    if (ok) toast.success("Booking rules updated.");
  };

  const feeChanges = Object.entries(fees)
    .filter(([key, value]) => settings[key] && String(settings[key].value) !== String(value))
    .map(([key, value]) => ({ key, label: FEE_LABELS[key] ?? key, before: settings[key].value, after: value }));

  const confirmSaveFees = async () => {
    setFeeConfirmOpen(false);
    setSavingSection("fees");
    const ok = await saveKeys(fees);
    setSavingSection(null);
    if (ok) toast.success("Fee & cancellation settings updated — new bookings only.");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (!currentPassword) { toast.error("Enter your current password"); return; }

    setPwLoading(true);
    const { data, error: verifyError } = await invokeEdge<{ valid: boolean }>("verify-password", {
      body: { password: currentPassword },
    });
    if (verifyError || !data?.valid) {
      setPwLoading(false);
      toast.error("Current password is incorrect");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPwLoading(false); toast.error(error.message); return; }

    // Leaves this session's own tokens untouched (scope: "others") — only
    // every OTHER session for this account is signed out.
    await supabase.auth.signOut({ scope: "others" });
    setPwLoading(false);
    toast.success("Password updated. Other sessions have been signed out.");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
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
            <Row label="Maintenance Mode" desc="Freezes the entire platform and shows a maintenance banner to visitors.">
              <Switch checked={maintenanceMode} onCheckedChange={toggleMaintenanceMode} />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" /> Platform
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Platform name</Label>
                <Input value={platform.platform_name} onChange={(e) => setPlatform((p) => ({ ...p, platform_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Site URL</Label>
                <Input value={platform.site_url} onChange={(e) => setPlatform((p) => ({ ...p, site_url: e.target.value }))} />
              </div>
            </div>
            <Button onClick={savePlatform} disabled={savingSection === "platform"}>
              {savingSection === "platform" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Support email</Label>
                <Input value={contact.support_email} onChange={(e) => setContact((p) => ({ ...p, support_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Legal email</Label>
                <Input value={contact.legal_email} onChange={(e) => setContact((p) => ({ ...p, legal_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Privacy email</Label>
                <Input value={contact.privacy_email} onChange={(e) => setContact((p) => ({ ...p, privacy_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Support phone <span className="text-xs text-muted-foreground">(leave blank to hide it on the Contact page)</span></Label>
                <Input value={contact.support_phone} onChange={(e) => setContact((p) => ({ ...p, support_phone: e.target.value }))} placeholder="+977 1-4123456" />
              </div>
              <div className="space-y-1.5">
                <Label>Support hours</Label>
                <Input value={contact.support_hours} onChange={(e) => setContact((p) => ({ ...p, support_hours: e.target.value }))} placeholder="Sun–Fri, 9am–6pm NPT" />
              </div>
            </div>
            <Button onClick={saveContact} disabled={savingSection === "contact"}>
              {savingSection === "contact" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" /> Booking Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Inventory hold TTL (minutes)" settingKey="inventory_hold_ttl_minutes"
                value={bookingRules.inventory_hold_ttl_minutes} settings={settings}
                onChange={(v) => setBookingRules((p) => ({ ...p, inventory_hold_ttl_minutes: v }))}
              />
              <NumberField
                label="Max concurrent holds per traveler" settingKey="max_holds_per_traveler"
                value={bookingRules.max_holds_per_traveler} settings={settings}
                onChange={(v) => setBookingRules((p) => ({ ...p, max_holds_per_traveler: v }))}
              />
              <NumberField
                label="Agency confirmation window (hours)" settingKey="agency_confirm_window_hours"
                value={bookingRules.agency_confirm_window_hours} settings={settings}
                onChange={(v) => setBookingRules((p) => ({ ...p, agency_confirm_window_hours: v }))}
              />
              <NumberField
                label="Agency confirmation reminder (hours before deadline)" settingKey="agency_confirm_reminder_hours"
                value={bookingRules.agency_confirm_reminder_hours} settings={settings}
                onChange={(v) => setBookingRules((p) => ({ ...p, agency_confirm_reminder_hours: v }))}
              />
              <NumberField
                label="Auto-complete after trip end (hours)" settingKey="auto_complete_after_hours"
                value={bookingRules.auto_complete_after_hours} settings={settings}
                onChange={(v) => setBookingRules((p) => ({ ...p, auto_complete_after_hours: v }))}
              />
            </div>
            <Button onClick={saveBookingRules} disabled={savingSection === "booking_rules"}>
              {savingSection === "booking_rules" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card className={isSuperAdmin ? "border-primary/30" : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Fees &amp; Cancellation
              {!isSuperAdmin && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1 ml-2">
                  <LockIcon className="h-3 w-3" /> Super admin only
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Changes here apply to new holds/quotes only — bookings already in progress keep the
              fee and cancellation terms they were quoted at.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Reservation fee (%)" settingKey="reservation_fee_percent"
                value={fees.reservation_fee_percent} settings={settings} disabled={!isSuperAdmin}
                onChange={(v) => setFees((p) => ({ ...p, reservation_fee_percent: v }))}
              />
              <NumberField
                label="Free cancellation window — single-day (hours)" settingKey="fee_free_cancel_hours_day"
                value={fees.fee_free_cancel_hours_day} settings={settings} disabled={!isSuperAdmin}
                onChange={(v) => setFees((p) => ({ ...p, fee_free_cancel_hours_day: v }))}
              />
              <NumberField
                label="Free cancellation window — multi-day (hours)" settingKey="fee_free_cancel_hours_multiday"
                value={fees.fee_free_cancel_hours_multiday} settings={settings} disabled={!isSuperAdmin}
                onChange={(v) => setFees((p) => ({ ...p, fee_free_cancel_hours_multiday: v }))}
              />
              <NumberField
                label="No-show dispute window (hours)" settingKey="no_show_dispute_hours"
                value={fees.no_show_dispute_hours} settings={settings} disabled={!isSuperAdmin}
                onChange={(v) => setFees((p) => ({ ...p, no_show_dispute_hours: v }))}
              />
            </div>
            {isSuperAdmin && (
              <Button onClick={() => setFeeConfirmOpen(true)} disabled={savingSection === "fees" || feeChanges.length === 0}>
                {savingSection === "fees" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-primary" /> Festival Presets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Manage recurring blackout-date presets (Dashain, Tihar, etc.) applied to agency availability.
            </p>
            <Button variant="outline" asChild>
              <Link to="/admin/blackout-presets">Open Festival Presets</Link>
            </Button>
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
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
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

      <AlertDialog open={feeConfirmOpen} onOpenChange={setFeeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply fee &amp; cancellation changes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This only affects new holds/quotes created from now on — bookings already in progress keep the terms they were quoted at.</p>
                <ul className="space-y-1 text-sm">
                  {feeChanges.map((c) => (
                    <li key={c.key} className="flex justify-between gap-4">
                      <span className="text-foreground">{c.label}</span>
                      <span className="font-mono">{String(c.before)} → <span className="font-semibold text-foreground">{String(c.after)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveFees}>Apply changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

const FEE_LABELS: Record<string, string> = {
  reservation_fee_percent: "Reservation fee (%)",
  fee_free_cancel_hours_day: "Free cancellation — single-day (hours)",
  fee_free_cancel_hours_multiday: "Free cancellation — multi-day (hours)",
  no_show_dispute_hours: "No-show dispute window (hours)",
};

function NumberField({
  label, settingKey, value, settings, onChange, disabled,
}: {
  label: string;
  settingKey: string;
  value: string;
  settings: SettingsMap;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const bounds = settings[settingKey];
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {bounds && bounds.min_value != null && bounds.max_value != null && (
          <span className="text-xs text-muted-foreground"> ({bounds.min_value}–{bounds.max_value})</span>
        )}
      </Label>
      <Input
        type="number"
        min={bounds?.min_value ?? undefined}
        max={bounds?.max_value ?? undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
