import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Search, MapPin, CalendarDays, Users, Minus, Plus } from "lucide-react";
import { HeroBanner } from "@/components/home/HeroBanner";
import { RegionalCollections } from "@/components/home/RegionalCollections";
import { LocalExperiences } from "@/components/home/LocalExperiences";
import { SeasonalExpeditions } from "@/components/home/SeasonalExpeditions";
import { PartnerNetwork } from "@/components/home/PartnerNetwork";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Layout } from "@/components/layout/Layout";
import { usePublishedListings } from "@/lib/queries";
import type { Listing } from "@/stores/listingsStore";
import heroImage from "@/assets/hero-nepal.jpg";

const HERO_SLIDES = [
  { src: heroImage, alt: "Himalayan mountains at sunrise with prayer flags" },
  { src: "https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=1600&h=900&fit=crop", alt: "Dramatic snow-capped Himalayan peak" },
  { src: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1600&h=900&fit=crop", alt: "Wide alpine valley beneath snow-covered mountains" },
];

export default function Index() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const { data: listingsData } = usePublishedListings({ pageSize: 100 });
  const allListings = (listingsData?.listings ?? []) as Listing[];

  const handleHeroSearch = () => {
    const params = new URLSearchParams();
    if (destination.trim()) params.set("search", destination.trim());
    if (checkDate) params.set("date", checkDate);
    navigate(`/activities${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <Layout>
      <SEO
        title="Nepal Travel Experiences"
        description="Discover unforgettable treks, authentic homestays, and hidden Himalayan gems. Book with verified local agencies across Nepal."
      />

      {/* Hero */}
      <section className="pt-16 md:pt-20">
        <div className="relative h-[560px] md:h-[640px] overflow-hidden">
          <HeroBanner slides={HERO_SLIDES} />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-foreground/25 to-foreground/10" />

          <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
            <h1 className="font-serif italic text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-3xl">
              Find your next adventure
            </h1>
            <p className="text-white/85 text-base md:text-lg max-w-xl">
              Discover unforgettable treks, authentic homestays, and hidden Himalayan gems.
            </p>
          </div>
        </div>

        {/* Floating search bar */}
        <div className="container mx-auto px-4">
          <div className="relative -mt-8 md:-mt-9 z-10">
            <div className="bg-card rounded-2xl md:rounded-full shadow-lg border border-border max-w-4xl mx-auto flex flex-col md:flex-row items-stretch md:items-center divide-y md:divide-y-0 md:divide-x divide-border p-2">
              {/* Destination */}
              <div className="flex-1 flex items-center gap-3 px-4 py-2.5">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="hero-destination" className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Destination
                  </label>
                  <input
                    id="hero-destination"
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleHeroSearch()}
                    placeholder="Where are you going?"
                    className="w-full bg-transparent border-0 p-0 text-sm font-medium focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70 placeholder:font-normal"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="flex-1 flex items-center gap-3 px-4 py-2.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="hero-date" className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Dates
                  </label>
                  <input
                    id="hero-date"
                    type="date"
                    value={checkDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setCheckDate(e.target.value)}
                    className="w-full bg-transparent border-0 p-0 text-sm font-medium focus:outline-none focus:ring-0 [color-scheme:light]"
                  />
                </div>
              </div>

              {/* Travelers */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 rounded-xl transition-colors">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Travelers
                      </span>
                      <span className="block text-sm font-medium truncate">
                        {adults} adult{adults !== 1 ? "s" : ""} · {children} child{children !== 1 ? "ren" : ""}
                      </span>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Adults</p>
                        <p className="text-xs text-muted-foreground">Ages 13+</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setAdults((v) => Math.max(1, v - 1))}
                          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40"
                          disabled={adults <= 1}
                          aria-label="Decrease adults"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium">{adults}</span>
                        <button
                          type="button"
                          onClick={() => setAdults((v) => Math.min(20, v + 1))}
                          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                          aria-label="Increase adults"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Children</p>
                        <p className="text-xs text-muted-foreground">Ages 0–12</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setChildren((v) => Math.max(0, v - 1))}
                          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40"
                          disabled={children <= 0}
                          aria-label="Decrease children"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium">{children}</span>
                        <button
                          type="button"
                          onClick={() => setChildren((v) => Math.min(20, v + 1))}
                          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                          aria-label="Increase children"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="p-1.5 md:pl-2">
                <Button size="lg" className="w-full md:w-auto rounded-full h-12 px-8" onClick={handleHeroSearch}>
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RegionalCollections listings={allListings} />

      <LocalExperiences listings={allListings} />

      <SeasonalExpeditions />

      <PartnerNetwork listings={allListings} />

      <TestimonialsSection />
    </Layout>
  );
}
