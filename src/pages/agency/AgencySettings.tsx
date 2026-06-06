import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save, Upload, Eye, EyeOff,
  CheckCircle2, Loader2, AlertCircle, Lock, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { useAgencyStore } from "@/stores/agencyStore";
import { supabase } from "@/lib/supabase";
import { NotificationsCard, type NotifKey } from "@/components/agency/NotificationsCard";
import { StripeConnectCard } from "@/components/agency/StripeConnectCard";

export default function AgencySettings() {
  const { user } = useAuthStore();
  const { application, fetchMyApplication } = useAgencyStore();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Read-only regulatory fields ───────────────────────────────────
  const [panNumber, setPanNumber]                   = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [licenseUploaded, setLicenseUploaded]       = useState(false);

  // ── Editable profile fields ───────────────────────────────────────
  const [companyName, setCompanyName]   = useState("");
  const [ownerName, setOwnerName]       = useState("");
  const [ownerPhone, setOwnerPhone]     = useState("");
  const [email, setEmail]               = useState("");
  const [phone, setPhone]               = useState("");
  const [website, setWebsite]           = useState("");
  const [city, setCity]                 = useState("");
  const [district, setDistrict]         = useState("");
  const [address, setAddress]           = useState("");
  const [about, setAbout]               = useState("");
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [logoFile, setLogoFile]         = useState<File | null>(null);

  // ── Bank / payout ─────────────────────────────────────────────────
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName]           = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingSwift, setRoutingSwift]   = useState("");
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  // ── Notifications ─────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Record<NotifKey, boolean>>({
    new_booking: true, booking_cancel: true, payout: true, review: true,
  });
  const [notifSaving, setNotifSaving] = useState<NotifKey | null>(null);

  // ── Stripe ────────────────────────────────────────────────────────
  const [stripeAccountId, setStripeAccountId]     = useState("");
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // ── Save state ────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);

  // ── Populate form from store's application (confirmed working query path) ──

  useEffect(() => {
    if (!application) return;
    const d = application;
    // Read-only regulatory
    setPanNumber(d.pan_number ?? "");
    setRegistrationNumber(d.registration_number ?? "");
    setLicenseUploaded(!!d.license_url);
    // Editable profile
    setCompanyName(d.company_name ?? "");
    setOwnerName(d.owner_name ?? "");
    setOwnerPhone(d.owner_phone ?? "");
    setEmail(d.email ?? "");
    setPhone(d.phone ?? "");
    setWebsite(d.website ?? "");
    setCity(d.city ?? "");
    setDistrict(d.district ?? "");
    setAddress(d.address ?? "");
    setAbout(d.description ?? "");
    if (d.logo_url) setLogoPreview(d.logo_url);
    setStripeAccountId(d.stripe_account_id ?? "");
  }, [application]);

  // ── Load on mount: refresh store + fetch bank/notification rows ───

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setProfileLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled || !authUser) return;

      // Refresh the application in the store (uses select("*"), proven to work)
      await fetchMyApplication();

      const [bankResult, prefsResult] = await Promise.all([
        supabase
          .from("agency_bank_details")
          .select("account_holder_name, bank_name, routing_swift")
          .eq("agency_user_id", authUser.id)
          .maybeSingle(),
        supabase
          .from("notification_preferences")
          .select("new_booking, booking_cancel, payout, review")
          .eq("user_id", authUser.id)
          .maybeSingle(),
      ]);

      if (!cancelled && bankResult.data) {
        const b = bankResult.data;
        setAccountHolder(b.account_holder_name ?? "");
        setBankName(b.bank_name ?? "");
        // Account number is stored encrypted in Vault — never loaded back to client
        setAccountNumber("");
        setRoutingSwift(b.routing_swift ?? "");
      }

      if (!cancelled && prefsResult.data) {
        const p = prefsResult.data;
        setNotifications({
          new_booking:    p.new_booking    ?? true,
          booking_cancel: p.booking_cancel ?? true,
          payout:         p.payout         ?? true,
          review:         p.review         ?? true,
        });
      }

      if (!cancelled) setProfileLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [fetchMyApplication]);

  // ── Stripe redirect params ─────────────────────────────────────────

  useEffect(() => {
    const param = searchParams.get("stripe");
    if (param === "success") {
      toast.success("Stripe account connected! Your payouts are now enabled.");
      setSearchParams({}, { replace: true });
      supabase.auth.getUser().then(({ data: { user: u } }) => {
        if (!u) return;
        supabase
          .from("agency_applications")
          .select("stripe_account_id")
          .eq("user_id", u.id)
          .maybeSingle()
          .then(({ data }) => { if (data?.stripe_account_id) setStripeAccountId(data.stripe_account_id); });
      });
    } else if (param === "refresh") {
      toast.info("Stripe onboarding session expired. Please try connecting again.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ── Notification toggle ───────────────────────────────────────────

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

  // ── Stripe connect ────────────────────────────────────────────────

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

  // ── Logo upload ───────────────────────────────────────────────────

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => { if (ev.target?.result) setLogoPreview(ev.target.result as string); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Save ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!companyName.trim()) { toast.error("Agency name is required."); return; }
    if (!email.trim()) { toast.error("Email is required."); return; }
    setIsLoading(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { toast.error("Not authenticated."); setIsLoading(false); return; }

    // Upload logo if changed
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
      const { data: { publicUrl } } = supabase.storage.from("agency-logos").getPublicUrl(path);
      savedLogoUrl = publicUrl;
      setLogoFile(null);
    }

    // Sync company name to auth metadata
    await supabase.auth.updateUser({ data: { agency_name: companyName.trim() } });

    // Update only editable fields — never touch pan_number, registration_number, license_url
    const { error: profileError } = await supabase
      .from("agency_applications")
      .update({
        company_name: companyName.trim(),
        owner_name:   ownerName.trim(),
        owner_phone:  ownerPhone.trim(),
        email:        email.trim(),
        phone:        phone.trim(),
        website:      website.trim(),
        city:         city.trim(),
        district:     district.trim(),
        address:      address.trim(),
        description:  about.trim(),
        ...(savedLogoUrl !== undefined ? { logo_url: savedLogoUrl } : {}),
      })
      .eq("user_id", authUser.id);

    if (profileError) { toast.error(profileError.message); setIsLoading(false); return; }

    // Upsert bank details
    if (accountHolder.trim() || bankName.trim() || accountNumber.trim() || routingSwift.trim()) {
      const { error: bankError } = await supabase
        .from("agency_bank_details")
        .upsert({
          agency_user_id:      authUser.id,
          account_holder_name: accountHolder.trim(),
          bank_name:           bankName.trim(),
          routing_swift:       routingSwift.trim(),
        }, { onConflict: "agency_user_id" });

      if (bankError) { toast.error(bankError.message); setIsLoading(false); return; }

      // Store account number via Vault RPC — never written as plaintext
      if (accountNumber.trim()) {
        const { error: vaultError } = await supabase.rpc("set_bank_account", {
          p_agency_id: authUser.id,
          p_account_number: accountNumber.trim(),
        });
        if (vaultError) { toast.error(vaultError.message); setIsLoading(false); return; }
        setAccountNumber(""); // clear field — vault-only from here
      }
    }

    setIsLoading(false);
    toast.success("Settings saved successfully.");
  };

  // ── Helpers ───────────────────────────────────────────────────────

  const initials = companyName
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || user?.name?.slice(0, 2).toUpperCase() || "AG";

  // ── Render ────────────────────────────────────────────────────────

  return (
    <AgencyLayout title="Settings">
      <div className="max-w-2xl space-y-6">

        {/* ── Verified Business Information (read-only) ─────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Verified Business Information</CardTitle>
              <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                <ShieldCheck className="h-3 w-3" />
                Locked
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              These details were verified during your onboarding and cannot be changed. Contact support if a correction is needed.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3 w-3" /> PAN Number
                  </Label>
                  <Input
                    value={panNumber}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-default font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3 w-3" /> Registration Number
                  </Label>
                  <Input
                    value={registrationNumber}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-default font-mono"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3 w-3" /> Tourism License
                  </Label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted">
                    {licenseUploaded ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">Document on file</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">Not uploaded</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Agency Profile (editable) ─────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agency Profile</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Update your contact details and public profile.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden flex-shrink-0">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  : (profileLoading ? <Skeleton className="h-16 w-16" /> : (initials || "AG"))}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => logoInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload Logo
              </Button>
            </div>

            {profileLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Row 1: Company name + owner name */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Agency Name</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your agency name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Owner / Contact Name</Label>
                    <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Full name" />
                  </div>
                </div>

                {/* Row 2: Email + phone */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Agency Email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@youragency.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Agency Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977 ..." />
                  </div>
                </div>

                {/* Row 3: Owner phone + website */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Owner Phone</Label>
                    <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="+977 ..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://youragency.com" />
                  </div>
                </div>

                {/* Row 4: City + district */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kathmandu" />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Bagmati" />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
                </div>

                {/* About */}
                <div className="space-y-2">
                  <Label>About Your Agency</Label>
                  <Textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tell travelers about your experience, specialties, and what makes your agency unique..." />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Bank Account / Payout Details ──────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Bank Account / Payout Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account holder name</Label>
                <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Legal name on the account" />
              </div>
              <div className="space-y-2">
                <Label>Bank name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Nepal Investment Bank" />
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
                  aria-label={showAccountNumber ? "Hide" : "Show"}
                  onClick={() => setShowAccountNumber((v) => !v)}
                >
                  {showAccountNumber ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Routing / SWIFT code</Label>
              <Input value={routingSwift} onChange={(e) => setRoutingSwift(e.target.value)} placeholder="Routing or SWIFT/BIC" />
            </div>
          </CardContent>
        </Card>

        <StripeConnectCard
          stripeAccountId={stripeAccountId}
          isConnecting={isConnectingStripe}
          onConnect={handleConnectStripe}
        />

        <NotificationsCard
          notifications={notifications}
          notifSaving={notifSaving}
          onToggle={handleNotificationToggle}
        />

        <div className="flex justify-end pb-6">
          <Button onClick={handleSave} disabled={isLoading || profileLoading} className="gap-2">
            <Save className="h-4 w-4" />
            {isLoading ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </AgencyLayout>
  );
}
