import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Search, ChevronRight, Shield, Users, Clock } from "lucide-react";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/layout/Layout";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { categories } from "@/data/activities";
import { usePublishedListings } from "@/lib/queries";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import type { Listing } from "@/stores/listingsStore";
import type { Activity } from "@/components/activities/ActivityCard";
import heroImage from "@/assets/hero-nepal.jpg";

// Map a Listing (from DB) to the Activity shape expected by ActivityCard
function listingToActivity(listing: Listing): Activity {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    image: listing.images?.[0] || FALLBACK_IMAGE_URL,
    location: listing.location,
    duration: listing.duration,
    price: Number(listing.price),
    rating: Number(listing.rating),
    reviewCount: listing.review_count,
    category: listing.category,
    agency: listing.agency_id,
    maxParticipants: listing.max_participants,
    featured: listing.featured,
  };
}

const stats = [
  { value: "500+", label: "Activities" },
  { value: "150+", label: "Partner Agencies" },
  { value: "50k+", label: "Happy Travelers" },
  { value: "4.8", label: "Average Rating" },
];

export default function Index() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: listingsData } = usePublishedListings({ pageSize: 20 });
  const allListings = (listingsData?.listings ?? []) as Listing[];

  const featuredActivities = allListings.filter((l) => l.featured).map(listingToActivity);

  const handleHeroSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/activities?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate("/activities");
    }
  };

  return (
    <Layout>
      <SEO
        title="Nepal Travel Experiences"
        description="Book authentic Nepal trekking, rafting, cultural tours and adventures with verified local agencies. Best prices, instant confirmation."
      />
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Himalayan mountains with prayer flags"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/50 to-transparent" />
        </div>

        {/* Content */}
        <div className="container relative z-10 mx-auto px-4 py-20 md:py-32">
          <div className="max-w-2xl animate-fade-in">
            <span className="inline-block px-4 py-1.5 bg-secondary/90 text-secondary-foreground text-sm font-medium rounded-full mb-6">
              Trusted by 50,000+ Travelers
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-serif italic text-primary-foreground mb-6 leading-tight">
              Discover Authentic Nepal Adventures
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-xl">
              Connect with verified local agencies for unforgettable trekking, cultural tours, and adventure experiences across the Himalayas.
            </p>

            {/* Search Box */}
            <div className="bg-card/95 backdrop-blur-xl rounded-2xl p-4 shadow-lg max-w-xl animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="What adventure are you looking for?"
                    className="pl-10 h-12 border-0 bg-muted"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleHeroSearch()}
                  />
                </div>
                <Button size="lg" className="h-12" onClick={handleHeroSearch}>
                  Search Activities
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-sm text-muted-foreground">Popular:</span>
                {["Everest Trek", "Pokhara", "Safari", "Rafting"].map((tag) => (
                  <Link
                    key={tag}
                    to={`/activities?search=${tag}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 py-6">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Explore by Category</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From high-altitude treks to cultural immersions, find your perfect Nepal experience.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/activities?category=${category.id}`}
                className="group p-6 bg-card rounded-xl border border-border hover:border-primary hover:shadow-md transition-all duration-300 text-center"
              >
                <span className="text-4xl mb-3 block">{category.icon}</span>
                <span className="font-medium group-hover:text-primary transition-colors">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Activities */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Featured Adventures</h2>
              <p className="text-muted-foreground">Handpicked experiences loved by travelers</p>
            </div>
            <Link to="/activities">
              <Button variant="outline" className="group">
                View All Activities
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
          
          {featuredActivities.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {featuredActivities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allListings.slice(0, 3).map(listingToActivity).map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </section>

      <HowItWorksSection />

      <TestimonialsSection />

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-primary via-primary to-sienna-dark text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Explore Nepal?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join thousands of travelers who have discovered the magic of Nepal through our verified local agencies.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/activities">
              <Button variant="hero" size="xl">
                Browse Activities
              </Button>
            </Link>
            <Link to="/agency">
              <Button variant="heroOutline" size="xl">
                Partner With Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* For Agencies CTA */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="bg-card rounded-2xl p-8 md:p-12 border border-border shadow-sm">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full mb-4">
                  For Travel Agencies
                </span>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Grow Your Business with NepalTrails
                </h2>
                <p className="text-muted-foreground mb-6">
                  Join our network of verified agencies and reach thousands of travelers seeking authentic Nepal experiences. Easy onboarding, transparent commissions, and powerful tools to manage your listings.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <span>Global Reach</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <span>Secure Payments</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <span>24/7 Support</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center md:justify-end">
                <Link to="/agency">
                  <Button size="xl" className="shadow-lg">
                    Apply to Partner
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
