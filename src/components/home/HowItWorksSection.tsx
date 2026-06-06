import { Search, Shield, Award } from "lucide-react";

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: "Discover",
    description: "Browse hundreds of authentic Nepal experiences curated by verified local agencies.",
  },
  {
    icon: Shield,
    title: "Book Securely",
    description: "Complete your booking with instant confirmation and secure payment processing.",
  },
  {
    icon: Award,
    title: "Experience",
    description: "Enjoy your adventure with expert local guides who know Nepal best.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 md:py-20 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How NepalTrails Works</h2>
          <p className="text-primary-foreground/80 max-w-2xl mx-auto">
            Book your Nepal adventure in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {HOW_IT_WORKS.map((step, index) => (
            <div key={step.title} className="text-center group">
              <div className="relative inline-flex items-center justify-center w-20 h-20 bg-primary-foreground/10 rounded-2xl mb-6 group-hover:bg-primary-foreground/20 transition-colors">
                <step.icon className="h-8 w-8" />
                <span className="absolute -top-2 -right-2 w-8 h-8 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-primary-foreground/70">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
