import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { LegalReviewBanner } from "@/components/legal/LegalReviewBanner";

const LAST_UPDATED = "April 9, 2026";

export default function CancellationPolicy() {
  const {
    platform_name: platformName,
    support_email: supportEmail,
    reservation_fee_percent,
    fee_free_cancel_hours_day,
    fee_free_cancel_hours_multiday,
    no_show_dispute_hours,
  } = usePlatformSettings();
  const multidayDays = Math.round(fee_free_cancel_hours_multiday / 24);
  return (
    <Layout>
      <SEO title="Cancellation Policy" description={`Review ${platformName}'s cancellation and refund policy for Nepal travel bookings.`} />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Cancellation Policy</h1>
          <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <LegalReviewBanner />

        <div className="space-y-10 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p className="text-muted-foreground">
              {platformName} operates as a marketplace connecting travelers with local Nepali travel
              agencies. At booking, you pay a reservation fee of {reservation_fee_percent}% of the
              total booking value to secure your spot. This policy covers the refundability of that
              fee. Where you also pay a balance in advance, any refund of that balance follows the
              individual agency's own cancellation policy, displayed on each listing page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Reservation Fee Refund Window</h2>
            <div className="space-y-4">
              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Single-day activities — cancel more than {fee_free_cancel_hours_day} hours before start
                    </p>
                    <p className="text-muted-foreground mt-1">
                      The reservation fee is fully refunded to your original payment method.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Multi-day trips — cancel more than {fee_free_cancel_hours_multiday} hours ({multidayDays} days) before start
                    </p>
                    <p className="text-muted-foreground mt-1">
                      The reservation fee is fully refunded to your original payment method.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive mt-2 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Inside the free-cancellation window
                    </p>
                    <p className="text-muted-foreground mt-1">
                      The reservation fee is non-refundable, unless the agency cancels. If you paid
                      a balance in advance, any refund of that balance follows the agency's own
                      cancellation policy shown on the listing. We strongly recommend purchasing
                      travel insurance that covers trip cancellation for last-minute emergencies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Agency-Initiated Cancellations</h2>
            <p className="text-muted-foreground">
              If a verified agency cancels a confirmed booking for any reason, you receive a full
              refund of everything you paid, including the reservation fee. {platformName} will
              contact you by email to confirm the cancellation and initiate the refund.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">No-Shows &amp; Weather Disruptions</h2>
            <p className="text-muted-foreground mb-3">
              Each listing sets its own no-show grace period — how long after the scheduled start
              time you (or the agency) can still show up before it counts as a no-show. If you miss
              a trip without cancelling, the reservation fee is non-refundable; you can dispute a
              no-show determination within {no_show_dispute_hours} hours of it being recorded,
              either direction.
            </p>
            <p className="text-muted-foreground">
              If the agency cancels or changes your trip for weather, flight, or safety reasons, you
              can change your date for free or get a full refund — this applies regardless of the
              free-cancellation window above.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Force Majeure</h2>
            <p className="text-muted-foreground">
              Cancellations caused by events outside the agency's reasonable control — including
              natural disasters, government travel advisories, political unrest, extreme weather,
              or health emergencies — are handled on a case-by-case basis. In such circumstances,
              agencies are encouraged to offer full credit or rescheduling options. {platformName} will
              mediate any disputes between travelers and agencies in good faith.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How to Cancel</h2>
            <p className="text-muted-foreground mb-3">
              To cancel a booking, email us at{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="text-primary hover:underline"
              >
                {supportEmail}
              </a>{" "}
              with your booking reference number. We process cancellation requests within one
              business day and will confirm the applicable refund amount by email.
            </p>
            <p className="text-muted-foreground">
              In-app cancellation is available from the Traveler Dashboard at any time before the
              trip starts.
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
                href={`mailto:${supportEmail}`}
                className="text-primary hover:underline"
              >
                {supportEmail}
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
