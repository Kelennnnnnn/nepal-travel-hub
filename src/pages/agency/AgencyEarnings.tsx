import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { ComingSoon } from "@/components/ComingSoon";
import { DollarSign } from "lucide-react";

// Rebuilt as a stub: the old earnings/payout UI here computed net_payout
// from Stripe Connect payout data — removed along with the rest of that
// model. Bring back once the new NPR reservation-fee settlement model
// exists.
export default function AgencyEarnings() {
  return (
    <AgencyLayout title="Earnings">
      <ComingSoon
        icon={DollarSign}
        title="Earnings & payouts are coming soon"
        description="We're rolling out a new payment and settlement flow. Your earnings will appear here once it's live."
      />
    </AgencyLayout>
  );
}
