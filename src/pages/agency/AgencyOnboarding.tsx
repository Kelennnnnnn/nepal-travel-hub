import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useAgencyStore } from "@/stores/agencyStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { onboardingSchema, type OnboardingFormData } from "@/lib/validations";

const STEPS = [
  { id: 1, title: "Company Details", icon: Building2 },
  { id: 2, title: "Owner / Contact", icon: User },
  { id: 3, title: "Documents", icon: FileText },
  { id: 4, title: "Review & Submit", icon: Check },
];

const STEP_FIELDS: Record<number, (keyof OnboardingFormData)[]> = {
  1: ["companyName", "registrationNumber", "panNumber", "address", "city", "district", "phone", "email"],
  2: ["ownerName", "ownerPhone", "description"],
};

export default function AgencyOnboarding() {
  const navigate = useNavigate();
  const { submitApplication } = useAgencyStore();
  const authUser = useAuthStore((s) => s.user);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [website, setWebsite] = useState("");
  const [files, setFiles] = useState({ licenseFile: "", panFile: "", insuranceFile: "" });
  const [uploading, setUploading] = useState({ licenseFile: false, panFile: false, insuranceFile: false });

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      companyName: authUser?.agencyName ?? "",
      email: authUser?.email ?? "",
      ownerName: authUser?.name ?? "",
      registrationNumber: "",
      panNumber: "",
      address: "",
      city: "",
      district: "",
      phone: "",
      ownerPhone: "",
      description: "",
    },
  });

  const description = watch("description");

  const handleFileUpload = async (key: keyof typeof files, label: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }
    const ext = file.name.split(".").pop();
    const filePath = `${authUser?.id}/${key}-${Date.now()}.${ext}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    const { error } = await supabase.storage.from("agency-docs").upload(filePath, file, { upsert: true });
    setUploading((prev) => ({ ...prev, [key]: false }));
    if (error) { toast.error(error.message); return; }
    setFiles((prev) => ({ ...prev, [key]: filePath }));
    toast.success(`${label.replace(" *", "")} uploaded successfully`);
  };

  const handleNext = async () => {
    const fields = STEP_FIELDS[step];
    if (fields) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    // Step 3: require license + pan files
    if (step === 3 && (!files.licenseFile || !files.panFile)) {
      toast.error("Please upload the Tourism License and PAN Certificate.");
      return;
    }
    setStep((s) => s + 1);
  };

  const onSubmit = handleSubmit(async (data) => {
    if (!files.licenseFile || !files.panFile) {
      toast.error("Please upload required documents.");
      setStep(3);
      return;
    }
    setIsSubmitting(true);
    const { error } = await submitApplication({ ...data, website, ...files });
    setIsSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success("Application submitted! We'll review your details within 2-3 business days.");
    navigate("/agency/onboarding/status");
  });

  return (
    <div className="pt-24 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Mountain className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">Nepal<span className="text-primary">Trails</span></span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Partner Registration</h1>
            <p className="text-muted-foreground">Complete the form below to register your agency on NepalTrails</p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-10 px-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step > s.id ? "bg-primary text-primary-foreground"
                    : step === s.id ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {step > s.id ? <Check className="h-5 w-5" /> : s.id}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground hidden sm:block">{s.title}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 rounded ${step > s.id ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={onSubmit}>
            <Card variant="elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {(() => { const StepIcon = STEPS[step - 1].icon; return <StepIcon className="h-5 w-5 text-primary" />; })()}
                  {STEPS[step - 1].title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Step 1: Company Details */}
                {step === 1 && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Company Name *</Label>
                        <Input placeholder="e.g. Himalayan Expeditions Pvt. Ltd." {...register("companyName")} />
                        {errors.companyName && <p className="text-xs text-destructive mt-1">{errors.companyName.message}</p>}
                      </div>
                      <div>
                        <Label>Registration Number *</Label>
                        <Input placeholder="Company registration number" {...register("registrationNumber")} />
                        {errors.registrationNumber && <p className="text-xs text-destructive mt-1">{errors.registrationNumber.message}</p>}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>PAN Number *</Label>
                        <Input placeholder="PAN / VAT number" {...register("panNumber")} />
                        {errors.panNumber && <p className="text-xs text-destructive mt-1">{errors.panNumber.message}</p>}
                      </div>
                      <div>
                        <Label>Phone Number *</Label>
                        <Input placeholder="+977-1-XXXXXXX" {...register("phone")} />
                        {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
                      </div>
                    </div>
                    <div>
                      <Label>Business Address *</Label>
                      <Input placeholder="Street address" {...register("address")} />
                      {errors.address && <p className="text-xs text-destructive mt-1">{errors.address.message}</p>}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>City *</Label>
                        <Input placeholder="e.g. Kathmandu" {...register("city")} />
                        {errors.city && <p className="text-xs text-destructive mt-1">{errors.city.message}</p>}
                      </div>
                      <div>
                        <Label>District *</Label>
                        <Input placeholder="e.g. Kathmandu" {...register("district")} />
                        {errors.district && <p className="text-xs text-destructive mt-1">{errors.district.message}</p>}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Email *</Label>
                        <Input type="email" placeholder="company@example.com" {...register("email")} />
                        {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                      </div>
                      <div>
                        <Label>Website</Label>
                        <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                {/* Step 2: Owner / Contact */}
                {step === 2 && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Owner / Authorized Person Name *</Label>
                        <Input placeholder="Full name" {...register("ownerName")} />
                        {errors.ownerName && <p className="text-xs text-destructive mt-1">{errors.ownerName.message}</p>}
                      </div>
                      <div>
                        <Label>Contact Phone *</Label>
                        <Input placeholder="+977-98XXXXXXXX" {...register("ownerPhone")} />
                        {errors.ownerPhone && <p className="text-xs text-destructive mt-1">{errors.ownerPhone.message}</p>}
                      </div>
                    </div>
                    <div>
                      <Label>About Your Agency *</Label>
                      <Textarea
                        placeholder="Tell us about your agency, your experience, specializations, and the types of activities you offer..."
                        rows={5}
                        maxLength={2000}
                        {...register("description")}
                      />
                      {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
                      <p className="text-xs text-muted-foreground mt-1 text-right">{description?.length ?? 0}/2000</p>
                    </div>
                  </>
                )}

                {/* Step 3: Documents */}
                {step === 3 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Upload the following documents for verification. Accepted formats: PDF, JPG, PNG (max 5MB).
                    </p>
                    <div className="space-y-4">
                      {[
                        { key: "licenseFile" as const, label: "Tourism License *", desc: "Issued by Ministry of Tourism or NTB" },
                        { key: "panFile" as const, label: "PAN / VAT Certificate *", desc: "Inland Revenue Department certificate" },
                        { key: "insuranceFile" as const, label: "Insurance Certificate", desc: "Business liability insurance (recommended)" },
                      ].map((doc) => (
                        <div key={doc.key}>
                          <input
                            type="file"
                            id={`file-${doc.key}`}
                            accept="image/jpeg,image/png,application/pdf"
                            className="hidden"
                            onChange={(e) => handleFileUpload(doc.key, doc.label, e.target.files?.[0])}
                          />
                          <div
                            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer hover:border-primary/50 ${
                              files[doc.key] ? "border-primary bg-primary/5" : "border-border"
                            }`}
                            onClick={() => document.getElementById(`file-${doc.key}`)?.click()}
                          >
                            {uploading[doc.key] ? (
                              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Uploading...</span>
                              </div>
                            ) : files[doc.key] ? (
                              <div className="flex items-center justify-center gap-2 text-primary">
                                <Check className="h-5 w-5" />
                                <span className="font-medium">{files[doc.key].split("/").pop()}</span>
                              </div>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                <p className="font-medium">{doc.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{doc.desc}</p>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Step 4: Review */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Company Details</h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Company:</span> {watch("companyName")}</div>
                        <div><span className="text-muted-foreground">Reg No:</span> {watch("registrationNumber")}</div>
                        <div><span className="text-muted-foreground">PAN:</span> {watch("panNumber")}</div>
                        <div><span className="text-muted-foreground">Phone:</span> {watch("phone")}</div>
                        <div><span className="text-muted-foreground">Email:</span> {watch("email")}</div>
                        <div><span className="text-muted-foreground">Address:</span> {watch("address")}, {watch("city")}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" />Contact Person</h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Name:</span> {watch("ownerName")}</div>
                        <div><span className="text-muted-foreground">Phone:</span> {watch("ownerPhone")}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Documents</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          Tourism License: {files.licenseFile ? files.licenseFile.split("/").pop() : "Not uploaded"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          PAN Certificate: {files.panFile ? files.panFile.split("/").pop() : "Not uploaded"}
                        </div>
                        <div className="flex items-center gap-2">
                          {files.insuranceFile ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4 rounded-full border border-muted-foreground inline-block" />}
                          Insurance: {files.insuranceFile ? files.insuranceFile.split("/").pop() : "Not uploaded (optional)"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                      <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">Verification Process</p>
                        <p className="text-muted-foreground mt-1">
                          Our team will review your application within 2-3 business days. You'll receive an email notification once your account is verified and ready to use.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-6 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 1}>
                    <ChevronLeft className="h-4 w-4 mr-1" />Back
                  </Button>

                  {step < 4 ? (
                    <Button type="button" onClick={handleNext}>
                      Continue<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Submitting...</>
                      ) : (
                        <>Submit Application<Check className="h-4 w-4 ml-1" /></>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
  );
}
