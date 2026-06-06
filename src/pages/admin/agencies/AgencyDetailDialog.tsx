import {
  Building2, Mail, MapPin, Phone, Calendar, FileText,
  CheckCircle, AlertTriangle, ExternalLink, ShieldOff, ShieldCheck,
  DollarSign, Star, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { AgencyApplication } from "@/stores/agencyStore";

export interface AgencyMetrics {
  totalBookings: number;
  totalRevenue: number;
  avgRating: number | null;
  listingCount: number;
  lastActiveDate: string | null;
}

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agency: AgencyApplication | null;
  metrics: AgencyMetrics | null;
  metricsLoading: boolean;
  statusBadge: (status: string) => React.ReactNode;
  formatDate: (d: string) => string;
  onApprove: (agency: AgencyApplication) => void;
  onReject: () => void;
  onSuspend: () => void;
  onReactivate: (agency: AgencyApplication) => void;
}

export function AgencyDetailDialog({
  open, onOpenChange, agency, metrics, metricsLoading,
  statusBadge, formatDate, onApprove, onReject, onSuspend, onReactivate,
}: Props) {
  const handleViewDocument = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from("agency-docs")
      .createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not load document. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agency Details</DialogTitle>
          <DialogDescription>
            Review agency information and manage their verification status
          </DialogDescription>
        </DialogHeader>
        {agency && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{agency.company_name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(agency.status)}
                  <span className="text-sm text-muted-foreground">
                    Reg: {agency.registration_number}
                  </span>
                </div>
              </div>
            </div>

            {/* Per-agency metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metricsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))
              ) : metrics ? (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <BookOpen className="h-3 w-3" /> Total Bookings
                    </div>
                    <p className="text-lg font-bold">{metrics.totalBookings}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <DollarSign className="h-3 w-3" /> Total Revenue
                    </div>
                    <p className="text-lg font-bold">{money.format(metrics.totalRevenue)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Star className="h-3 w-3" /> Avg Rating
                    </div>
                    <p className="text-lg font-bold">
                      {metrics.avgRating !== null ? metrics.avgRating.toFixed(1) : "—"}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3" /> Live Listings
                    </div>
                    <p className="text-lg font-bold">{metrics.listingCount}</p>
                  </div>
                </>
              ) : null}
            </div>
            {metrics?.lastActiveDate && (
              <p className="text-xs text-muted-foreground">
                Last booking: {new Date(metrics.lastActiveDate).toLocaleDateString("en-US", {
                  year: "numeric", month: "short", day: "numeric"
                })}
              </p>
            )}

            <Separator />

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" /> {agency.email}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {agency.phone}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {agency.address}, {agency.city}, {agency.district}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Applied {formatDate(agency.created_at)}
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl space-y-2">
              <h4 className="font-semibold text-sm">Business Details</h4>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">PAN Number:</span> {agency.pan_number}</div>
                <div><span className="text-muted-foreground">Registration:</span> {agency.registration_number}</div>
                {agency.website && (
                  <div><span className="text-muted-foreground">Website:</span> {agency.website}</div>
                )}
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl space-y-2">
              <h4 className="font-semibold text-sm">Contact Person</h4>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {agency.owner_name}</div>
                <div><span className="text-muted-foreground">Phone:</span> {agency.owner_phone}</div>
              </div>
            </div>

            {agency.description && (
              <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                <h4 className="font-semibold text-sm">About</h4>
                <p className="text-sm text-muted-foreground">{agency.description}</p>
              </div>
            )}

            <div className="p-4 bg-muted/50 rounded-xl space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Documents
              </h4>
              <div className="space-y-2">
                {[
                  { label: "Tourism License",       url: agency.license_url,   required: true },
                  { label: "PAN Certificate",        url: agency.pan_url,        required: true },
                  { label: "Insurance Certificate",  url: agency.insurance_url, required: false },
                ].map((doc) => (
                  <div key={doc.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {doc.url ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : doc.required ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-muted-foreground inline-block" />
                      )}
                      <span>{doc.label}</span>
                    </div>
                    {doc.url ? (
                      <Button variant="outline" size="sm" onClick={() => handleViewDocument(doc.url!)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Document
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {doc.required ? "Not uploaded" : "Not uploaded (optional)"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {agency.status === "rejected" && agency.rejection_reason && (
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-2">
                <h4 className="font-semibold text-sm text-destructive">Rejection Reason</h4>
                <p className="text-sm text-muted-foreground">{agency.rejection_reason}</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {agency && (agency.status === "pending" || agency.status === "in_review") && (
            <>
              <Button variant="destructive" onClick={() => { onOpenChange(false); onReject(); }}>Reject</Button>
              <Button onClick={() => { onApprove(agency); onOpenChange(false); }}>Approve Agency</Button>
            </>
          )}
          {agency?.status === "verified" && (
            <Button variant="destructive" onClick={() => { onOpenChange(false); onSuspend(); }}>
              <ShieldOff className="h-4 w-4 mr-1" /> Suspend
            </Button>
          )}
          {agency?.status === "suspended" && (
            <Button onClick={() => { onReactivate(agency); onOpenChange(false); }}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Reactivate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
