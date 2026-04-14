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
import { ActivityCard } from "@/components/activities/ActivityCard";
import type { Activity } from "@/components/activities/ActivityCard";
import { useListingsStore } from "@/stores/listingsStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { useWishlistIds, useToggleWishlist } from "@/hooks/useWishlist";
import { startConversation } from "@/hooks/useMessages";
import { SEO } from "@/components/SEO";
import { Helmet } from "react-helmet-async";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";

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

  const { data: wishlistIds = new Set<string>() } = useWishlistIds();
  const { mutate: toggleWishlist, isPending: isTogglingWishlist } = useToggleWishlist();

  const [askDialogOpen, setAskDialogOpen] = useState(false);
  const [askMessage, setAskMessage] = useState("");
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);

  const [availableSpots, setAvailableSpots] = useState<number | null>(null);
  const [availabilityId, setAvailabilityId] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [relatedActivities, setRelatedActivities] = useState<Activity[]>([]);

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

  // Check availability when date changes
  useEffect(() => {
    if (!listing?.id || !selectedDate) {
      setAvailableSpots(null);
      setAvailabilityId(null);
      setPriceOverride(null);
      return;
    }

    const checkAvailability = async () => {
      const { data } = await supabase
        .from("availability")
        .select("id, spots_remaining, blocked, price_override")
        .eq("listing_id", listing.id)
        .eq("date", selectedDate)
        .maybeSingle();

      if (!data) {
        setAvailableSpots(listing.max_participants);
        setAvailabilityId(null);
        setPriceOverride(null);
      } else if (data.blocked) {
        setAvailableSpots(0);
        setAvailabilityId(null);
        setPriceOverride(null);
      } else {
        setAvailableSpots(data.spots_remaining);
        setAvailabilityId(data.id);
        setPriceOverride(data.price_override);
      }
    };

    checkAvailability();
  }, [listing?.id, listing?.max_participants, selectedDate]);

  // Clamp participants when available spots change
  useEffect(() => {
    if (availableSpots !== null && participants > availableSpots) {
      setParticipants(Math.max(1, availableSpots));
    }
  }, [availableSpots, participants]);

  // Fetch related activities when listing loads
  useEffect(() => {
    if (!listing?.id) return;

    const fetchRelated = async () => {
      const { data } = await supabase
        .from("listings")
        .select("id, title, description, images, location, duration, price, rating, review_count, category, agency_id, max_participants, featured")
        .eq("status", "published")
        .neq("id", listing.id)
        .or(`category.eq.${listing.category},location.eq.${listing.location}`)
        .order("rating", { ascending: false })
        .limit(4);

      if (data) {
        setRelatedActivities(
          data.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            image: l.images?.[0] ?? "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop",
            location: l.location,
            duration: l.duration,
            price: Number(l.price),
            rating: Number(l.rating),
            reviewCount: l.review_count,
            category: l.category,
            agency: l.agency_id,
            maxParticipants: l.max_participants,
            featured: l.featured,
          }))
        );
      }
    };

    void fetchRelated();
  }, [listing?.id, listing?.category, listing?.location]);

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

  const price = priceOverride !== null ? priceOverride : Number(listing.price);
  const rating = Number(listing.rating);
  const maxParticipants = listing.max_participants;
  const spotsLeft = availableSpots ?? maxParticipants;
  const totalPrice = price * participants;
  const heroImage = listing.images?.[0] || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop";

  const handleBooking = async () => {
    // Validate inputs
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    if (availableSpots === 0) {
      toast.error("This date is unavailable. Please choose another date.");
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
            availability_id: availabilityId,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: listing.title,
    description: listing.description,
    touristType: listing.category,
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "USD",
    },
    ...(listing.review_count > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: Number(listing.rating).toFixed(1),
        reviewCount: listing.review_count,
      },
    }),
  };

  return (
    <Layout>
      <SEO
        title={listing.title}
        description={`${listing.description.slice(0, 155)}…`}
        image={listing.images?.[0]}
        type="article"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
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
          <Button
            variant="glass"
            size="icon"
            disabled={isTogglingWishlist}
            onClick={() => {
              if (!isAuthenticated) {
                toast.error("Please log in to save activities.");
                return;
              }
              toggleWishlist({ listingId: listing.id, isSaved: wishlistIds.has(listing.id) });
            }}
          >
            <Heart className={`h-5 w-5 transition-colors ${wishlistIds.has(listing.id) ? "fill-red-500 text-red-500" : ""}`} />
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
                <CardContent className="space-y-4">
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
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      if (!isAuthenticated) {
                        toast.error("Please log in to message the agency.");
                        navigate(`/login?redirect=/activities/${listing.id}`);
                        return;
                      }
                      setAskDialogOpen(true);
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Ask a Question
                  </Button>
                </CardContent>
              </Card>

              {/* Ask a Question Dialog */}
              <Dialog open={askDialogOpen} onOpenChange={setAskDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ask {agencyName || "the Agency"} a Question</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">About: <span className="font-medium text-foreground">{listing.title}</span></p>
                  <Textarea
                    placeholder="What would you like to know? (e.g. group size, gear, difficulty, custom dates…)"
                    value={askMessage}
                    onChange={(e) => setAskMessage(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAskDialogOpen(false)}>Cancel</Button>
                    <Button
                      disabled={!askMessage.trim() || isSendingQuestion}
                      onClick={async () => {
                        if (!user) return;
                        setIsSendingQuestion(true);
                        try {
                          await startConversation({
                            travelerId: user.id,
                            agencyId: listing.agency_id,
                            listingId: listing.id,
                            content: askMessage.trim(),
                          });
                          setAskDialogOpen(false);
                          setAskMessage("");
                          toast.success("Message sent!", {
                            action: { label: "View Messages", onClick: () => navigate("/messages") },
                          });
                        } catch (err) {
                          toast.error((err as Error).message);
                        } finally {
                          setIsSendingQuestion(false);
                        }
                      }}
                    >
                      {isSendingQuestion ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</> : "Send Message"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

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
                    {selectedDate && availableSpots === 0 && (
                      <p className="text-xs text-destructive mt-1">This date is unavailable.</p>
                    )}
                    {selectedDate && availableSpots !== null && availableSpots > 0 && availableSpots <= 5 && (
                      <p className="text-xs text-orange-500 mt-1">Only {availableSpots} spot{availableSpots > 1 ? "s" : ""} left!</p>
                    )}
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
                        onClick={() => setParticipants(Math.min(spotsLeft, participants + 1))}
                        disabled={participants >= spotsLeft || isBooking}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedDate && availableSpots !== null
                        ? `${spotsLeft} of ${maxParticipants} spots available`
                        : `Maximum ${maxParticipants} participants`}
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
                    disabled={isBooking || availableSpots === 0}
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

          {/* Related Activities */}
          {relatedActivities.length > 0 && (
            <div className="mt-12 pt-10 border-t border-border">
              <h2 className="text-xl font-semibold mb-6">You Might Also Like</h2>
              <div className="flex gap-5 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory">
                {relatedActivities.map((activity) => (
                  <div key={activity.id} className="w-72 flex-shrink-0 snap-start">
                    <ActivityCard activity={activity} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
