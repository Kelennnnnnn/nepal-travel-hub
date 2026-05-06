import { useState, useRef, useEffect } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, Upload, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

export default function AgencySettings() {
  const { user } = useAuthStore();
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  // Notification state
  const [notifications, setNotifications] = useState({
    "new-booking": true,
    "booking-cancel": true,
    payout: true,
    review: true,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Load all data on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled || !authUser) return;

      // Load agency profile from agency_applications
      const { data: appData } = await supabase
        .from("agency_applications")
        .select("company_name, registration_number, email, phone, address, description")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!cancelled && appData) {
        setAgencyName(appData.company_name ?? "");
        setLicenseNumber(appData.registration_number ?? "");
        setEmail(appData.email ?? "");
        setPhone(appData.phone ?? "");
        setAddress(appData.address ?? "");
        setAbout(appData.description ?? "");
      }

      // Load bank details
      const { data: bankData } = await supabase
        .from("agency_bank_details")
        .select("account_holder_name, bank_name, account_number_encrypted, routing_swift")
        .eq("agency_user_id", authUser.id)
        .maybeSingle();

      if (!cancelled && bankData) {
        setAccountHolder(bankData.account_holder_name ?? "");
        setBankName(bankData.bank_name ?? "");
        setAccountNumber(bankData.account_number_encrypted ?? "");
        setRoutingSwift(bankData.routing_swift ?? "");
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const notificationItems = [
    { id: "new-booking" as const, label: "New booking received", desc: "Get notified when a customer books your activity" },
    { id: "booking-cancel" as const, label: "Booking cancellation", desc: "Alert when a booking is cancelled" },
    { id: "payout" as const, label: "Payout processed", desc: "Confirmation when payouts are completed" },
    { id: "review" as const, label: "New review", desc: "When a customer leaves a review" },
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

        {/* Notifications */}
        <Card>
          <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {notificationItems.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch
                    checked={notifications[n.id]}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, [n.id]: checked }))
                    }
                  />
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
