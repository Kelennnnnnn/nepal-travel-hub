import { useState, useEffect } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ComingSoon } from "@/components/ComingSoon";
import { Eye, EyeOff, Lock, ShieldCheck, Building2, Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { NotificationsCard, type NotifKey } from "@/components/agency/NotificationsCard";
import { AgencyTeamCard } from "@/components/agency/AgencyTeamCard";
import { useAgencyStore } from "@/stores/agencyStore";

// The "Verified Business Information" / "Agency Profile" / "Bank Account" /
// "Payout Provider" sections that used to live here all queried the old
// flat `agency_applications` table (company_name, pan_number, license_url,
// payout_account_id, ...) and `agency_bank_details` — neither exists in the
// current schema (agencies/agency_verification/agency_documents, Phase 4;
// bank details never had a Phase 4 replacement at all). Rather than leave
// them silently broken (every field blank, Save failing), they're replaced
// with a single "coming soon" panel below. Agency profile self-editing is a
// real, separate feature to design (agencyStore currently only supports
// the onboarding draft/submit flow, not post-approval edits) — not
// something to invent under a payment-removal cleanup.
//
// Notifications and password change are genuinely independent of any of
// this (notification_preferences and auth.users are unaffected) and are
// kept working as before, with one fix: the "review" toggle was reading/
// writing a `review` column that has never existed — the real column is
// `new_review` (see supabase/migrations/20260916000014_notifications.sql).
export default function AgencySettings() {
  const [profileLoading, setProfileLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Record<NotifKey, boolean>>({
    new_booking: true, booking_cancel: true, payout: true, review: true,
  });
  const [notifSaving, setNotifSaving] = useState<NotifKey | null>(null);

  const { myAgency, fetchMyApplication } = useAgencyStore();
  useEffect(() => { void fetchMyApplication(); }, [fetchMyApplication]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled || !authUser) { setProfileLoading(false); return; }
      setCurrentUserId(authUser.id);

      const { data } = await supabase
        .from("notification_preferences")
        .select("new_booking, booking_cancel, payout, new_review")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!cancelled && data) {
        setNotifications({
          new_booking: data.new_booking ?? true,
          booking_cancel: data.booking_cancel ?? true,
          payout: data.payout ?? true,
          review: data.new_review ?? true,
        });
      }
      if (!cancelled) setProfileLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleNotificationToggle = async (key: NotifKey, checked: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: checked }));
    setNotifSaving(key);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const column = key === "review" ? "new_review" : key;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: authUser.id, [column]: checked, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) toast.error("Failed to save notification preference.");
    } finally {
      setNotifSaving(null);
    }
  };

  return (
    <AgencyLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        <ComingSoon
          icon={Building2}
          title="Agency profile editing is coming soon"
          description="Updating your agency profile, documents, and payout account is being rebuilt. Contact support if you need a change made in the meantime."
        />

        {myAgency && currentUserId && (
          <AgencyTeamCard agencyId={myAgency.id} currentUserId={currentUserId} />
        )}

        {myAgency && <AgencyAlertsCard agencyId={myAgency.id} />}

        {!profileLoading && (
          <NotificationsCard
            notifications={notifications}
            notifSaving={notifSaving}
            onToggle={handleNotificationToggle}
          />
        )}

        <ChangePasswordCard />
      </div>
    </AgencyLayout>
  );
}

function AgencyAlertsCard({ agencyId }: { agencyId: string }) {
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("agencies")
      .select("alert_phone_e164, alert_whatsapp_opt_in, alert_sms_opt_in")
      .eq("id", agencyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setPhone(data.alert_phone_e164 ?? "");
          setWhatsappOptIn(data.alert_whatsapp_opt_in ?? false);
          setSmsOptIn(data.alert_sms_opt_in ?? false);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [agencyId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("agencies")
      .update({
        alert_phone_e164: phone.trim() || null,
        alert_whatsapp_opt_in: whatsappOptIn,
        alert_sms_opt_in: smsOptIn,
      })
      .eq("id", agencyId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alert preferences saved.");
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Booking Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-sm">
        <div className="space-y-2">
          <Label>Alert phone number</Label>
          <Input
            placeholder="+9779800000000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Include the country code, e.g. +977 for Nepal.</p>
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal">WhatsApp alerts</Label>
          <Switch checked={whatsappOptIn} onCheckedChange={setWhatsappOptIn} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal">SMS alerts</Label>
          <Switch checked={smsOptIn} onCheckedChange={setSmsOptIn} />
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving…" : "Save Alert Preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirm) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated successfully");
    setNewPassword(""); setConfirm("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          Change Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input
              type={show ? "text" : "password"}
              placeholder="Repeat new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            {saving ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
