import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Users, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePublicAgencies, type PublishedListingRow } from "@/lib/queries";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import { formatPrice } from "@/lib/currency";

type TabKey = "all" | "best-sellers" | "remote" | "cultural";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Treks" },
  { key: "best-sellers", label: "Best Sellers" },
  { key: "remote", label: "Remote & Untouched" },
  { key: "cultural", label: "Cultural Homestays" },
];

function matchesTab(listing: PublishedListingRow, tab: TabKey): boolean {
  switch (tab) {
    case "best-sellers":
      return listing.featured || listing.review_count >= 20;
    case "remote":
      return listing.category === "Wildlife" || listing.category === "Mountaineering" || listing.difficulty === "Expert";
    case "cultural":
      return listing.category === "Cultural";
    default:
      return true;
  }
}

interface FeaturedAdventuresProps {
  listings: PublishedListingRow[];
}

export function FeaturedAdventures({ listings }: FeaturedAdventuresProps) {
  const [tab, setTab] = useState<TabKey>("all");
  const { data: agencyMap = {} } = usePublicAgencies(listings.map((l) => l.agency_id));

  const filtered = useMemo(() => {
    return listings
      .filter((l) => matchesTab(l, tab))
      .sort((a, b) => b.rating * b.review_count - a.rating * a.review_count)
      .slice(0, 6);
  }, [listings, tab]);

  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Curated Himalayan Collections
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">Featured Small Group Adventures</h2>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No adventures published in this collection yet — check back soon.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((listing) => {
              const agency = agencyMap[listing.agency_id];
              return (
                <Link
                  key={listing.id}
                  to={`/activities/${listing.id}`}
                  className="group rounded-2xl overflow-hidden border border-border bg-card hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[0_4px_12px_rgba(23,34,46,.08)] transition-all duration-200 flex flex-col"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={listing.images?.[0] || FALLBACK_IMAGE_URL}
                      alt={listing.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <Badge className="absolute top-3 left-3 bg-foreground/80 text-white text-[10px] px-2 py-0.5">
                      Level {listing.difficulty}
                    </Badge>
                    {listing.featured && (
                      <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">Best Seller</Badge>
                    )}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-md px-2 py-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-white">{Number(listing.rating).toFixed(1)}</span>
                      <span className="text-[10px] text-white/65">({listing.review_count})</span>
                    </div>
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] text-white">
                      <Users className="h-3 w-3" />
                      {listing.max_participants}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <p className="text-xs text-muted-foreground mb-1">{listing.duration} · {listing.location}</p>
                    <h3 className="font-bold leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {listing.title}
                    </h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                      Led by {agency?.name || "a verified local agency"}
                      {agency && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    </p>
                    <div className="mt-auto flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">From</span>
                        <span className="text-lg font-bold">{formatPrice(Number(listing.price))}</span>
                        <span className="text-xs text-muted-foreground"> / person</span>
                      </div>
                      <Button size="sm" className="rounded-full">View Trek</Button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link to="/activities">
            <Button variant="outline" size="lg" className="rounded-full">
              Browse All Verified Expeditions
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
