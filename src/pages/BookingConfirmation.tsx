import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ComingSoon } from "@/components/ComingSoon";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

// Was the post-payment confirmation/voucher page — removed along with the
// rest of the Stripe-based payment model (and its voucher template, also
// removed). Rebuild once the new NPR reservation-fee booking flow exists.
export default function BookingConfirmation() {
  return (
    <Layout>
      <div className="pt-32 md:pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-md">
          <ComingSoon
            icon={CheckCircle2}
            title="Booking confirmations are coming soon"
            description="We're rolling out a new reservation flow. This page will show your confirmation once it's live."
          />
          <div className="mt-6 text-center">
            <Link to="/activities">
              <Button variant="outline">Browse Activities</Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
