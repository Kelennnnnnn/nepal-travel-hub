import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, Upload, Eye, EyeOff, ExternalLink, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

export default function AgencySettings() {
  const { user } = useAuthStore();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Agency profile state
  const [agencyName, setAgencyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [about, setAbout] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Bank / payout state
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingSwift, setRoutingSwift] = useState("");
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  // Notification state — keys match DB columns
  type NotifKey = "new_booking" | "booking_cancel" | "payout" | "review";
  const [notifications, setNotifications] = useState<Record<NotifKey, boolean>>({
    new_booking: true,
    booking_cancel: true,
    payout: true,
    review: true,
  });
  const [notifSaving, setNotifSaving] = useState<NotifKey | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Stripe Connect state
  const [stripeAccountId, setStripeAccountId] = useState("");
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // Load all data on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled || !authUser) return;

      // Load agency profile from agency_applications
      const { data: appData } = await supabase
        .from("agency_applications")
        .select("company_name, registration_number, email, phone, address, description, logo_url, stripe_account_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!cancelled && appData) {
        setAgencyName(appData.company_name ?? "");
        setLicenseNumber(appData.registration_number ?? "");
        setEmail(appData.email ?? "");
        setPhone(appData.phone ?? "");
        setAddress(appData.address ?? "");
        setAbout(appData.description ?? "");
        if (appData.logo_url) setLogoPreview(appData.logo_url);
        setStripeAccountId(appData.stripe_account_id ?? "");
      }

      // Load bank details + notification prefs in parallel
      const [bankResult, prefsResult] = await Promise.all([
        supabase
          .from("agency_bank_details")
          .select("account_holder_name, bank_name, account_number_encrypted, routing_swift")
          .eq("agency_user_id", authUser.id)
          .maybeSingle(),
        supabase
          .from("notification_preferences")
          .select("new_booking, booking_cancel, payout, review")
          .eq("user_id", authUser.id)
          .maybeSingle(),
      ]);

      if (!cancelled && bankResult.data) {
        setAccountHolder(bankResult.data.account_holder_name ?? "");
        setBankName(bankResult.data.bank_name ?? "");
        setAccountNumber(bankResult.data.account_number_encrypted ?? "");
        setRoutingSwift(bankResult.data.routing_swift ?? "");
      }

      if (!cancelled && prefsResult.data) {
        setNotifications({
          new_booking:    prefsResult.data.new_booking    ?? true,
          booking_cancel: prefsResult.data.booking_cancel ?? true,
          payout:         prefsResult.data.payout         ?? true,
          review:         prefsResult.data.review         ?? true,
        });
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // Handle Stripe redirect params (?stripe=success|refresh)
  useEffect(() => {
    const stripeParam = searchParams.get("stripe");
    if (stripeParam === "success") {
      toast.success("Stripe account connected! Your payouts are now enabled.");
      setSearchParams({}, { replace: true });
      // Re-fetch stripe_account_id to confirm it's stored
      supabase.auth.getUser().then(({ data: { user: u } }) => {
        if (!u) return;
        supabase
          .from("agency_applications")
          .select("stripe_account_id")
          .eq("user_id", u.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.stripe_account_id) setStripeAccountId(data.stripe_account_id);
          });
      });
    } else if (stripeParam === "refresh") {
      toast.info("Stripe onboarding session expired. Please try connecting again.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleNotificationToggle = async (key: NotifKey, checked: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: checked }));
    setNotifSaving(key);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: authUser.id, [key]: checked, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) toast.error("Failed to save notification preference.");
    } finally {
      setNotifSaving(null);
    }
  };

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {});
      if (error) { toast.error(error.message || "Failed to start Stripe onboarding"); return; }
      const { url } = data as { url: string };
      if (!url) { toast.error("No redirect URL returned"); return; }
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message ?? "Something went wrong");
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setLogoPreview(ev.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!agencyName.trim()) {
      toast.error("Agency name is required.");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required.");
      return;
    }
    setIsLoading(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      toast.error("Not authenticated.");
      setIsLoading(false);
      return;
    }

    // Upload logo to storage if a new file was selected
    let savedLogoUrl: string | undefined;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop() ?? "jpg";
      const path = `${authUser.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("agency-logos")
        .upload(path, logoFile, { upsert: true });
      if (uploadError) {
        toast.error(`Logo upload failed: ${uploadError.message}`);
        setIsLoading(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from("agency-logos")
        .getPublicUrl(path);
      savedLogoUrl = publicUrl;
      setLogoFile(null);
    }

    // Sync agency_name to auth user_metadata
    await supabase.auth.updateUser({ data: { agency_name: agencyName.trim() } });

    // Update agency profile in agency_applications
    const { error: profileError } = await supabase
      .from("agency_applications")
      .update({
        company_name: agencyName.trim(),
        registration_number: licenseNumber.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        description: about.trim(),
        ...(savedLogoUrl !== undefined ? { logo_url: savedLogoUrl } : {}),
      })
      .eq("user_id", authUser.id);

    if (profileError) {
      toast.error(profileError.message);
      setIsLoading(false);
      return;
    }

    // Upsert bank details
    if (accountHolder.trim() || bankName.trim() || accountNumber.trim() || routingSwift.trim()) {
      const { error: bankError } = await supabase
        .from("agency_bank_details")
        .upsert({
          agency_user_id: authUser.id,
          account_holder_name: accountHolder.trim(),
          bank_name: bankName.trim(),
          account_number_encrypted: accountNumber.trim(),
          routing_swift: routingSwift.trim(),
        }, { onConflict: "agency_user_id" });

      if (bankError) {
        toast.error(bankError.message);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(false);
    toast.success("Settings saved successfully.");
  };

  const initials = agencyName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const notificationItems: { id: NotifKey; label: string; desc: string }[] = [
    { id: "new_booking",    label: "New booking received",  desc: "Get notified when a customer books your activity" },
    { id: "booking_cancel", label: "Booking cancellation",  desc: "Alert when a booking is cancelled" },
    { id: "payout",         label: "Payout processed",      desc: "Confirmation when payouts are completed" },
    { id: "review",         label: "New review",            desc: "When a customer leaves a review" },
  ];

  return (
    <AgencyLayout title="Settings">
      <div className="max-w-2xl space-y-6">

        {/* Agency Profile */}
        <Card>
          <CardHeader><CardTitle className="text-base">Agency Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  : initials || "—"}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => logoInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload Logo
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agency Name</Label>
                <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>License Number</Label>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>About</Label>
              <Textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Bank Account / Payout Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Bank Account / Payout Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account holder name</Label>
                <Input
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Legal name on the account"
                />
              </div>
              <div className="space-y-2">
                <Label>Bank name</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Nepal Investment Bank"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account number</Label>
              <div className="flex gap-2">
                {showAccountNumber ? (
                  <Input
                    className="flex-1"
                    type="text"
                    autoComplete="off"
                    placeholder="Account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                ) : (
                  <Input
                    className="flex-1 cursor-default font-mono tracking-widest"
                    type="text"
                    readOnly
                    value={accountNumber ? `••••••${accountNumber.slice(-4)}` : ""}
                    placeholder="Account number"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showAccountNumber ? "Hide account number" : "Show account number"}
                  onClick={() => setShowAccountNumber((v) => !v)}
                >
                  {showAccountNumber ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Routing / SWIFT code</Label>
              <Input
                value={routingSwift}
                onChange={(e) => setRoutingSwift(e.target.value)}
                placeholder="Routing or SWIFT/BIC"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stripe Connect */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            {stripeAccountId ? (
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-green-700 dark:text-green-400">Stripe Connected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Account: <span className="font-mono">{stripeAccountId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You're set up to receive payouts. The platform admin processes transfers to your account.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-2"
                    onClick={handleConnectStripe}
                    disabled={isConnectingStripe}
                  >
                    {isConnectingStripe
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <ExternalLink className="h-4 w-4" />}
                    Update Stripe Account
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Connect your Stripe account</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect Stripe to receive payouts directly to your bank account. You'll be redirected to
                    Stripe's secure onboarding flow — it takes about 5 minutes.
                  </p>
                  <Button
                    className="mt-4 gap-2"
                    onClick={handleConnectStripe}
                    disabled={isConnectingStripe}
                  >
                    {isConnectingStripe
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="h-4 w-4" /> Connect Stripe</>}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {notificationItems.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {notifSaving === n.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={notifications[n.id]}
                      disabled={notifSaving === n.id}
                      onCheckedChange={(checked) => handleNotificationToggle(n.id, checked)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading} className="gap-2">
            <Save className="h-4 w-4" />
            {isLoading ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </AgencyLayout>
  );
}
