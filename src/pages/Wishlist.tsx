import { Layout } from "@/components/layout/Layout";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWishlistIds } from "@/hooks/useWishlist";
import { supabase } from "@/lib/supabase";
import type { Listing } from "@/stores/listingsStore";
import type { Activity } from "@/components/activities/ActivityCard";

function listingToActivity(listing: Listing): Activity {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    image: listing.images?.[0] || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop",
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

export default function Wishlist() {
  const { data: wishlistIds = new Set<string>(), isLoading: isLoadingIds } = useWishlistIds();

  const ids = Array.from(wishlistIds);

  const { data: listings = [], isLoading: isLoadingListings } = useQuery({
    queryKey: ["wishlist-listings", ids],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .in("id", ids)
        .eq("status", "published");
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
    enabled: ids.length > 0,
  });

  const isLoading = isLoadingIds || isLoadingListings;
  const activities = listings.map(listingToActivity);

  return (
    <Layout>
      <div className="pt-24 md:pt-32 pb-16">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold mb-2">Saved Activities</h1>
          <p className="text-muted-foreground mb-8">
            {isLoading ? "Loading…" : `${activities.length} saved activity${activities.length !== 1 ? "s" : ""}`}
          </p>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[4/3] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Heart className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No saved activities yet</h3>
              <p className="text-muted-foreground mb-6">
                Tap the heart icon on any activity to save it here.
              </p>
              <Link to="/activities">
                <Button>Browse Activities</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
