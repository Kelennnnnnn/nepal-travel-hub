import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileSearch,
  FileEdit,
  Mountain,
  ArrowRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAgencyStore, type VerificationStatus } from "@/stores/agencyStore";

const statusConfig: Record<
  Exclude<VerificationStatus, "unregistered" | "draft">,
  { icon: typeof Clock; title: string; description: string; color: string; bgColor: string }
> = {
  submitted: {
    icon: Clock,
    title: "Application Submitted",
    description:
      "Thank you for applying! Your application is in our queue and will be reviewed within 2-3 business days. We'll notify you via email once the review begins.",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  in_review: {
    icon: FileSearch,
    title: "Under Review",
    description:
      "Our team is currently reviewing your documents and verifying your business details. This usually takes 1-2 business days.",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  more_info_required: {
    icon: FileEdit,
    title: "More Information Needed",
    description:
      "We need a bit more information before we can make a decision. Please review the note below and update your application.",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
  },
  approved: {
    icon: CheckCircle2,
    title: "Verification Complete!",
    description:
      "Congratulations! Your agency has been verified. You can now access your partner dashboard and start listing activities.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  rejected: {
    icon: XCircle,
    title: "Application Not Approved",
    description:
      "Unfortunately, we couldn't verify your application at this time. Please review the feedback below and resubmit with updated information.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  suspended: {
    icon: XCircle,
    title: "Account Suspended",
    description:
      "Your agency account has been suspended. Your listings are not visible to travellers until this is resolved.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

export default function AgencyVerificationStatus() {
  const navigate = useNavigate();
  const {
    verificationStatus,
    myAgency,
    myVerification,
    isLoading,
    fetchMyApplication,
    subscribeToMyApplication,
  } = useAgencyStore();

  useEffect(() => {
    fetchMyApplication();
    const unsubscribe = subscribeToMyApplication();
    return unsubscribe;
  }, [fetchMyApplication, subscribeToMyApplication]);

  if (isLoading) {
    return (
      <div className="pt-24 pb-16 min-h-screen bg-muted/30 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Loading your application...</p>
          </div>
        </div>
    );
  }

  // Redirect if no application, or one exists but was never submitted
  // (draft — the applicant abandoned the wizard partway through).
  if (verificationStatus === "unregistered" || verificationStatus === "draft") {
    navigate("/agency/onboarding");
    return null;
  }

  const config = statusConfig[verificationStatus];
  const StatusIcon = config.icon;

  return (
    <div className="pt-24 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Mountain className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold font-serif italic">Into Nepal</span>
            </div>
          </div>

          <Card variant="elevated">
            <CardContent className="p-8 text-center space-y-6">
              {/* Status Icon */}
              <div className={`w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center mx-auto`}>
                <StatusIcon className={`h-10 w-10 ${config.color}`} />
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-2">{config.title}</h1>
                <p className="text-muted-foreground max-w-md mx-auto">{config.description}</p>
              </div>

              {/* Rejection reason */}
              {verificationStatus === "rejected" && myVerification?.rejection_reason && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-left">
                  <p className="text-sm font-medium text-destructive mb-1">Reason for rejection:</p>
                  <p className="text-sm text-muted-foreground">{myVerification.rejection_reason}</p>
                </div>
              )}

              {/* Suspension reason (reuses rejection_reason — see review-agency-application) */}
              {verificationStatus === "suspended" && myVerification?.rejection_reason && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-left">
                  <p className="text-sm font-medium text-destructive mb-1">Reason for suspension:</p>
                  <p className="text-sm text-muted-foreground">{myVerification.rejection_reason}</p>
                </div>
              )}

              {/* More-info-required note */}
              {verificationStatus === "more_info_required" && myVerification?.info_requested_note && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
                  <p className="text-sm font-medium text-amber-800 mb-1">What we need:</p>
                  <p className="text-sm text-muted-foreground">{myVerification.info_requested_note}</p>
                </div>
              )}

              {/* Company Info */}
              {myAgency && (
                <div className="bg-muted/50 rounded-xl p-4 text-left text-sm">
                  <p className="font-semibold text-foreground">{myAgency.display_name}</p>
                  <p className="text-muted-foreground">{myAgency.email} · {myAgency.phone}</p>
                  <p className="text-muted-foreground">{myAgency.city}, {myAgency.district}</p>
                </div>
              )}

              {/* Progress Timeline */}
              <div className="flex items-center justify-center gap-0 py-4">
                {(["submitted", "in_review", "approved"] as const).map((s, i) => {
                  const statuses: VerificationStatus[] = ["submitted", "in_review", "approved"];
                  const currentIdx = statuses.indexOf(verificationStatus as (typeof statuses)[number]);
                  // more_info_required visually sits alongside in_review on the timeline.
                  const effectiveIdx = verificationStatus === "more_info_required" ? 1 : currentIdx;
                  const isComplete = effectiveIdx > i;
                  const isCurrent = effectiveIdx === i;
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isComplete ? "bg-primary text-primary-foreground"
                          : isCurrent ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {s === "submitted" ? "Submitted" : s === "in_review" ? "Reviewing" : "Verified"}
                        </span>
                      </div>
                      {i < 2 && <div className={`w-16 h-0.5 mx-1 mt-[-16px] ${isComplete ? "bg-primary" : "bg-border"}`} />}
                    </div>
                  );
                })}
              </div>

              {/* Real-time indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Live — status updates automatically
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                {verificationStatus === "approved" && (
                  <Button size="lg" onClick={() => navigate("/agency/dashboard")}>
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}

                {(verificationStatus === "rejected" || verificationStatus === "more_info_required") && (
                  <Button size="lg" onClick={() => navigate("/agency/onboarding")}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {verificationStatus === "rejected" ? "Resubmit Application" : "Update Application"}
                  </Button>
                )}

                {(verificationStatus === "submitted" || verificationStatus === "in_review" || verificationStatus === "suspended") && (
                  <Button variant="outline" onClick={() => navigate("/agency/login")}>
                    Back to Agency Login
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
