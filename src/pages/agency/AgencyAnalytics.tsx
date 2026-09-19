import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { ComingSoon } from "@/components/ComingSoon";
import { TrendingUp } from "lucide-react";

// Rebuilt as a stub: this page was entirely booking-funnel/revenue
// analytics computed from the removed Stripe-based payment model. Bring
// back once the new NPR reservation-fee booking flow exists.
export default function AgencyAnalytics() {
  return (
    <AgencyLayout title="Analytics">
      <ComingSoon
        icon={TrendingUp}
        title="Analytics are coming soon"
        description="We're rolling out a new reservation and payment flow. Booking and revenue analytics will appear here once it's live."
      />
    </AgencyLayout>
  );
}
