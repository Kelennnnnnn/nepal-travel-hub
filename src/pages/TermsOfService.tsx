import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { LegalReviewBanner } from "@/components/legal/LegalReviewBanner";

const LAST_UPDATED = "April 8, 2026";

export default function TermsOfService() {
  const { platform_name: platformName, legal_email: legalEmail, reservation_fee_percent, fee_free_cancel_hours_day, fee_free_cancel_hours_multiday } = usePlatformSettings();
  return (
    <Layout>
      <SEO title="Terms of Service" description={`Review the terms for using ${platformName} to discover, book, and manage Nepal travel experiences.`} />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Terms of Service</h1>
          <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <LegalReviewBanner />

        <div className="space-y-10 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-muted-foreground">
              By accessing or using the Into Nepal platform ("Platform"), you
              agree to be bound by these Terms of Service ("Terms"). If you do
              not agree to these Terms, please do not use the Platform. These
              Terms apply to all visitors, travelers, and registered users,
              including travel agencies that list activities on the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              2. Use of the Platform
            </h2>
            <p className="text-muted-foreground mb-3">
              Into Nepal is a marketplace that connects travelers with verified
              local travel agencies operating in Nepal. We do not directly
              provide travel services; we facilitate bookings between travelers
              and independent agency partners.
            </p>
            <p className="text-muted-foreground">
              You agree to use the Platform only for lawful purposes and in
              accordance with these Terms. You must not misuse, disrupt, or
              attempt to gain unauthorized access to any part of the Platform or
              its underlying systems.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              3. Bookings & Payments
            </h2>
            <p className="text-muted-foreground mb-3">
              When you make a booking through Into Nepal, you enter into a
              direct agreement with the relevant travel agency. Into Nepal
              facilitates the transaction but is not a party to the contract
              between you and the agency.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                All prices are displayed in NPR (Nepalese Rupees) unless
                otherwise stated and include applicable taxes where required.
              </li>
              <li>
                To secure a booking, you pay a reservation fee of{" "}
                <span className="font-medium text-foreground">{reservation_fee_percent}%</span> of
                the total booking value at checkout. Depending on the listing's payment terms, the
                remaining balance is either paid to the agency directly or collected through the
                Platform before the trip starts. Payment is processed securely through our payment
                provider; we do not store your full card details.
              </li>
              <li>
                A booking is confirmed only once the reservation fee is successfully processed and
                you receive a confirmation email.
              </li>
              <li>
                Agencies are responsible for delivering the services described
                in their listings.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              4. Cancellation Policy
            </h2>
            <p className="text-muted-foreground mb-3">
              Refund eligibility for the reservation fee depends on when you cancel, relative to
              the activity's start time:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Single-day activities:
                </span>{" "}
                the reservation fee is fully refundable if you cancel more than{" "}
                {fee_free_cancel_hours_day} hours before the activity starts.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Multi-day trips:
                </span>{" "}
                the reservation fee is fully refundable if you cancel more than{" "}
                {fee_free_cancel_hours_multiday} hours ({Math.round(fee_free_cancel_hours_multiday / 24)} days)
                before the trip starts.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  After the free-cancellation window:
                </span>{" "}
                the reservation fee is non-refundable. If you paid the remaining balance in
                advance, any refund of that balance follows the agency's own cancellation policy,
                shown on the listing before you book.
              </li>
            </ul>
            <p className="text-muted-foreground mt-3">
              If an agency cancels a confirmed booking, you receive a full refund of everything
              you paid.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              5. Reservation Fee
            </h2>
            <p className="text-muted-foreground">
              {platformName} charges travelers a reservation fee of{" "}
              <span className="font-medium text-foreground">{reservation_fee_percent}%</span> of
              the total booking value, paid at checkout to secure the booking. This fee compensates
              the Platform for payment processing, customer support, and the booking
              infrastructure connecting you with the agency. It is separate from, and does not
              reduce, the price the agency charges for the activity itself.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              6. Limitation of Liability
            </h2>
            <p className="text-muted-foreground mb-3">
              Into Nepal acts solely as an intermediary marketplace. To the
              fullest extent permitted by law, Into Nepal shall not be liable
              for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                Any injury, loss, damage, or death arising from activities booked
                through the Platform.
              </li>
              <li>
                Acts or omissions of any travel agency, guide, driver, or
                third-party service provider.
              </li>
              <li>
                Cancellations, delays, or changes caused by weather, natural
                disasters, political events, or other force majeure circumstances.
              </li>
              <li>
                Indirect, incidental, or consequential damages of any kind.
              </li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We strongly recommend that all travelers obtain comprehensive
              travel insurance before undertaking any trip.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              7. User Content & Reviews
            </h2>
            <p className="text-muted-foreground">
              Users may submit reviews and other content related to their
              experiences. By submitting content, you grant Into Nepal a
              non-exclusive, royalty-free licence to display that content on the
              Platform. You are responsible for ensuring your content is accurate
              and does not infringe third-party rights or violate applicable law.
              Into Nepal reserves the right to remove any content that violates
              these Terms or our community standards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              8. Governing Law
            </h2>
            <p className="text-muted-foreground">
              These Terms are governed by and construed in accordance with the
              laws of Nepal. Any disputes arising out of or related to these
              Terms or your use of the Platform shall be subject to the exclusive
              jurisdiction of the courts of Kathmandu, Nepal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              9. Changes to These Terms
            </h2>
            <p className="text-muted-foreground">
              We may update these Terms from time to time. When we do, we will
              update the "Last updated" date at the top of this page and, where
              appropriate, notify you by email. Continued use of the Platform
              after any changes constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about these Terms, please contact us at{" "}
              <a
                href={`mailto:${legalEmail}`}
                className="text-primary hover:underline"
              >
                {legalEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
