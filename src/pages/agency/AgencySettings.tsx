import { useState, useRef } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

export default function AgencySettings() {
  const { user } = useAuthStore();
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Agency profile state
  const [agencyName, setAgencyName] = useState(user?.agencyName ?? "Himalayan Expeditions");
  const [licenseNumber, setLicenseNumber] = useState("NTB-2024-1234");
  const [email, setEmail] = useState(user?.email ?? "info@himalayanexp.com");
  const [phone, setPhone] = useState("+977 1-4444567");
  const [address, setAddress] = useState("Thamel, Kathmandu, Nepal");
  const [about, setAbout] = useState("Leading adventure travel company in Nepal since 2010. We specialize in high-altitude trekking and cultural expeditions.");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Payout state
  const [bankName, setBankName] = useState("Nepal Rastra Bank");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("Himalayan Expeditions Pvt Ltd");
  const [swiftCode, setSwiftCode] = useState("NRBINPKA");

  // Notification state
  const [notifications, setNotifications] = useState({
    "new-booking": true,
    "booking-cancel": true,
    payout: true,
    review: true,
  });

  const [isLoading, setIsLoading] = useState(false);

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
    if (!agencyName.trim()) { toast.error("Agency name is required."); return; }
    if (!email.trim()) { toast.error("Email is required."); return; }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
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
                  : initials}
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

        {/* Payout Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">Payout Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  type="password"
                  placeholder="Enter account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Holder</Label>
                <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SWIFT Code</Label>
                <Input value={swiftCode} onChange={(e) => setSwiftCode(e.target.value)} />
              </div>
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
