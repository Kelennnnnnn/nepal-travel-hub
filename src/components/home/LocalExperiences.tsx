import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Listing, ListingCategory } from "@/stores/listingsStore";

const TEAHOUSE_IMAGE = "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=800&h=600&fit=crop";
const HOMESTAY_IMAGE = "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&h=600&fit=crop";
const ARTISAN_IMAGE = "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=600&fit=crop";

interface Experience {
  title: string;
  description: string;
  image: string;
  category: ListingCategory;
  href: string;
}

const EXPERIENCES: Experience[] = [
  {
    title: "Teahouse Traditions",
    description: "Warm wood fires, local textiles, and stunning Everest views while sipping traditional butter tea.",
    image: TEAHOUSE_IMAGE,
    category: "Trekking",
    href: "/activities?category=Trekking",
  },
  {
    title: "Cultural Homestays",
    description: "Share authentic meals and joyful interactions with local Nepali guides in vibrant village squares.",
    image: HOMESTAY_IMAGE,
    category: "Cultural",
    href: "/activities?category=Cultural",
  },
  {
    title: "Artisan Workshops",
    description: "Learn traditional Thangka painting or pottery from master craftsmen in the heart of Kathmandu.",
    image: ARTISAN_IMAGE,
    category: "Cultural",
    href: "/activities?category=Cultural&search=workshop",
  },
];

interface LocalExperiencesProps {
  listings: Listing[];
}

export function LocalExperiences({ listings }: LocalExperiencesProps) {
  const statsFor = (category: ListingCategory) => {
    const matches = listings.filter((l) => l.category === category);
    const totalReviews = matches.reduce((sum, l) => sum + (l.review_count || 0), 0);
    const weighted = matches.reduce((sum, l) => sum + l.rating * (l.review_count || 0), 0);
    const avgRating = totalReviews > 0 ? weighted / totalReviews : null;
    return { avgRating, totalReviews };
  };

  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-2">Local Experiences</h2>
          <p className="text-muted-foreground">Immerse yourself in the daily rhythms of Himalayan life.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {EXPERIENCES.map((exp, i) => {
            const { avgRating, totalReviews } = statsFor(exp.category);
            return (
              <Link
                key={exp.title}
                to={exp.href}
                className="group rounded-2xl overflow-hidden border border-border bg-card hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[0_4px_12px_rgba(23,34,46,.08)] transition-all duration-200 block"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={exp.image}
                    alt={exp.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {i === 0 && (
                    <Badge variant="urgent" className="absolute top-3 right-3">Highly Rated</Badge>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-1">{exp.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{exp.description}</p>
                  {avgRating != null ? (
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 fill-primary text-primary" />
                      <span className="font-semibold">{avgRating.toFixed(1)}</span>
                      <span className="text-muted-foreground">({totalReviews} reviews)</span>
                    </div>
                  ) : (
                    <span className="text-sm text-primary font-medium">New on Into Nepal</span>
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
