import { CheckCircle2 } from "lucide-react";

const COMMITMENTS = [
  {
    title: "Porter Welfare Guarantee",
    description: "Strict 20kg weight limits, fair living wages, and mandatory high-altitude insurance for every support team member.",
  },
  {
    title: "Zero Single-Use Plastic Policy",
    description: "Our partner operators provide purified water stations and leave no-trace waste transport policies on every route.",
  },
  {
    title: "Authentic Family-Run Teahouse Revenue",
    description: "We book direct with independent, family-run mountain lodges instead of large corporate chains, keeping your spend in the villages you pass through.",
  },
];

const COVER_IMAGE = "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1000&h=1200&fit=crop";

export function CommunityImpact() {
  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="relative rounded-2xl overflow-hidden min-h-[360px] lg:min-h-[480px]">
            <img
              src={COVER_IMAGE}
              alt="Local Sherpa community member in a Himalayan village"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-xs bg-card rounded-xl p-4 shadow-lg border border-border">
              <p className="text-sm italic text-foreground/85 mb-2">
                "When you travel with Into Nepal, your money stays in our village — supporting local schools and high-altitude medical posts."
              </p>
              <p className="text-xs font-semibold">Nima Lhamo Sherpa</p>
              <p className="text-xs text-muted-foreground">Lead Expedition Guide · Solukhumbu</p>
            </div>
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Responsible Mountaineering
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-4">
              Adventure Tourism That Truly Honors the Mountain Communities
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl">
              Traditional international trekking booking channels often strip up to 50% of your booking fee in overseas agency margins. Into Nepal directly links conscientious global adventurers with licensed, locally-owned trekking agencies.
            </p>

            <div className="space-y-4">
              {COMMITMENTS.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
