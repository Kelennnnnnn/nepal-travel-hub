import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Clock, Users, Star, ChevronRight, Share2, Heart,
  Minus, Plus, Loader2, X, Check, ShieldCheck, Lock,
  CalendarDays, TrendingUp, CheckCircle2, Zap, LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { useListing } from "@/lib/queries";
import { useAuthStore } from "@/stores/authStore";
import { useWishlistIds, useToggleWishlist } from "@/hooks/useWishlist";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";

type Tab = "overview" | "itinerary" | "inclusions" | "reviews";

interface RelatedListing {
  id: string;
  title: string;
  location: string;
  price: number;
  duration: string;
  difficulty: string;
  images: string[];
  category: string;
  rating: number;
  review_count: number;
}

const FALLBACK_IMG = FALLBACK_IMAGE_URL;

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: listing, isLoading } = useListing(id);
  const { user, isAuthenticated } = useAuthStore();

  const { data: wishlistIds = new Set<string>() } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedDate, setSelectedDate] = useState("");
  const [participants, setParticipants] = useState(2);
  const [travelerName, setTravelerName] = useState("");
  const [travelerEmail, setTravelerEmail] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [relatedListings, setRelatedListings] = useState<RelatedListing[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (user) {
      setTravelerName(user.name || "");
      setTravelerEmail(user.email || "");
    }
  }, [user]);

  useEffect(() => {
    if (!listing?.agency_id) return;
    supabase
      .from("agency_applications")
      .select("company_name, user_id")
      .eq("user_id", listing.agency_id)
      .eq("status", "verified")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.company_name) { setAgencyName(data.company_name); setAgencyId(data.user_id); }
      })
      .catch(() => {});
  }, [listing?.agency_id]);

  useEffect(() => {
    if (!listing?.id || !listing?.category) return;
    supabase
      .from("listings")
      .select("id, title, location, price, duration, difficulty, images, category, rating, review_count")
      .eq("status", "published")
      .eq("category", listing.category)
      .neq("id", listing.id)
      .limit(3)
      .then(({ data, error }) => {
        if (!error) setRelatedListings((data ?? []) as RelatedListing[]);
      })
      .catch(() => {});
  }, [listing?.id, listing?.category]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading experience…</p>
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-bold">Activity not found</h1>
          <Link to="/activities"><Button>Browse Activities</Button></Link>
        </div>
      </Layout>
    );
  }

  const price = Number(listing.price);
  const rating = Number(listing.rating);
  const maxParticipants = listing.max_participants || 12;
  const imgs: string[] = listing.images?.length ? listing.images : [FALLBACK_IMG];
  const totalBase = price * participants;
  const serviceFee = Math.round(totalBase * 0.05);
  const total = totalBase + serviceFee;
  const itinerary = (listing.itinerary ?? []) as { day: number; title: string; description: string }[];

  const handleShare = async () => {
    const url = window.location.href;
    const title = listing.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled — not an error
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleWishlistToggle = () => {
    if (!isAuthenticated) {
      toast.error("Please log in to save activities");
      navigate(`/login?redirect=/activities/${id}`);
      return;
    }
    toggleWishlist.mutate({ listingId: listing.id, isSaved: wishlistIds.has(listing.id) });
  };

  const handleBooking = async () => {
    if (!selectedDate) { toast.error("Please select a departure date"); return; }
    if (!travelerName.trim()) { toast.error("Please enter your full name"); return; }
    if (!travelerEmail.trim() || !travelerEmail.includes("@")) { toast.error("Please enter a valid email"); return; }
    if (!isAuthenticated || !user) {
      toast.error("Please log in to book");
      navigate(`/login?redirect=/activities/${id}`);
      return;
    }
    setIsBooking(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment-intent", {
        body: {
          listing_id: listing.id,
          agency_id: listing.agency_id,
          traveler_id: user.id,
          trip_date: selectedDate,
          guests: participants,
          price_per_person: price,
          total_amount: total,
          traveler_name: travelerName.trim(),
          traveler_email: travelerEmail.trim(),
          special_requests: specialRequests.trim() || null,
        },
      });
      if (error) { toast.error(error.message || "Failed to create booking"); setIsBooking(false); return; }
      const { clientSecret, bookingId } = data as { clientSecret: string; bookingId: string };
      if (!clientSecret || !bookingId) { toast.error("Invalid server response"); setIsBooking(false); return; }
      navigate(`/booking/payment?clientSecret=${encodeURIComponent(clientSecret)}&bookingId=${encodeURIComponent(bookingId)}`);
    } catch { toast.error("Something went wrong. Please try again."); setIsBooking(false); }
  };

  const initials = agencyName
    ? agencyName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "YN";

  const tabList: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "itinerary", label: "Itinerary" },
    { key: "inclusions", label: "Inclusions" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <Layout>
      <div className="pt-20 md:pt-24 bg-background min-h-screen">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6 md:py-10">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
            <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/activities" className="hover:text-primary transition-colors">Activities</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-primary font-medium truncate max-w-[200px]">{listing.category}</span>
          </nav>

          {/* Title row */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight mb-3">
                {listing.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="font-bold text-foreground">{rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({listing.review_count} reviews)</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{listing.location}</span>
                </div>
                <Badge variant="secondary" className="text-xs">{listing.category}</Badge>
              </div>
            </div>
            <div className="flex gap-2.5 flex-shrink-0">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-card text-foreground border border-border/40 rounded-full text-sm font-medium hover:bg-muted transition-colors shadow-sm"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
              <button
                onClick={handleWishlistToggle}
                disabled={toggleWishlist.isPending}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 border border-border/40 rounded-full text-sm font-medium transition-colors shadow-sm",
                  wishlistIds.has(listing.id)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card text-foreground hover:bg-muted"
                )}
              >
                <Heart className={cn("h-4 w-4", wishlistIds.has(listing.id) && "fill-current")} />
                {wishlistIds.has(listing.id) ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* Bento Gallery */}
          <div className="grid grid-cols-12 gap-3 h-[380px] md:h-[560px] mb-10 rounded-2xl overflow-hidden">
            {/* Hero */}
            <div
              className="col-span-12 md:col-span-8 relative group cursor-pointer overflow-hidden"
              onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
            >
              <img
                src={imgs[0]}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5">
                <span className="bg-white/20 backdrop-blur-md text-white text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full border border-white/20">
                  Featured Destination
                </span>
              </div>
            </div>

            {/* Right stack */}
            <div className="hidden md:grid md:col-span-4 grid-rows-2 gap-3">
              <div
                className="relative group cursor-pointer overflow-hidden"
                onClick={() => { setLightboxIndex(Math.min(1, imgs.length - 1)); setLightboxOpen(true); }}
              >
                <img
                  src={imgs[1] ?? imgs[0]}
                  alt={`${listing.title} 2`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
              </div>
              <div
                className="relative group cursor-pointer overflow-hidden"
                onClick={() => { setLightboxIndex(Math.min(2, imgs.length - 1)); setLightboxOpen(true); }}
              >
                <img
                  src={imgs[2] ?? imgs[0]}
                  alt={`${listing.title} 3`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                {imgs.length > 3 && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="text-center text-white">
                      <LayoutGrid className="h-6 w-6 mx-auto mb-1" />
                      <span className="text-sm font-bold">+{imgs.length - 3} more</span>
                    </div>
                  </div>
                )}
                {imgs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex(0); setLightboxOpen(true); }}
                    className="absolute bottom-4 right-4 bg-white text-foreground px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Show all {imgs.length} photos
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-12 gap-8 md:gap-12">

            {/* LEFT */}
            <div className="col-span-12 lg:col-span-8 space-y-0">

              {/* Agency banner */}
              <div className="flex items-center justify-between px-6 py-4 bg-muted/40 rounded-2xl mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base">{agencyName || "Verified Agency"}</span>
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Verified Partner · Government Licensed</p>
                  </div>
                </div>
                {agencyId && (
                  <Link
                    to={`/agency/profile/${listing.agency_id}`}
                    className="text-primary font-bold text-sm hover:underline underline-offset-2"
                  >
                    View Profile
                  </Link>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-border/30 mb-8">
                <div className="flex gap-6 md:gap-8 overflow-x-auto scrollbar-none">
                  {tabList.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={cn(
                        "pb-3.5 text-sm font-bold tracking-widest uppercase whitespace-nowrap transition-colors border-b-2 -mb-px",
                        activeTab === key
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-10">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-5 bg-muted/40 rounded-2xl flex flex-col gap-1.5">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Duration</span>
                      <span className="font-bold text-base leading-tight">{listing.duration}</span>
                    </div>
                    <div className="p-5 bg-muted/40 rounded-2xl flex flex-col gap-1.5">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Difficulty</span>
                      <span className="font-bold text-base leading-tight">{listing.difficulty}</span>
                    </div>
                    <div className="p-5 bg-muted/40 rounded-2xl flex flex-col gap-1.5">
                      <Users className="h-5 w-5 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Group Size</span>
                      <span className="font-bold text-base leading-tight">Max {maxParticipants}</span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold mb-4">About this Journey</h2>
                    <p className="text-muted-foreground leading-relaxed text-[15px]">{listing.description}</p>
                  </div>

                  {(listing.includes as string[])?.length > 0 && (
                    <div>
                      <h2 className="text-2xl font-bold mb-5">Experience Highlights</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(listing.includes as string[]).map((item, i) => (
                          <div key={i} className="flex items-start gap-3.5 p-4 bg-muted/40 rounded-xl">
                            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                            <span className="text-sm font-medium text-foreground">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: ITINERARY */}
              {activeTab === "itinerary" && (
                <div className="space-y-4">
                  {itinerary.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                      <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>No itinerary added yet.</p>
                    </div>
                  ) : (
                    itinerary.map((item, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                            {item.day ?? i + 1}
                          </div>
                          {i < itinerary.length - 1 && <div className="w-px flex-1 bg-border/50 mt-2" />}
                        </div>
                        <div className={cn("flex-1 pb-6", i === itinerary.length - 1 && "pb-0")}>
                          <div className="p-5 bg-muted/40 rounded-2xl">
                            <h3 className="font-bold mb-1.5">{item.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB: INCLUSIONS */}
              {activeTab === "inclusions" && (
                <div className="space-y-8">
                  {(listing.includes as string[])?.length > 0 && (
                    <div>
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Check className="h-5 w-5 text-primary" /> What's Included
                      </h2>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {(listing.includes as string[]).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 p-4 bg-muted/40 rounded-xl">
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm font-medium">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(listing.excludes as string[])?.length > 0 && (
                    <div>
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <X className="h-5 w-5 text-destructive" /> Not Included
                      </h2>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {(listing.excludes as string[]).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 p-4 bg-muted/40 rounded-xl">
                            <X className="h-4 w-4 text-destructive flex-shrink-0" />
                            <span className="text-sm font-medium">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: REVIEWS */}
              {activeTab === "reviews" && (
                <ReviewsSection
                  activityId={listing.id}
                  activityTitle={listing.title}
                  agencyUserId={
                    user?.role === "agency" && user.id === listing.agency_id
                      ? user.id
                      : undefined
                  }
                />
              )}
            </div>

            {/* RIGHT — sticky booking card */}
            <div className="col-span-12 lg:col-span-4">
              <div className="sticky top-24 bg-card rounded-2xl border border-border/30 shadow-2xl shadow-foreground/5 overflow-hidden">

                {/* Price header */}
                <div className="px-7 pt-7 pb-5">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Starts from</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-extrabold text-primary">${price.toLocaleString()}</span>
                        <span className="text-muted-foreground text-sm font-medium">/ person</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-secondary/10 text-secondary px-3 py-1.5 rounded-full text-xs font-bold">
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      Instant Book
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3 mb-6">
                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Departure Date
                      </Label>
                      <div className="flex items-center justify-between">
                        <Input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          disabled={isBooking}
                          className="border-0 p-0 h-auto bg-transparent font-bold text-sm focus-visible:ring-0 shadow-none"
                        />
                        <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Full Name
                      </Label>
                      <Input
                        value={travelerName}
                        onChange={(e) => setTravelerName(e.target.value)}
                        placeholder="Your full name"
                        disabled={isBooking}
                        className="border-0 p-0 h-auto bg-transparent font-medium text-sm focus-visible:ring-0 shadow-none"
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Email
                      </Label>
                      <Input
                        type="email"
                        value={travelerEmail}
                        onChange={(e) => setTravelerEmail(e.target.value)}
                        placeholder="your@email.com"
                        disabled={isBooking}
                        className="border-0 p-0 h-auto bg-transparent font-medium text-sm focus-visible:ring-0 shadow-none"
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Travelers
                      </Label>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">
                          {participants} {participants === 1 ? "Adult" : "Adults"}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setParticipants((p) => Math.max(1, p - 1))}
                            disabled={participants <= 1 || isBooking}
                            className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setParticipants((p) => Math.min(maxParticipants, p + 1))}
                            disabled={participants >= maxParticipants || isBooking}
                            className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Special Requests <span className="normal-case font-normal">(optional)</span>
                      </Label>
                      <Textarea
                        value={specialRequests}
                        onChange={(e) => setSpecialRequests(e.target.value)}
                        placeholder="Dietary needs, accessibility requirements, etc."
                        disabled={isBooking}
                        rows={2}
                        className="border-0 p-0 bg-transparent font-medium text-sm focus-visible:ring-0 shadow-none resize-none"
                      />
                    </div>
                  </div>

                  {/* Price breakdown */}
                  <div className="space-y-2.5 text-sm mb-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">${price.toLocaleString()} × {participants} traveler{participants > 1 ? "s" : ""}</span>
                      <span className="font-medium">${totalBase.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground underline decoration-dotted cursor-help">Service Fee (5%)</span>
                      <span className="font-medium">${serviceFee.toLocaleString()}</span>
                    </div>
                    <div className="pt-3 border-t border-border/30 flex justify-between items-center">
                      <span className="font-bold text-base">Total</span>
                      <span className="text-2xl font-extrabold">${total.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <Button
                    size="lg"
                    className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                    onClick={handleBooking}
                    disabled={isBooking}
                  >
                    {isBooking ? (
                      <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing…</>
                    ) : (
                      "Reserve Now"
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Secure payment via Yatra Nepal
                  </p>
                </div>

                {/* Free cancellation footer */}
                <div className="px-7 py-5 bg-muted/30 border-t border-border/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm">Free Cancellation</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Cancel up to 7 days before the trip starts for a full refund minus processing fees.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Related Activities */}
          {relatedListings.length > 0 && (
            <section className="mt-20 pt-10 border-t border-border/20">
              <div className="flex items-end justify-between mb-8">
                <h2 className="text-2xl md:text-3xl font-bold">You might also like</h2>
                <Link to="/activities" className="text-primary font-bold text-sm flex items-center gap-1 hover:underline underline-offset-2">
                  View all <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {relatedListings.map((rel) => (
                  <Link
                    key={rel.id}
                    to={`/activities/${rel.id}`}
                    className="group bg-card rounded-2xl overflow-hidden border border-border/20 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
                  >
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={rel.images?.[0] ?? FALLBACK_IMG}
                        alt={rel.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute top-3 left-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/80 backdrop-blur-sm text-primary-foreground px-2.5 py-1 rounded-full">
                          {rel.category}
                        </span>
                      </div>
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/30 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full font-bold">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {Number(rel.rating).toFixed(1)}
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-bold text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {rel.title}
                      </h3>
                      <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-muted-foreground">{rel.duration} · {rel.difficulty}</div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground">From</div>
                          <div className="font-extrabold text-primary">${Number(rel.price).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="flex items-center justify-between px-5 py-4 text-white/80">
            <span className="text-sm tabular-nums font-medium">{lightboxIndex + 1} / {imgs.length}</span>
            <span className="text-sm font-medium truncate max-w-[50%]">{listing.title}</span>
            <button
              onClick={() => setLightboxOpen(false)}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          <div
            className="flex-1 flex items-center justify-center px-4 min-h-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxIndex((p) => (p - 1 + imgs.length) % imgs.length)}
              className="absolute left-3 md:left-6 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all z-10"
            >
              <ChevronRight className="h-6 w-6 rotate-180" />
            </button>
            <img
              src={imgs[lightboxIndex]}
              alt={`${listing.title} ${lightboxIndex + 1}`}
              className="max-h-[calc(100vh-140px)] max-w-full object-contain rounded-lg"
              draggable={false}
            />
            <button
              onClick={() => setLightboxIndex((p) => (p + 1) % imgs.length)}
              className="absolute right-3 md:right-6 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all z-10"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
          <div className="px-4 py-4 flex justify-center gap-2 overflow-x-auto scrollbar-none">
            {imgs.map((src, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                className={cn(
                  "flex-shrink-0 h-14 w-20 rounded-lg overflow-hidden transition-all",
                  i === lightboxIndex ? "ring-2 ring-white opacity-100 scale-105" : "opacity-40 hover:opacity-70"
                )}
              >
                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
