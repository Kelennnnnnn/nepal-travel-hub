import { Layout } from "@/components/layout/Layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What is Yatra Nepal?",
    a: "Yatra Nepal is a marketplace that connects travelers with verified local travel agencies across Nepal. We make it easy to discover, compare, and book trekking, tours, and cultural experiences — all through one trusted platform.",
  },
  {
    q: "How do I book an activity?",
    a: "Browse activities on our Activities page, select the one you want, choose your trip date and number of guests, then proceed to checkout. Payment is processed securely through Stripe. You'll receive a booking confirmation email once your payment is complete.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Cancellation terms depend on how far in advance you cancel. More than 14 days before departure: full refund (minus processing fees). Between 7–14 days: 50% refund at the agency's discretion. Less than 7 days: no refund, unless the agency cancels. If an agency cancels, you receive a full refund within 5–10 business days.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. All payments are processed through Stripe, a PCI DSS Level 1 certified payment processor. Yatra Nepal never stores your full card details. You can pay using any major credit or debit card.",
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
    a: "You can reach our support team by emailing hello@yatranepal.com or by using the contact form on our Contact page. We're available Sunday–Friday, 9am–6pm NPT and typically respond within one business day.",
  },
];

export default function FAQ() {
  return (
    <Layout>
      <div className="pt-24 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3">Frequently Asked Questions</h1>
            <p className="text-muted-foreground">
              Everything you need to know about booking with Yatra Nepal.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="bg-background border border-border rounded-xl px-6"
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {faq.a}
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
