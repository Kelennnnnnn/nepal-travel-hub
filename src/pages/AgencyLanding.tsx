import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Globe,
  CreditCard,
  BarChart3,
  Users,
  Shield,
  ChevronRight,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { supabase } from "@/lib/supabase";

const benefits = [
  {
    icon: Globe,
    title: "Global Reach",
    description:
      "Connect with travelers from around the world looking for authentic Nepal experiences.",
  },
  {
    icon: CreditCard,
    title: "Zero Commission",
    description:
      "You keep 100% of your listed price. Travelers pay a reservation fee on top, directly to Into Nepal — it's never deducted from what you earn.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description:
      "Track your bookings, revenue, and customer insights with powerful analytics.",
  },
  {
    icon: Users,
    title: "Customer Support",
    description:
      "Dedicated partner support team to help you grow your business.",
  },
  {
    icon: Shield,
    title: "Verified Badge",
    description:
      "Earn traveler trust with our verified partner badge on all your listings.",
  },
  {
    icon: Star,
    title: "Featured Listings",
    description:
      "Get featured on our homepage and reach more potential customers.",
  },
];

const steps = [
  {
    step: 1,
    title: "Apply Online",
    description:
      "Fill out our simple application form with your agency details and license information.",
  },
  {
    step: 2,
    title: "Verification",
    description:
      "Our team verifies your license, insurance, and safety certifications.",
  },
  {
    step: 3,
    title: "Setup Profile",
    description:
      "Create your agency profile and start listing your activities.",
  },
  {
    step: 4,
    title: "Start Earning",
    description:
      "Receive bookings from travelers and grow your business.",
  },
];

export default function AgencyLanding() {
  const { reservation_fee_percent } = usePlatformSettings();
  // Live count of publicly-visible (approved) agencies — agencies_public_
  // select_approved RLS already scopes this to exactly that set for an
  // anon/unauthenticated caller, same guarantee usePublicAgencies() relies
  // on elsewhere. Replaces a hardcoded "150+ agencies" claim.
  const { data: agencyCount } = useQuery({
    queryKey: ["agencies", "public-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("agencies").select("id", { count: "exact", head: true });
      if (error) return null;
      return count ?? 0;
    },
    staleTime: 10 * 60 * 1000,
  });
  return (
    <Layout>
      <SEO title="Partner With Us" description="Join Into Nepal as a verified travel agency partner and reach travelers looking for authentic Nepal experiences." />
      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1920')] bg-cover bg-center" />
        </div>
        <div className="container relative z-10 mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block px-4 py-1.5 bg-secondary text-secondary-foreground text-sm font-medium rounded-full mb-6">
              Partner Program
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Grow Your Travel Business with Into Nepal
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              Join our network of verified agencies and reach thousands of travelers
              seeking authentic Nepal experiences. Easy onboarding, transparent
              commissions, and powerful tools.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/agency/onboarding">
                <Button variant="hero" size="xl">
                  Apply to Partner
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </Link>
              <Button variant="heroOutline" size="xl">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Partner With Us
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get everything you need to grow your travel business online
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <Card key={benefit.title} variant="elevated">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{benefit.title}</h3>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Keep 100% of Your Listed Price
              </h2>
              <p className="text-muted-foreground mb-8">
                We don't take a cut of your price. Travelers pay a small reservation fee on top of
                what you list, at checkout — you receive the full amount you set.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">{reservation_fee_percent}%</span>
                  </div>
                  <div>
                    <p className="font-semibold">Traveler Reservation Fee</p>
                    <p className="text-sm text-muted-foreground">
                      Paid by the traveler at checkout, on top of your listed price — not deducted from it
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-secondary">0%</span>
                  </div>
                  <div>
                    <p className="font-semibold">Your Commission</p>
                    <p className="text-sm text-muted-foreground">
                      You keep 100% of the price you set for every booking
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card p-8 rounded-2xl border border-border shadow-lg">
              <h3 className="text-xl font-semibold mb-6">What You Get</h3>
              <ul className="space-y-4">
                {[
                  "Listing on our marketplace",
                  "Booking management dashboard",
                  "Customer communication tools",
                  "Analytics and reporting",
                  "Secure payment processing",
                  "24/7 partner support",
                  "Marketing and promotion",
                  "Training resources",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How to Get Started
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join our partner network in four simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.step} className="relative">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Card className="bg-gradient-to-br from-primary via-primary to-sienna-dark text-primary-foreground border-0">
            <CardContent className="p-12 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Grow Your Business?
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
                {agencyCount != null && agencyCount > 0
                  ? `Join ${agencyCount} verified agencies already growing their business with Into Nepal. Apply today and start receiving bookings.`
                  : "Apply today and start receiving bookings from travelers looking for authentic Nepal experiences."}
              </p>
              <Link to="/agency/onboarding">
                <Button variant="hero" size="xl">
                  Apply to Partner
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </Layout>
  );
}
