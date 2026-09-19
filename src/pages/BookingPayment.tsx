import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { ComingSoon } from "@/components/ComingSoon";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

// Was the Stripe Elements checkout form — removed along with the rest of
// the Stripe-based payment model. The new checkout (NPR reservation fee
// paid online, balance in cash or later) lands here once it's built.
export default function BookingPayment() {
  return (
    <Layout>
      <div className="pt-32 md:pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-md">
          <ComingSoon
            icon={CreditCard}
            title="Checkout is coming soon"
            description="We're rolling out a new reservation fee payment flow. Please check back shortly."
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
