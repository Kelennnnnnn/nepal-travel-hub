import {
  Building2, Mail, MapPin, Phone, Calendar, FileText,
  CheckCircle, AlertTriangle, ExternalLink, ShieldOff, ShieldCheck,
  DollarSign, Star, BookOpen, Clock, HelpCircle,
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
import type { AgencyListItem, AgencyDocument, AgencyDocumentType } from "@/stores/agencyStore";

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

const DOCUMENT_LABELS: Record<AgencyDocumentType, string> = {
  business_registration: "Business Registration",
  tourism_license: "Tourism License",
  pan_certificate: "PAN Certificate",
  insurance: "Insurance Certificate",
  other: "Other Document",
};
const REQUIRED_TYPES: AgencyDocumentType[] = ["tourism_license", "pan_certificate"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AgencyListItem | null;
  documents: AgencyDocument[];
  documentsLoading: boolean;
  metrics: AgencyMetrics | null;
  metricsLoading: boolean;
  statusBadge: (status: string) => React.ReactNode;
  formatDate: (d: string) => string;
  onStartReview: (item: AgencyListItem) => void;
  onRequestInfo: () => void;
  onApprove: (item: AgencyListItem) => void;
  onReject: () => void;
  onSuspend: () => void;
  onReinstate: (item: AgencyListItem) => void;
}

export function AgencyDetailDialog({
  open, onOpenChange, item, documents, documentsLoading, metrics, metricsLoading,
  statusBadge, formatDate, onStartReview, onRequestInfo, onApprove, onReject, onSuspend, onReinstate,
}: Props) {
  const handleViewDocument = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from("agency-documents")
      .createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not load document. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const agency = item?.agency;
  const verification = item?.verification;
  const status = verification?.status;
  const canReview = status === "submitted" || status === "in_review" || status === "more_info_required";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agency Details</DialogTitle>
          <DialogDescription>
            Review agency information and manage their verification status
          </DialogDescription>
        </DialogHeader>
        {agency && verification && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{agency.display_name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(verification.status)}
                  <span className="text-sm text-muted-foreground">{agency.slug}</span>
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
                <Mail className="h-4 w-4 text-muted-foreground" /> {agency.email || "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {agency.phone || "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {[agency.address, agency.city, agency.district].filter(Boolean).join(", ") || "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Applied {formatDate(agency.created_at)}
              </div>
            </div>

            {agency.website && (
              <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                <h4 className="font-semibold text-sm">Website</h4>
                <p className="text-sm text-muted-foreground">{agency.website}</p>
              </div>
            )}

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
              {documentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-2">
                  {REQUIRED_TYPES.map((type) => {
                    const doc = documents.find((d) => d.document_type === type);
                    return (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {doc ? <CheckCircle className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          <span>{DOCUMENT_LABELS[type]}</span>
                        </div>
                        {doc ? (
                          <Button variant="outline" size="sm" onClick={() => handleViewDocument(doc.storage_path)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Document
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not uploaded</span>
                        )}
                      </div>
                    );
                  })}
                  {documents.filter((d) => !REQUIRED_TYPES.includes(d.document_type)).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span>{DOCUMENT_LABELS[doc.document_type]}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleViewDocument(doc.storage_path)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Document
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(verification.status === "rejected" || verification.status === "suspended") && verification.rejection_reason && (
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-2">
                <h4 className="font-semibold text-sm text-destructive">
                  {verification.status === "rejected" ? "Rejection Reason" : "Suspension Reason"}
                </h4>
                <p className="text-sm text-muted-foreground">{verification.rejection_reason}</p>
              </div>
            )}

            {verification.status === "more_info_required" && verification.info_requested_note && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <h4 className="font-semibold text-sm text-amber-800">Info Requested</h4>
                <p className="text-sm text-muted-foreground">{verification.info_requested_note}</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {item && status === "submitted" && (
            <Button variant="outline" onClick={() => onStartReview(item)}>
              <Clock className="h-4 w-4 mr-1" /> Mark In Review
            </Button>
          )}
          {canReview && (
            <Button variant="outline" onClick={() => { onOpenChange(false); onRequestInfo(); }}>
              <HelpCircle className="h-4 w-4 mr-1" /> Request Info
            </Button>
          )}
          {canReview && (
            <>
              <Button variant="destructive" onClick={() => { onOpenChange(false); onReject(); }}>Reject</Button>
              {item && <Button onClick={() => { onApprove(item); onOpenChange(false); }}>Approve Agency</Button>}
            </>
          )}
          {status === "approved" && (
            <Button variant="destructive" onClick={() => { onOpenChange(false); onSuspend(); }}>
              <ShieldOff className="h-4 w-4 mr-1" /> Suspend
            </Button>
          )}
          {status === "suspended" && item && (
            <Button onClick={() => { onReinstate(item); onOpenChange(false); }}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Reinstate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
