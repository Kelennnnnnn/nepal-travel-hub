import { Link } from "react-router-dom";
import { Flower2, Sun, ArrowRight } from "lucide-react";

const SEASONS = [
  {
    icon: Flower2,
    range: "March – May",
    title: "Spring Rhododendron Treks",
    description: "Witness the lower hills explode in vibrant colors as ancient rhododendron forests bloom beneath clear morning skies.",
    href: "/activities?category=Trekking",
    cta: "View Spring Treks",
    tint: "bg-rose-50 text-rose-500",
  },
  {
    icon: Sun,
    range: "Sept – Nov",
    title: "Autumn Clear Sky Summits",
    description: "The most stable weather of the year offers unparalleled, crystal-clear views of the highest peaks on earth.",
    href: "/activities?category=Mountaineering",
    cta: "View Autumn Treks",
    tint: "bg-amber-50 text-amber-500",
  },
];

export function SeasonalExpeditions() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="bg-muted/40 rounded-2xl p-6 md:p-10">
          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Seasonal Expeditions</h2>
            <p className="text-muted-foreground">Timing is everything. Find the best routes for the current season.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {SEASONS.map((season) => (
              <div key={season.title} className="bg-card rounded-xl p-6 border border-border flex flex-col">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${season.tint}`}>
                  <season.icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                  {season.range}
                </span>
                <h3 className="text-lg font-bold mb-2">{season.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{season.description}</p>
                <Link
                  to={season.href}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline group w-fit"
                >
                  {season.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
