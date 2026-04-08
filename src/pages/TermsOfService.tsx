import { Layout } from "@/components/layout/Layout";

const LAST_UPDATED = "April 8, 2026";

export default function TermsOfService() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Terms of Service</h1>
          <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-muted-foreground">
              By accessing or using the NepalTrails platform ("Platform"), you
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
              NepalTrails is a marketplace that connects travelers with verified
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
              When you make a booking through NepalTrails, you enter into a
              direct agreement with the relevant travel agency. NepalTrails
              facilitates the transaction but is not a party to the contract
              between you and the agency.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                All prices displayed are in USD unless otherwise stated and
                include applicable taxes where required.
              </li>
              <li>
                Payment is processed securely through Stripe. NepalTrails does
                not store your full card details.
              </li>
              <li>
                A booking is confirmed only once payment is successfully
                processed and you receive a confirmation email.
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
              Cancellation policies are set by individual agencies and are
              displayed on each listing page before booking. Refund eligibility
              depends on when the cancellation is made relative to the trip
              date:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  More than 14 days before departure:
                </span>{" "}
                Full refund (minus payment processing fees).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  7–14 days before departure:
                </span>{" "}
                50% refund at agency's discretion.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Less than 7 days before departure:
                </span>{" "}
                No refund, unless the agency cancels.
              </li>
            </ul>
            <p className="text-muted-foreground mt-3">
              If an agency cancels a confirmed booking, you will receive a full
              refund within 5–10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              5. Commission Structure
            </h2>
            <p className="text-muted-foreground">
              NepalTrails charges travel agencies a platform commission of
              between <span className="font-medium text-foreground">12% and 15%</span>{" "}
              of the total booking value. This commission covers platform
              maintenance, payment processing, customer support, and marketing.
              Agencies receive their net payout within 5 business days following
              the completion of the trip. Travelers are not charged any
              additional platform fees beyond the advertised price.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              6. Limitation of Liability
            </h2>
            <p className="text-muted-foreground mb-3">
              NepalTrails acts solely as an intermediary marketplace. To the
              fullest extent permitted by law, NepalTrails shall not be liable
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
              experiences. By submitting content, you grant NepalTrails a
              non-exclusive, royalty-free licence to display that content on the
              Platform. You are responsible for ensuring your content is accurate
              and does not infringe third-party rights or violate applicable law.
              NepalTrails reserves the right to remove any content that violates
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
                href="mailto:legal@nepaltrails.com"
                className="text-primary hover:underline"
              >
                legal@nepaltrails.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
