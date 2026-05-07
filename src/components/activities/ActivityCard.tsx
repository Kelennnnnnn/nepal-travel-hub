import { Link } from "react-router-dom";
import { MapPin, Clock, Star, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWishlistIds, useToggleWishlist } from "@/hooks/useWishlist";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export interface Activity {
  id: string;
  title: string;
  description: string;
  image: string;
  location: string;
  duration: string;
  price: number;
  rating: number;
  reviewCount: number;
  category: string;
  agency: string;
  maxParticipants: number;
  featured?: boolean;
}

interface ActivityCardProps {
  activity: Activity;
  className?: string;
}

export function ActivityCard({ activity, className }: ActivityCardProps) {
  const { isAuthenticated } = useAuthStore();
  const { data: wishlistIds = new Set<string>() } = useWishlistIds();
  const { mutate: toggleWishlist, isPending } = useToggleWishlist();
  const isSaved = wishlistIds.has(activity.id);

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Please log in to save activities.");
      return;
    }
    toggleWishlist({ listingId: activity.id, isSaved });
  };

  return (
    <Link to={`/activities/${activity.id}`} className="block h-full">
      <Card variant="activity" className={cn("h-full flex flex-col", className)}>
        {/* Image — 16:9 keeps the card compact */}
        <div className="relative aspect-video overflow-hidden flex-shrink-0">
          <img
            src={activity.image}
            alt={activity.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

          {/* Category */}
          <Badge className="absolute top-2.5 left-2.5 bg-primary/95 text-primary-foreground text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wide rounded-md">
            {activity.category}
          </Badge>

          {activity.featured && (
            <Badge className="absolute top-2.5 right-9 bg-secondary text-secondary-foreground text-[10px] px-2 py-0.5 rounded-md">
              Featured
            </Badge>
          )}

          {/* Wishlist */}
          <button
            onClick={handleWishlist}
            disabled={isPending}
            aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center hover:bg-black/65 transition-colors"
          >
            <Heart
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                isSaved ? "fill-red-400 text-red-400" : "text-white"
              )}
            />
          </button>

          {/* Price — bottom left */}
          <div className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur-sm rounded-md px-2 py-1 leading-none">
            <span className="text-sm font-bold text-white">${activity.price}</span>
            <span className="text-[10px] text-white/70"> /person</span>
          </div>

          {/* Rating — bottom right */}
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-md px-2 py-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold text-white">{activity.rating.toFixed(1)}</span>
            <span className="text-[10px] text-white/65">({activity.reviewCount})</span>
          </div>
        </div>

        {/* Content */}
        <CardContent className="p-3 flex flex-col flex-1">
          <h3 className="font-semibold text-sm leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {activity.title}
          </h3>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground/70" />
              <span className="truncate">{activity.location}</span>
            </span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3 text-muted-foreground/70" />
              {activity.duration}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground/60 mt-1.5 truncate">by {activity.agency}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
