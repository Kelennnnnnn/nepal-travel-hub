import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useSiteContent } from "@/hooks/useSiteContent";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqItem {
  q: string;
  a: string;
}

const DEFAULT_FAQS: FaqItem[] = [
  {
    q: "What is {platform_name}?",
    a: "{platform_name} is a marketplace that connects travelers with verified local travel agencies across Nepal. We make it easy to discover, compare, and book trekking, tours, and cultural experiences — all through one trusted platform.",
  },
  {
    q: "How do I book an activity?",
    a: "Browse activities on our Activities page, select the one you want, choose your trip date and number of guests, then pay a {reservation_fee_percent}% reservation fee to secure your spot. The remaining balance is paid according to the listing's own payment terms. You'll receive a booking confirmation email once your reservation fee is paid.",
  },
  {
    q: "What is the cancellation policy?",
    a: "The reservation fee is fully refundable if you cancel more than {fee_free_cancel_hours_day} hours before a single-day activity's start time, or {fee_free_cancel_hours_multiday} hours before a multi-day trip's start time. After that window, the reservation fee is non-refundable. Any balance paid in advance follows the agency's own cancellation policy, shown on the listing before you book. If the agency cancels, you receive a full refund.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. All payments are processed through our payment provider. We never store your full card details. You can pay using any major credit or debit card.",
  },
  {
    q: "How are agencies verified?",
    a: "Every agency on our platform goes through a manual verification process. They must submit their Tourism License (issued by the Nepal Tourism Board or Ministry of Tourism), PAN/VAT Certificate, and business insurance. Our team reviews each application before granting access to list activities.",
  },
  {
    q: "Do I need a permit for trekking in Nepal?",
    a: "Most trekking areas in Nepal require permits — the most common are the TIMS card (Trekkers' Information Management System) and restricted area permits for regions like Upper Mustang or Dolpo. The agency you book with will advise you on the exact permits required for your chosen route and can often arrange them on your behalf.",
  },
  {
    q: "Are there group discounts available?",
    a: "Some agencies offer group pricing. You can check the listing details page or contact the agency directly through the platform to ask about group rates. We're working on a built-in group booking feature that will be available soon.",
  },
  {
    q: "How do I contact support?",
    a: "You can reach our support team by emailing {support_email} or by using the contact form on our Contact page. We're available {support_hours} and typically respond within one business day.",
  },
];

export default function FAQ() {
  const settings = usePlatformSettings();
  const faqs = useSiteContent<FaqItem[]>("faq", DEFAULT_FAQS);

  const interpolate = (text: string) =>
    text.replace(/\{(\w+)\}/g, (match, key) => {
      const value = (settings as unknown as Record<string, unknown>)[key];
      return value != null ? String(value) : match;
    });

  return (
    <Layout>
      <SEO title="Frequently Asked Questions" description="Find answers to common questions about booking Nepal travel experiences, cancellations, payments and more." />
      <div className="pt-32 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3">Frequently Asked Questions</h1>
            <p className="text-muted-foreground">
              Everything you need to know about booking with {settings.platform_name}.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="bg-background border border-border rounded-xl px-6"
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-5">
                  {interpolate(faq.q)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {interpolate(faq.a)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center p-6 bg-background border border-border rounded-xl">
            <p className="font-medium mb-1">Still have questions?</p>
            <p className="text-muted-foreground text-sm mb-4">
              Our team is happy to help.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
