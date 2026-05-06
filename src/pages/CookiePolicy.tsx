import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "April 9, 2026";

export default function CookiePolicy() {
  return (
    <Layout>
      <SEO title="Cookie Policy" description="Learn how Yatra Nepal uses cookies and similar technologies to operate and improve the marketplace." />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Cookie Policy</h1>
          <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">What Are Cookies?</h2>
            <p className="text-muted-foreground">
              Cookies are small text files stored on your device when you visit a website. They help
              websites remember your preferences, keep you logged in, and understand how you use the
              site. Yatra Nepal uses cookies to provide a better, more personalised experience.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Types of Cookies We Use</h2>
            <div className="space-y-4">
              <div className="p-5 border border-border rounded-xl">
                <p className="font-semibold mb-1">Essential Cookies</p>
                <p className="text-muted-foreground text-sm">
                  Required for the platform to function. These include session cookies that keep you
                  logged in, and security tokens (including Supabase authentication tokens) that
                  protect your account. You cannot opt out of these cookies.
                </p>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <p className="font-semibold mb-1">Preference Cookies</p>
                <p className="text-muted-foreground text-sm">
                  Remember your settings such as language, currency, and search filters so you
                  don't have to re-enter them each visit.
                </p>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <p className="font-semibold mb-1">Analytics Cookies</p>
                <p className="text-muted-foreground text-sm">
                  Help us understand how visitors use Yatra Nepal — which pages are most popular,
                  how users navigate the site, and where we can improve. We use anonymised,
                  aggregated data only and do not sell this information to third parties.
                </p>
              </div>

              <div className="p-5 border border-border rounded-xl">
                <p className="font-semibold mb-1">Payment Cookies</p>
                <p className="text-muted-foreground text-sm">
                  Set by Stripe, our payment processor, to securely handle transactions. Stripe's
                  cookies are governed by{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Stripe's Privacy Policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-Party Cookies</h2>
            <p className="text-muted-foreground">
              Some features on Yatra Nepal are powered by third-party services that may set their
              own cookies. These include Stripe (payment processing) and Supabase (authentication
              and database). We do not use third-party advertising cookies or social media tracking
              pixels.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Managing Cookies</h2>
            <p className="text-muted-foreground mb-3">
              You can control cookies through your browser settings. Most browsers allow you to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>View cookies currently stored on your device</li>
              <li>Delete individual or all cookies</li>
              <li>Block cookies from specific websites</li>
              <li>Block all third-party cookies</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Please note that disabling essential cookies will affect platform functionality,
              including the ability to log in or complete bookings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Cookie Retention</h2>
            <p className="text-muted-foreground">
              Session cookies are deleted when you close your browser. Persistent cookies remain
              on your device for a set period — typically up to 12 months — unless you delete them
              earlier. Authentication tokens issued by Supabase expire after one hour and are
              automatically refreshed while you are active on the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Cookie Policy from time to time. Changes will be posted on this
              page with an updated date. Continued use of the platform after changes constitutes
              acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground">
              Questions about our use of cookies? Contact us at{" "}
              <a href="mailto:hello@yatranepal.com" className="text-primary hover:underline">
                hello@yatranepal.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
