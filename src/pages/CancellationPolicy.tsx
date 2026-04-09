import { Layout } from "@/components/layout/Layout";

const LAST_UPDATED = "April 9, 2026";

export default function CancellationPolicy() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Cancellation Policy</h1>
          <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p className="text-muted-foreground">
              Yatra Nepal operates as a marketplace connecting travelers with local Nepali travel
              agencies. Cancellation policies are governed by this platform policy and, where
              applicable, supplemented by the individual agency's terms displayed on each listing page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Traveler Cancellation Tiers</h2>
            <div className="space-y-4">
              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      More than 14 days before departure
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Full refund of the booking amount, minus Stripe payment processing fees
                      (typically 2.9% + $0.30). Refunds are issued to the original payment method
                      within 5–10 business days.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      7–14 days before departure
                    </p>
                    <p className="text-muted-foreground mt-1">
                      50% refund at the agency's discretion. The agency may offer a full credit
                      toward rescheduling instead of a partial refund. Contact the agency directly
                      to discuss your options.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Less than 7 days before departure
                    </p>
                    <p className="text-muted-foreground mt-1">
                      No refund, unless the agency has cancelled the trip. We strongly recommend
                      purchasing travel insurance that covers trip cancellation for last-minute
                      emergencies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Agency-Initiated Cancellations</h2>
            <p className="text-muted-foreground">
              If a verified agency cancels a confirmed booking for any reason, you will receive a
              full refund of the total amount paid, including any fees, within 5–10 business days.
              Yatra Nepal will contact you by email to confirm the cancellation and initiate the refund.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Force Majeure</h2>
            <p className="text-muted-foreground">
              Cancellations caused by events outside the agency's reasonable control — including
              natural disasters, government travel advisories, political unrest, extreme weather,
              or health emergencies — are handled on a case-by-case basis. In such circumstances,
              agencies are encouraged to offer full credit or rescheduling options. Yatra Nepal will
              mediate any disputes between travelers and agencies in good faith.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How to Cancel</h2>
            <p className="text-muted-foreground mb-3">
              To cancel a booking, email us at{" "}
              <a
                href="mailto:hello@yatranepal.com"
                className="text-primary hover:underline"
              >
                hello@yatranepal.com
              </a>{" "}
              with your booking reference number. We process cancellation requests within one
              business day and will confirm the applicable refund amount by email.
            </p>
            <p className="text-muted-foreground">
              In-app cancellation is available in the Traveler Dashboard for bookings with more
              than 14 days until departure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Travel Insurance</h2>
            <p className="text-muted-foreground">
              We strongly recommend all travelers purchase comprehensive travel insurance before
              booking. A good policy should cover trip cancellation, emergency medical evacuation,
              and baggage loss. Nepal trekking activities carry inherent risks, and insurance
              provides important financial protection.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground">
              Questions about our cancellation policy? Contact us at{" "}
              <a
                href="mailto:hello@yatranepal.com"
                className="text-primary hover:underline"
              >
                hello@yatranepal.com
              </a>{" "}
              or visit our{" "}
              <a href="/contact" className="text-primary hover:underline">
                Contact page
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
