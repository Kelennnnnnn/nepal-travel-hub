import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Search, MapPin } from "lucide-react";
import { HeroBanner } from "@/components/home/HeroBanner";
import { AdventureFramework } from "@/components/home/AdventureFramework";
import { FeaturedAdventures } from "@/components/home/FeaturedAdventures";
import { CommunityImpact } from "@/components/home/CommunityImpact";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { PartnerCTA } from "@/components/home/PartnerCTA";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Layout } from "@/components/layout/Layout";
import { usePublishedListings } from "@/lib/queries";
import { categories } from "@/data/activities";
import type { Listing } from "@/stores/listingsStore";
import heroImage from "@/assets/hero-nepal.jpg";

const HERO_SLIDES = [
  { src: heroImage, alt: "Himalayan mountains at sunrise with prayer flags" },
  { src: "https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=1600&h=900&fit=crop", alt: "Dramatic snow-capped Himalayan peak" },
  { src: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1600&h=900&fit=crop", alt: "Wide alpine valley beneath snow-covered mountains" },
];

const DIFFICULTIES = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];

const QUICK_PICKS = [
  { label: "High Passes", href: "/activities?difficulty=Challenging,Difficult,Expert" },
  { label: "Teahouse Treks", href: "/activities?category=Trekking" },
  { label: "Summit Peaks", href: "/activities?category=Mountaineering" },
  { label: "Sherpa Homestays", href: "/activities?category=Cultural" },
  { label: "Sun Kosi Rivers", href: "/activities?category=Rafting" },
];

export default function Index() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [activityCategory, setActivityCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");

  const { data: listingsData } = usePublishedListings({ pageSize: 100 });
  const allListings = (listingsData?.listings ?? []) as Listing[];

  const handleHeroSearch = () => {
    const params = new URLSearchParams();
    if (destination.trim()) params.set("search", destination.trim());
    if (activityCategory !== "all") params.set("category", activityCategory);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    navigate(`/activities${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <Layout>
      <SEO
        title="Nepal Travel Experiences"
        description="Discover unforgettable treks, authentic homestays, and hidden Himalayan gems. Book with verified local agencies across Nepal."
      />

      {/* Hero */}
      <section className="pt-24 md:pt-28">
        <div className="relative h-[600px] md:h-[680px] overflow-hidden">
          <HeroBanner slides={HERO_SLIDES} />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-foreground/20" />

          <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
            <span className="text-white/80 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mb-4">
              Authentic · Low Impact · Expert Sherpa Guides
            </span>
            <h1 className="font-serif italic text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-3xl">
              Epic, Responsible Adventures in the High Himalayas
            </h1>
            <p className="text-white/85 text-base md:text-lg max-w-xl mb-2">
              Join small, expert-led expeditions and authentic cultural treks crafted exclusively by verified local Nepali agencies.
            </p>
          </div>
        </div>

        {/* Floating search bar */}
        <div className="container mx-auto px-4">
          <div className="relative -mt-8 md:-mt-9 z-10">
            <div className="bg-card rounded-2xl md:rounded-full shadow-lg border border-border max-w-4xl mx-auto flex flex-col md:flex-row items-stretch md:items-center divide-y md:divide-y-0 md:divide-x divide-border p-2">
              {/* Where */}
              <div className="flex-1 flex items-center gap-3 px-4 py-2.5">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="hero-destination" className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Where
                  </label>
                  <input
                    id="hero-destination"
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleHeroSearch()}
                    placeholder="Everest, Annapurna, Mustang..."
                    className="w-full bg-transparent border-0 p-0 text-sm font-medium focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70 placeholder:font-normal"
                  />
                </div>
              </div>

              {/* Activity */}
              <div className="flex-1 px-4 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Activity
                </span>
                <Select value={activityCategory} onValueChange={setActivityCategory}>
                  <SelectTrigger className="h-auto border-0 p-0 shadow-none focus:ring-0 text-sm font-medium">
                    <SelectValue placeholder="All Activities" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Difficulty */}
              <div className="flex-1 px-4 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Difficulty
                </span>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="h-auto border-0 p-0 shadow-none focus:ring-0 text-sm font-medium">
                    <SelectValue placeholder="Any Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Level</SelectItem>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-1.5 md:pl-2">
                <Button size="lg" className="w-full md:w-auto rounded-full h-12 px-8" onClick={handleHeroSearch}>
                  <Search className="h-4 w-4" />
                  Explore Trips
                </Button>
              </div>
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-5">
              {QUICK_PICKS.map((pick) => (
                <a
                  key={pick.label}
                  href={pick.href}
                  onClick={(e) => { e.preventDefault(); navigate(pick.href); }}
                  className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors"
                >
                  {pick.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <AdventureFramework listings={allListings} />

      <FeaturedAdventures listings={allListings} />

      <CommunityImpact />

      <TestimonialsSection />

      <PartnerCTA />
    </Layout>
  );
}
