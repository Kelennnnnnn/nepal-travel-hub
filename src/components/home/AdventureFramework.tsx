import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ListingDifficulty } from "@/stores/listingsStore";
import type { PublishedListingRow } from "@/lib/queries";

interface Level {
  levels: string;
  title: string;
  description: string;
  difficulties: ListingDifficulty[];
  popular?: boolean;
}

const LEVELS: Level[] = [
  {
    levels: "Level 1–2",
    title: "Gentle & Cultural",
    description: "Moderate day walks on defined paths. Comfortable heritage teahouses and scenic village landscapes.",
    difficulties: ["Easy"],
  },
  {
    levels: "Level 3–4",
    title: "Active Moderate",
    description: "Sustained uphill terrain with rocky stone stairs and good baseline fitness required.",
    difficulties: ["Moderate"],
  },
  {
    levels: "Level 5–6",
    title: "Challenging Trek",
    description: "Glacial moraines, sub-zero nights, and each-day high altitude ascent from teahouse trekking recommended.",
    difficulties: ["Challenging"],
    popular: true,
  },
  {
    levels: "Level 7",
    title: "Tough & Alpine",
    description: "Remote wilderness camping on ice, snow, and sustained high-altitude exertion in severe mountain environments.",
    difficulties: ["Difficult", "Expert"],
  },
];

interface AdventureFrameworkProps {
  listings: PublishedListingRow[];
}

export function AdventureFramework({ listings }: AdventureFrameworkProps) {
  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Much Better Adventure Framework
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              Different Levels. All Epic Expeditions.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Every expedition is graded by physical stamina, elevation gain, and terrain technicality so you can find your next challenge.
            </p>
          </div>
          <Link
            to="/activities"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline shrink-0"
          >
            Learn how we grade treks
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {LEVELS.map((level) => {
            const matches = listings.filter((l) => level.difficulties.includes(l.difficulty));
            const example = matches[0];
            return (
              <Link
                key={level.levels}
                to={`/activities?difficulty=${level.difficulties.join(",")}`}
                className="group relative bg-card rounded-2xl border border-border p-5 flex flex-col hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[0_4px_12px_rgba(23,34,46,.08)] transition-all duration-200"
              >
                {level.popular && (
                  <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground">Most Popular</Badge>
                )}
                <span className="text-xs font-bold uppercase tracking-wide text-primary mb-3">
                  {level.levels}
                </span>
                <h3 className="font-bold text-lg mb-2">{level.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{level.description}</p>
                <div className="text-xs text-muted-foreground border-t border-border pt-3">
                  {matches.length > 0 ? (
                    <>
                      {matches.length} {matches.length === 1 ? "expedition" : "expeditions"} available
                      {example ? <span className="block truncate mt-0.5 font-medium text-foreground/80">{example.location}</span> : null}
                    </>
                  ) : (
                    "View eligible expeditions"
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
