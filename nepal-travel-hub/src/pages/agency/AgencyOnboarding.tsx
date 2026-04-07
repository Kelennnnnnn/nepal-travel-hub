import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  FileText,
  User,
  Upload,
  ChevronRight,
  ChevronLeft,
  Check,
  Mountain,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Layout } from "@/components/layout/Layout";
import { useAgencyStore } from "@/stores/agencyStore";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

const STEPS = [
  { id: 1, title: "Company Details", icon: Building2 },
  { id: 2, title: "Owner / Contact", icon: User },
  { id: 3, title: "Documents", icon: FileText },
  { id: 4, title: "Review & Submit", icon: Check },
];

export default function AgencyOnboarding() {
  const navigate = useNavigate();
  const { submitApplication } = useAgencyStore();
  const authUser = useAuthStore((s) => s.user);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    companyName: authUser?.agencyName ?? "",
    registrationNumber: "",
    panNumber: "",
    address: "",
    city: "",
    district: "",
    phone: "",
    email: authUser?.email ?? "",
    website: "",
    ownerName: authUser?.name ?? "",
    ownerPhone: "",
    description: "",
    licenseFile: "",
    panFile: "",
    insuranceFile: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canProceed = () => {
    if (step === 1) {
      return (
        form.companyName &&
        form.registrationNumber &&
        form.panNumber &&
        form.address &&
        form.city &&
        form.district &&
        form.phone &&
        form.email
      );
    }
    if (step === 2) {
      return form.ownerName && form.ownerPhone && form.description;
    }
    if (step === 3) {
      return form.licenseFile && form.panFile;
    }
    return true;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const { error } = await submitApplication(form);
    setIsSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(
      "Application submitted! We'll review your details within 2-3 business days."
    );
    navigate("/agency/onboarding/status");
  };

  return (
    <Layout>
      <div className="pt-24 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Mountain className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">
                Nepal<span className="text-primary">Trails</span>
              </span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Partner Registration</h1>
            <p className="text-muted-foreground">
              Complete the form below to register your agency on NepalTrails
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-10 px-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      step > s.id
                        ? "bg-primary text-primary-foreground"
                        : step === s.id
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.id ? <Check className="h-5 w-5" /> : s.id}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground hidden sm:block">
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 rounded ${
                      step > s.id ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <Card variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const StepIcon = STEPS[step - 1].icon;
                  return <StepIcon className="h-5 w-5 text-primary" />;
                })()}
                {STEPS[step - 1].title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {step === 1 && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Company Name *</Label>
                      <Input
                        placeholder="e.g. Himalayan Expeditions Pvt. Ltd."
                        value={form.companyName}
                        onChange={(e) => update("companyName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Registration Number *</Label>
                      <Input
                        placeholder="Company registration number"
                        value={form.registrationNumber}
                        onChange={(e) =>
                          update("registrationNumber", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>PAN Number *</Label>
                      <Input
                        placeholder="PAN / VAT number"
                        value={form.panNumber}
                        onChange={(e) => update("panNumber", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        placeholder="+977-1-XXXXXXX"
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Business Address *</Label>
                    <Input
                      placeholder="Street address"
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>City *</Label>
                      <Input
                        placeholder="e.g. Kathmandu"
                        value={form.city}
                        onChange={(e) => update("city", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>District *</Label>
                      <Input
                        placeholder="e.g. Kathmandu"
                        value={form.district}
                        onChange={(e) => update("district", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        placeholder="company@example.com"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input
                        placeholder="https://..."
                        value={form.website}
                        onChange={(e) => update("website", e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Owner / Authorized Person Name *</Label>
                      <Input
                        placeholder="Full name"
                        value={form.ownerName}
                        onChange={(e) => update("ownerName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Contact Phone *</Label>
                      <Input
                        placeholder="+977-98XXXXXXXX"
                        value={form.ownerPhone}
                        onChange={(e) => update("ownerPhone", e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>About Your Agency *</Label>
                    <Textarea
                      placeholder="Tell us about your agency, your experience, specializations, and the types of activities you offer..."
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      rows={5}
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {form.description.length}/2000
                    </p>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Upload the following documents for verification. Accepted
                    formats: PDF, JPG, PNG (max 5MB).
                  </p>
                  <div className="space-y-4">
                    {[
                      {
                        key: "licenseFile",
                        label: "Tourism License *",
                        desc: "Issued by Ministry of Tourism or NTB",
                      },
                      {
                        key: "panFile",
                        label: "PAN / VAT Certificate *",
                        desc: "Inland Revenue Department certificate",
                      },
                      {
                        key: "insuranceFile",
                        label: "Insurance Certificate",
                        desc: "Business liability insurance (recommended)",
                      },
                    ].map((doc) => (
                      <div
                        key={doc.key}
                        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer hover:border-primary/50 ${
                          form[doc.key as keyof typeof form]
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                        onClick={() => {
                          // Simulate file selection
                          update(
                            doc.key,
                            `${doc.label.replace(" *", "")}.pdf`
                          );
                          toast.success(
                            `${doc.label.replace(" *", "")} uploaded`
                          );
                        }}
                      >
                        {form[doc.key as keyof typeof form] ? (
                          <div className="flex items-center justify-center gap-2 text-primary">
                            <Check className="h-5 w-5" />
                            <span className="font-medium">
                              {form[doc.key as keyof typeof form]}
                            </span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="font-medium">{doc.label}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {doc.desc}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="space-y-6">
                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Company Details
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Company:
                          </span>{" "}
                          {form.companyName}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reg No:</span>{" "}
                          {form.registrationNumber}
                        </div>
                        <div>
                          <span className="text-muted-foreground">PAN:</span>{" "}
                          {form.panNumber}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          {form.phone}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email:</span>{" "}
                          {form.email}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Address:
                          </span>{" "}
                          {form.address}, {form.city}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Contact Person
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name:</span>{" "}
                          {form.ownerName}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          {form.ownerPhone}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Documents
                      </h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          Tourism License: {form.licenseFile || "Not uploaded"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          PAN Certificate: {form.panFile || "Not uploaded"}
                        </div>
                        <div className="flex items-center gap-2">
                          {form.insuranceFile ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground inline-block" />
                          )}
                          Insurance:{" "}
                          {form.insuranceFile || "Not uploaded (optional)"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                      <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">Verification Process</p>
                        <p className="text-muted-foreground mt-1">
                          Our team will review your application within 2-3
                          business days. You'll receive an email notification
                          once your account is verified and ready to use.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-6 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={step === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>

                {step < 4 ? (
                  <Button
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!canProceed()}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit Application
                        <Check className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
