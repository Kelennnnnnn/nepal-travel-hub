import { Link } from "react-router-dom";
import { MapPin, Clock, Star, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  return (
    <Link to={`/activities/${activity.id}`}>
      <Card variant="activity" className={cn("h-full", className)}>
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={activity.image}
            alt={activity.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
          
          {/* Category Badge */}
          <Badge className="absolute top-4 left-4 bg-primary text-primary-foreground">
            {activity.category}
          </Badge>
          
          {/* Featured Badge */}
          {activity.featured && (
            <Badge className="absolute top-4 right-4 bg-secondary text-secondary-foreground">
              Featured
            </Badge>
          )}
          
          {/* Price */}
          <div className="absolute bottom-4 right-4">
            <div className="bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <span className="text-lg font-bold text-foreground">${activity.price}</span>
              <span className="text-sm text-muted-foreground">/person</span>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
            {activity.title}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {activity.description}
          </p>
          
          {/* Meta Info */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{activity.location}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{activity.duration}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>Max {activity.maxParticipants}</span>
            </div>
          </div>
          
          {/* Rating & Agency */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-secondary text-secondary" />
              <span className="font-medium">{activity.rating.toFixed(1)}</span>
              <span className="text-muted-foreground">({activity.reviewCount})</span>
            </div>
            <span className="text-sm text-muted-foreground">by {activity.agency}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
