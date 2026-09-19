import { Layout } from "@/components/layout/Layout";
import { ComingSoon } from "@/components/ComingSoon";
import { PackageOpen } from "lucide-react";

// Rebuilt as a stub: the old booking-history UI here queried bookings
// columns (trip_date, total_amount, commission_amount, net_payout) that
// belonged to the removed Stripe-based payment model and no longer exist.
// Bring back once the new NPR reservation-fee booking flow exists.
export default function MyBookings() {
  return (
    <Layout>
      <div className="pt-32 md:pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-2xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground mb-8">Track and manage your upcoming adventures</p>
          <ComingSoon
            icon={PackageOpen}
            title="Booking history is coming soon"
            description="We're rolling out a new reservation and payment flow. Your booking history will appear here once it's live."
          />
        </div>
      </div>
    </Layout>
  );
}
