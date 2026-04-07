import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileSearch,
  Mountain,
  ArrowRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { useAgencyStore, VerificationStatus } from "@/stores/agencyStore";

const statusConfig: Record<
  Exclude<VerificationStatus, "unregistered">,
  {
    icon: typeof Clock;
    title: string;
    description: string;
    color: string;
    bgColor: string;
  }
> = {
  pending: {
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
  verified: {
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
};

export default function AgencyVerificationStatus() {
  const navigate = useNavigate();
  const {
    verificationStatus,
    application,
    isLoading,
    fetchMyApplication,
    subscribeToMyApplication,
  } = useAgencyStore();

  // Fetch application on mount + subscribe to real-time updates
  useEffect(() => {
    fetchMyApplication();
    const unsubscribe = subscribeToMyApplication();
    return unsubscribe;
  }, [fetchMyApplication, subscribeToMyApplication]);

  // Show loader while fetching
  if (isLoading) {
    return (
      <Layout>
        <div className="pt-24 pb-16 min-h-screen bg-muted/30 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Loading your application...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Redirect if no application found
  if (verificationStatus === "unregistered") {
    navigate("/agency/onboarding");
    return null;
  }

  const config = statusConfig[verificationStatus];
  const StatusIcon = config.icon;

  return (
    <Layout>
      <div className="pt-24 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Mountain className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">
                Nepal<span className="text-primary">Trails</span>
              </span>
            </div>
          </div>

          <Card variant="elevated">
            <CardContent className="p-8 text-center space-y-6">
              {/* Status Icon */}
              <div
                className={`w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center mx-auto`}
              >
                <StatusIcon className={`h-10 w-10 ${config.color}`} />
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-2">{config.title}</h1>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {config.description}
                </p>
              </div>

              {/* Rejection reason */}
              {verificationStatus === "rejected" && application?.rejection_reason && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-left">
                  <p className="text-sm font-medium text-destructive mb-1">Reason for rejection:</p>
                  <p className="text-sm text-muted-foreground">{application.rejection_reason}</p>
                </div>
              )}

              {/* Company Info */}
              {application && (
                <div className="bg-muted/50 rounded-xl p-4 text-left text-sm">
                  <p className="font-semibold text-foreground">
                    {application.company_name}
                  </p>
                  <p className="text-muted-foreground">
                    {application.email} · {application.phone}
                  </p>
                  <p className="text-muted-foreground">
                    {application.city}, {application.district}
                  </p>
                </div>
              )}

              {/* Progress Timeline */}
              <div className="flex items-center justify-center gap-0 py-4">
                {(["pending", "in_review", "verified"] as const).map((s, i) => {
                  const statuses: VerificationStatus[] = [
                    "pending",
                    "in_review",
                    "verified",
                  ];
                  const currentIdx = statuses.indexOf(
                    verificationStatus as (typeof statuses)[number]
                  );
                  const isComplete = currentIdx > i;
                  const isCurrent = currentIdx === i;
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                            isComplete
                              ? "bg-primary text-primary-foreground"
                              : isCurrent
                              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isComplete ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            i + 1
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {s === "pending"
                            ? "Submitted"
                            : s === "in_review"
                            ? "Reviewing"
                            : "Verified"}
                        </span>
                      </div>
                      {i < 2 && (
                        <div
                          className={`w-16 h-0.5 mx-1 mt-[-16px] ${
                            isComplete ? "bg-primary" : "bg-border"
                          }`}
                        />
                      )}
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
                {verificationStatus === "verified" && (
                  <Button
                    size="lg"
                    onClick={() => navigate("/agency/dashboard")}
                  >
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}

                {verificationStatus === "rejected" && (
                  <Button
                    size="lg"
                    onClick={() => {
                      navigate("/agency/onboarding");
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Resubmit Application
                  </Button>
                )}

                {(verificationStatus === "pending" ||
                  verificationStatus === "in_review") && (
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Return to Homepage
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
