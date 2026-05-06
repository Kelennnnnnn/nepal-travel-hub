import { Link } from "react-router-dom";
import {
  Mountain,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";

const benefits = [
  {
    icon: Globe,
    title: "Global Reach",
    description:
      "Connect with travelers from around the world looking for authentic Nepal experiences.",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description:
      "Receive payments directly to your account with transparent commission structure.",
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

const testimonials = [
  {
    quote:
      "NepalTrails has transformed our business. We now reach customers we never could before.",
    author: "Ram Thapa",
    role: "Owner, Himalayan Expeditions",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
  },
  {
    quote:
      "The platform is easy to use and the support team is always there when we need help.",
    author: "Sunita Gurung",
    role: "Manager, Sky Riders Nepal",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
  },
];

export default function AgencyLanding() {
  return (
    <Layout>
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
              Grow Your Travel Business with NepalTrails
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

      {/* Commission Structure */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Transparent Commission Structure
              </h2>
              <p className="text-muted-foreground mb-8">
                We believe in fair and transparent pricing. Our commission is simple
                and straightforward - you keep most of what you earn.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">15%</span>
                  </div>
                  <div>
                    <p className="font-semibold">Standard Commission</p>
                    <p className="text-sm text-muted-foreground">
                      For all confirmed bookings
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-secondary">12%</span>
                  </div>
                  <div>
                    <p className="font-semibold">Premium Partners</p>
                    <p className="text-sm text-muted-foreground">
                      For agencies with 50+ bookings/month
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

      {/* Testimonials */}
      <section className="py-16 md:py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              What Our Partners Say
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.author}
                className="p-8 rounded-2xl bg-primary-foreground/10"
              >
                <p className="text-lg mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-4">
                  <img
                    src={testimonial.image}
                    alt={testimonial.author}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-semibold">{testimonial.author}</p>
                    <p className="text-sm text-primary-foreground/70">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
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
                Join 150+ verified agencies already growing their business with
                NepalTrails. Apply today and start receiving bookings.
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
