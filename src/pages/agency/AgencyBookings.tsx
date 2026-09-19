import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { ComingSoon } from "@/components/ComingSoon";
import { ClipboardList } from "lucide-react";

// Rebuilt as a stub: the old booking-management UI here (and the trip
// manifest export it used, also removed) queried bookings columns
// (total_amount, commission_amount, net_payout) that belonged to the
// removed Stripe-based payment model and no longer exist. Bring back once
// the new NPR reservation-fee booking flow exists.
export default function AgencyBookings() {
  return (
    <AgencyLayout title="Bookings">
      <ComingSoon
        icon={ClipboardList}
        title="Booking management is coming soon"
        description="We're rolling out a new reservation and payment flow. Your bookings will appear here once it's live."
      />
    </AgencyLayout>
  );
}
