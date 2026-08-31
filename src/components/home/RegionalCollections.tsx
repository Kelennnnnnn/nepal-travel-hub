import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Listing } from "@/stores/listingsStore";

interface Region {
  title: string;
  subtitle: string;
  href: string;
  image: string;
  count: number;
  featured?: boolean;
}

const VALLEY_IMAGE = "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1200&h=900&fit=crop";
const LAKESIDE_IMAGE = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop";
const HERITAGE_IMAGE = "https://images.unsplash.com/photo-1571401835393-8c5f35328320?w=800&h=600&fit=crop";

interface RegionalCollectionsProps {
  listings: Listing[];
}

export function RegionalCollections({ listings }: RegionalCollectionsProps) {
  const countBy = (predicate: (l: Listing) => boolean) => listings.filter(predicate).length;

  const regions: Region[] = [
    {
      title: "Hidden Gems of the Valleys",
      subtitle: "Venture beyond the main trails to discover vibrant festivals, ancient stone houses, and deep green valleys untouched by mass tourism.",
      href: "/activities?category=Cultural",
      image: VALLEY_IMAGE,
      count: countBy((l) => l.category === "Cultural"),
      featured: true,
    },
    {
      title: "Lakeside Tranquility",
      subtitle: "Pokhara & Surrounds",
      href: "/activities?location=Pokhara",
      image: LAKESIDE_IMAGE,
      count: countBy((l) => l.location?.toLowerCase().includes("pokhara")),
    },
    {
      title: "Sacred Heritage",
      subtitle: "Kathmandu Temples",
      href: "/activities?location=Kathmandu",
      image: HERITAGE_IMAGE,
      count: countBy((l) => l.location?.toLowerCase().includes("kathmandu")),
    },
  ];

  const [featured, ...rest] = regions;

  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-2">Regional Collections</h2>
          <p className="text-muted-foreground">Explore areas steeped in ancient traditions and raw natural beauty.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Featured large card */}
          <Link
            to={featured.href}
            className="group relative lg:col-span-2 rounded-2xl overflow-hidden min-h-[320px] lg:min-h-[420px] block"
          >
            <img
              src={featured.image}
              alt={featured.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-6 md:p-8">
              <Badge variant="urgent" className="w-fit mb-4">Featured Region</Badge>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">{featured.title}</h3>
              <p className="text-white/80 max-w-md mb-4">{featured.subtitle}</p>
              <span className="inline-flex items-center gap-2 text-white font-medium">
                <Compass className="h-4 w-4" />
                {featured.count > 0 ? `Explore ${featured.count} authentic itineraries` : "Explore authentic itineraries"}
              </span>
            </div>
          </Link>

          {/* Stacked smaller cards */}
          <div className="flex flex-col gap-4">
            {rest.map((region) => (
              <Link
                key={region.title}
                to={region.href}
                className="group relative rounded-2xl overflow-hidden flex-1 min-h-[150px] md:min-h-[198px] block"
              >
                <img
                  src={region.image}
                  alt={region.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/20 to-transparent" />
                <div className="relative h-full flex flex-col justify-end p-5">
                  <h3 className="text-lg font-bold text-white">{region.title}</h3>
                  <p className="text-white/75 text-sm">{region.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
