import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin,
  Clock,
  Users,
  Star,
  Calendar,
  Shield,
  Check,
  ChevronLeft,
  Share2,
  Heart,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/Layout";
import { mockActivities } from "@/data/activities";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";

export default function ActivityDetail() {
  const { id } = useParams();
  const activity = mockActivities.find((a) => a.id === id);
  const [selectedDate, setSelectedDate] = useState("");
  const [participants, setParticipants] = useState(1);

  if (!activity) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-2xl font-bold mb-4">Activity not found</h1>
          <Link to="/activities">
            <Button>Browse Activities</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const totalPrice = activity.price * participants;

  const handleBooking = () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    toast.success("Booking request submitted! You will receive confirmation shortly.");
  };

  const highlights = [
    "Professional English-speaking guides",
    "All necessary permits included",
    "Comfortable accommodation",
    "Meals as per itinerary",
    "Airport transfers",
    "24/7 emergency support",
  ];

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="pt-20 md:pt-24 bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/activities"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Activities
          </Link>
        </div>
      </div>

      {/* Hero Image */}
      <section className="relative h-[40vh] md:h-[50vh]">
        <img
          src={activity.image}
          alt={activity.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
        
        {/* Actions */}
        <div className="absolute top-4 right-4 flex gap-2">
          <Button variant="glass" size="icon">
            <Share2 className="h-5 w-5" />
          </Button>
          <Button variant="glass" size="icon">
            <Heart className="h-5 w-5" />
          </Button>
        </div>

        {/* Category Badge */}
        <div className="absolute bottom-4 left-4">
          <Badge className="bg-primary text-primary-foreground text-sm px-3 py-1">
            {activity.category}
          </Badge>
        </div>
      </section>

      {/* Content */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Title & Meta */}
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">
                  {activity.title}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
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
                    <span>Max {activity.maxParticipants} people</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-secondary text-secondary" />
                    <span className="font-medium text-foreground">
                      {activity.rating.toFixed(1)}
                    </span>
                    <span>({activity.reviewCount} reviews)</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold mb-4">About This Activity</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {activity.description}
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  Experience the magic of Nepal with our expert local guides who bring
                  decades of experience to ensure your adventure is safe, memorable, and
                  authentic. This carefully curated experience includes all necessary
                  equipment, permits, and support to make your journey seamless.
                </p>
              </div>

              {/* Highlights */}
              <div>
                <h2 className="text-xl font-semibold mb-4">What's Included</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {highlights.map((highlight) => (
                    <div key={highlight} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agency Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Operated by</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl font-bold text-primary">
                        {activity.agency.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{activity.agency}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Shield className="h-4 w-4 text-primary" />
                        <span>Verified Partner</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      View Profile
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Reviews Section */}
              <ReviewsSection activityId={activity.id} activityTitle={activity.title} />
            </div>

            {/* Booking Card */}
            <div className="lg:col-span-1">
              <Card variant="elevated" className="sticky top-24">
                <CardHeader>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl font-bold">${activity.price}</span>
                      <span className="text-muted-foreground"> / person</span>
                    </div>
                    <Badge variant="secondary">Instant Confirmation</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Date Selection */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Select Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="pl-10"
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>

                  {/* Participants */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Participants
                    </label>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setParticipants(Math.max(1, participants - 1))}
                        disabled={participants <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-xl font-semibold w-8 text-center">
                        {participants}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setParticipants(
                            Math.min(activity.maxParticipants, participants + 1)
                          )
                        }
                        disabled={participants >= activity.maxParticipants}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum {activity.maxParticipants} participants
                    </p>
                  </div>

                  {/* Total */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">
                        ${activity.price} × {participants} person{participants > 1 ? "s" : ""}
                      </span>
                      <span>${totalPrice}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span>${totalPrice}</span>
                    </div>
                  </div>

                  {/* Book Button */}
                  <Button
                    size="xl"
                    className="w-full"
                    onClick={handleBooking}
                  >
                    Book Now
                  </Button>

                  {/* Trust Badges */}
                  <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Shield className="h-4 w-4" />
                      <span>Secure Payment</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      <span>Free Cancellation</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
