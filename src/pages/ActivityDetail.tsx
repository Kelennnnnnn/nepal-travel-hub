import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin,
  Clock,
  Users,
  Star,
  Calendar,
  Shield,
  ShieldCheck,
  Check,
  ChevronLeft,
  Share2,
  Heart,
  Minus,
  Plus,
  Loader2,
  X,
  Mail,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { useListingsStore } from "@/stores/listingsStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentListing: listing, isLoadingPublished, fetchListingById } = useListingsStore();
  const { user, isAuthenticated } = useAuthStore();

  const [selectedDate, setSelectedDate] = useState("");
  const [participants, setParticipants] = useState(1);
  const [travelerName, setTravelerName] = useState("");
  const [travelerEmail, setTravelerEmail] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [agencyName, setAgencyName] = useState("");

  // Fetch listing on mount
  useEffect(() => {
    if (id) {
      fetchListingById(id);
    }
  }, [id, fetchListingById]);

  // Pre-fill name and email from auth user
  useEffect(() => {
    if (user) {
      setTravelerName(user.name || "");
      setTravelerEmail(user.email || "");
    }
  }, [user]);

  // Fetch agency name when listing loads
  useEffect(() => {
    if (listing?.agency_id) {
      supabase
        .from("agency_applications")
        .select("company_name")
        .eq("user_id", listing.agency_id)
        .eq("status", "verified")
        .maybeSingle()
        .then(({ data }) => {
          if (data?.company_name) setAgencyName(data.company_name);
        });
    }
  }, [listing?.agency_id]);

  // Loading state
  if (isLoadingPublished) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading activity details…</p>
        </div>
      </Layout>
    );
  }

  // Not found
  if (!listing) {
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

  const price = Number(listing.price);
  const rating = Number(listing.rating);
  const maxParticipants = listing.max_participants;
  const totalPrice = price * participants;
  const heroImage = listing.images?.[0] || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop";

  const handleBooking = async () => {
    // Validate inputs
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    if (participants < 1) {
      toast.error("Please add at least 1 participant");
      return;
    }
    if (!travelerName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!travelerEmail.trim() || !travelerEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Check authentication
    if (!isAuthenticated || !user) {
      toast.error("Please log in to book this activity");
      navigate(`/login?redirect=/activities/${id}`);
      return;
    }

    setIsBooking(true);

    try {
      // Call Edge Function to create payment intent + booking
      const { data, error } = await supabase.functions.invoke(
        "create-payment-intent",
        {
          body: {
            listing_id: listing.id,
            agency_id: listing.agency_id,
            traveler_id: user.id,
            trip_date: selectedDate,
            guests: participants,
            price_per_person: price,
            total_amount: totalPrice,
            traveler_name: travelerName.trim(),
            traveler_email: travelerEmail.trim(),
          },
        }
      );

      if (error) {
        toast.error(error.message || "Failed to create booking. Please try again.");
        setIsBooking(false);
        return;
      }

      const { clientSecret, bookingId } = data;

      if (!clientSecret || !bookingId) {
        toast.error("Invalid response from server. Please try again.");
        setIsBooking(false);
        return;
      }

      // Navigate to payment page
      navigate(
        `/booking/payment?clientSecret=${encodeURIComponent(clientSecret)}&bookingId=${encodeURIComponent(bookingId)}`
      );
    } catch (err) {
      console.error("Booking error:", err);
      toast.error("Something went wrong. Please try again.");
      setIsBooking(false);
    }
  };

  // Use includes from the listing, fallback to generic highlights
  const highlights = listing.includes?.length > 0
    ? listing.includes
    : [
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
          src={heroImage}
          alt={listing.title}
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
            {listing.category}
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
                  {listing.title}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{listing.location}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{listing.duration}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>Max {maxParticipants} people</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-secondary text-secondary" />
                    <span className="font-medium text-foreground">
                      {rating.toFixed(1)}
                    </span>
                    <span>({listing.review_count} reviews)</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold mb-4">About This Activity</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {listing.description}
                </p>
                {listing.difficulty && (
                  <p className="text-muted-foreground leading-relaxed mt-4">
                    <span className="font-medium text-foreground">Difficulty:</span> {listing.difficulty}
                  </p>
                )}
              </div>

              {/* What's Included */}
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

              {/* What's Excluded */}
              {listing.excludes?.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Not Included</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {listing.excludes.map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                          <X className="h-4 w-4 text-destructive" />
                        </div>
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itinerary */}
              {listing.itinerary && (listing.itinerary as Record<string, unknown>[]).length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Itinerary</h2>
                  <div className="space-y-4">
                    {(listing.itinerary as Record<string, unknown>[]).map((item, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                            {(item.day as number) || i + 1}
                          </div>
                          {i < (listing.itinerary as Record<string, unknown>[]).length - 1 && (
                            <div className="w-px flex-1 bg-border mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <h3 className="font-medium">{item.title as string}</h3>
                          <p className="text-sm text-muted-foreground">{item.description as string}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agency Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Operated by</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl font-bold text-primary">
                        {agencyName
                          ? agencyName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
                          : "A"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {agencyName || "Verified Agency"}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span>Verified Partner</span>
                      </div>
                    </div>
                    <Link to={`/agency/profile/${listing.agency_id}`}>
                      <Button variant="outline" size="sm">
                        View Profile
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Reviews Section */}
              <ReviewsSection activityId={listing.id} activityTitle={listing.title} />
            </div>

            {/* Booking Card */}
            <div className="lg:col-span-1">
              <Card variant="elevated" className="sticky top-24">
                <CardHeader>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl font-bold">${price}</span>
                      <span className="text-muted-foreground"> / person</span>
                    </div>
                    <Badge variant="secondary">Instant Confirmation</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Date Selection */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Select Date
                    </Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="pl-10"
                        min={new Date().toISOString().split("T")[0]}
                        disabled={isBooking}
                      />
                    </div>
                  </div>

                  {/* Participants */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Participants
                    </Label>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setParticipants(Math.max(1, participants - 1))}
                        disabled={participants <= 1 || isBooking}
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
                            Math.min(maxParticipants, participants + 1)
                          )
                        }
                        disabled={participants >= maxParticipants || isBooking}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum {maxParticipants} participants
                    </p>
                  </div>

                  {/* Traveler Info */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Your full name"
                          value={travelerName}
                          onChange={(e) => setTravelerName(e.target.value)}
                          className="pl-10"
                          disabled={isBooking}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          value={travelerEmail}
                          onChange={(e) => setTravelerEmail(e.target.value)}
                          className="pl-10"
                          disabled={isBooking}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">
                        ${price} × {participants} person{participants > 1 ? "s" : ""}
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
                    disabled={isBooking}
                  >
                    {isBooking ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Processing…
                      </>
                    ) : (
                      "Book Now"
                    )}
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
