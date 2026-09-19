import { AdminLayout } from "@/components/admin/AdminLayout";
import { ComingSoon } from "@/components/ComingSoon";
import { ClipboardList } from "lucide-react";

// Rebuilt as a stub: the old booking admin table here queried bookings
// columns (trip_date, total_amount, commission_amount, net_payout) that
// belonged to the removed Stripe-based payment model and no longer exist.
// Bring back once the new NPR reservation-fee booking flow exists.
export default function AdminBookings() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-muted-foreground">Platform-wide booking activity</p>
        </div>
        <ComingSoon
          icon={ClipboardList}
          title="Booking management is coming soon"
          description="We're rolling out a new reservation and payment flow. Platform-wide bookings will appear here once it's live."
        />
      </div>
    </AdminLayout>
  );
}
