import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Clock, Users, Star, ChevronRight, Share2, Heart,
  Minus, Plus, Loader2, X, Check, ShieldCheck,
  CalendarDays, TrendingUp, CheckCircle2, Zap, LayoutGrid,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/Layout";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createBookingHold, listingPolicyPreview } from "@/lib/api/bookings";
import { useDayRender, type DayProps } from "react-day-picker";
import { format, addMonths, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { useListing } from "@/lib/queries";
import { useAuthStore } from "@/stores/authStore";
import { useWishlistIds, useToggleWishlist } from "@/hooks/useWishlist";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import { formatPrice } from "@/lib/currency";

interface PricePreview {
  unit_price: number;
  product_value: number;
  reservation_fee: number;
  balance: number;
  amount_due_now: number;
  currency: string;
  payment_requirement: string;
}

interface BookableDay { day: string; status: string; reason: string | null }

const STATUS_LABELS: Record<string, string> = {
  unavailable: "Not available right now",
  paused: "Bookings are paused",
  too_soon: "Inside the minimum notice period",
  too_far: "Too far in advance",
  closed_day: "Not an operating day",
  blackout: "Blocked",
  invalid_pax: "Group size not allowed",
  full: "Fully booked",
};

function reserveErrorMessage(err: unknown): { title: string; action?: "my-bookings" } {
  const code = (err as { message?: string })?.message ?? "";
  const detail = (err as { details?: string })?.details;
  switch (code) {
    case "DATE_NOT_BOOKABLE":
      return { title: `This date is no longer available${detail ? ` (${STATUS_LABELS[detail] ?? detail})` : ""}. Please pick another date.` };
    case "ALREADY_BOOKED":
      return { title: "You already have a booking for this date.", action: "my-bookings" };
    case "TOO_MANY_HOLDS":
      return { title: "You have too many pending reservations. Complete or release one in My Bookings before starting another.", action: "my-bookings" };
    case "ROLE_CANNOT_BOOK":
      return { title: "This account type can't make bookings." };
    default:
      return { title: "Something went wrong creating your reservation. Please try again." };
  }
}

type Tab = "overview" | "itinerary" | "inclusions" | "reviews";

interface RelatedListing {
  id: string;
  slug: string;
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
  const { slugOrId } = useParams();
  const navigate = useNavigate();
  const { data: listing, isLoading } = useListing(slugOrId);

  // A legacy UUID link is canonicalized to the slug URL in place, same
  // pattern as AgencyProfile.tsx.
  useEffect(() => {
    if (listing?.slug && slugOrId !== listing.slug) {
      navigate(`/activities/${listing.slug}`, { replace: true });
    }
  }, [listing?.slug, slugOrId, navigate]);
  const { user, isAuthenticated } = useAuthStore();

  const { data: wishlistIds = new Set<string>() } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();
  const { fee_free_cancel_hours_day, fee_free_cancel_hours_multiday } = usePlatformSettings();

  // Whether the viewer can respond to this listing's reviews as its agency.
  // Checked server-side via has_agency_access — never a raw id comparison
  // against listing.agency_id, which is the agencies table's row id, not
  // any specific staff member's auth id.
  const { data: canRespondAsAgency = false } = useQuery({
    queryKey: ["has-agency-access", listing?.agency_id, "manager"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_agency_access", {
        target_agency_id: listing!.agency_id as string,
        min_role: "manager",
      });
      if (error) return false;
      return !!data;
    },
    enabled: !!listing?.agency_id && user?.role === "agency",
  });

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [participants, setParticipants] = useState(2);
  const [agencyName, setAgencyName] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [relatedListings, setRelatedListings] = useState<RelatedListing[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (!listing?.agency_id) return;
    // Relies on agencies_public_select_approved (RLS) to scope this to
    // approved agencies only — see usePublicAgencies in src/lib/queries.ts
    // for why embedding agency_verification!inner(status) here instead
    // would silently return nothing.
    supabase
      .from("agencies")
      .select("id, slug, display_name")
      .eq("id", listing.agency_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.display_name) {
          setAgencyName(data.display_name);
          setAgencyId(data.id);
          setAgencySlug(data.slug);
        }
      });
  }, [listing?.agency_id]);

  useEffect(() => {
    if (!listing?.id || !listing?.category) return;
    supabase
      .from("listings")
      .select("id, slug, title, location, price:base_price, duration:duration_label, difficulty, images, category, rating, review_count")
      .eq("status", "published")
      .eq("category", listing.category)
      .neq("id", listing.id)
      .limit(3)
      .then(({ data, error }) => {
        if (!error) setRelatedListings((data ?? []) as RelatedListing[]);
      });
  }, [listing?.id, listing?.category]);

  // Flexible-date booking (Phase 19): the traveler picks any open date —
  // there's no pre-created departure to choose from anymore. Fetches the
  // visible month and the next, re-querying whenever the viewed month or
  // the group size changes (group size affects invalid_pax/full per day).
  const rangeFrom = format(startOfMonth(calendarMonth), "yyyy-MM-dd");
  const rangeTo = format(endOfMonth(addMonths(calendarMonth, 1)), "yyyy-MM-dd");

  const { data: bookableDays = [] } = useQuery({
    queryKey: ["bookable-dates", listing?.id, rangeFrom, rangeTo, participants],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_bookable_dates", {
        p_listing_id: listing!.id,
        p_from: rangeFrom,
        p_to: rangeTo,
        p_pax: participants,
      });
      if (error) throw error;
      return (data ?? []) as BookableDay[];
    },
    enabled: !!listing?.id,
  });

  const dayStatusMap = useMemo(() => {
    const map = new Map<string, BookableDay>();
    for (const d of bookableDays) map.set(d.day, d);
    return map;
  }, [bookableDays]);

  const isDayDisabled = (date: Date) => {
    const status = dayStatusMap.get(format(date, "yyyy-MM-dd"))?.status;
    return status !== undefined && status !== "open";
  };

  const dayReasonRef = useRef(dayStatusMap);
  dayReasonRef.current = dayStatusMap;

  function BookableDayCell(props: DayProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dayRender = useDayRender(props.date, props.displayMonth, buttonRef);
    if (dayRender.isHidden) return <></>;
    const entry = dayReasonRef.current.get(format(props.date, "yyyy-MM-dd"));
    const title = entry && entry.status !== "open" ? (entry.reason ?? STATUS_LABELS[entry.status] ?? entry.status) : undefined;
    if (!dayRender.isButton) return <div {...dayRender.divProps} />;
    return <button ref={buttonRef} {...dayRender.buttonProps} title={title} />;
  }

  const selectedDateStatus = selectedDate ? dayStatusMap.get(format(selectedDate, "yyyy-MM-dd")) : undefined;

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;

  // Resolves seasonal_pricing/price_overrides for the chosen date instead
  // of always showing listings.base_price (price_preview, Prompt 25).
  const { data: pricePreview } = useQuery({
    queryKey: ["price-preview", listing?.id, selectedDateKey, participants],
    queryFn: async (): Promise<PricePreview> => {
      const { data, error } = await supabase.rpc("price_preview", {
        p_listing_id: listing!.id,
        p_date: selectedDateKey!,
        p_pax: participants,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as PricePreview;
    },
    enabled: !!listing?.id && !!selectedDateKey,
  });

  // Exact cancellation/no-show wording for the chosen date (listing_policy_
  // preview, Prompt 22/25) — replaces a hardcoded "cancel up to 7 days
  // before" footer that was the same for every listing regardless of its
  // actual free-cancel window, payment requirement, or cancellation tiers.
  const { data: policySentences } = useQuery({
    queryKey: ["listing-policy-preview", listing?.id, selectedDateKey, participants],
    queryFn: () => listingPolicyPreview(listing!.id, selectedDateKey!, participants),
    enabled: !!listing?.id && !!selectedDateKey,
  });

  useEffect(() => {
    if (listing?.min_participants) setParticipants((p) => Math.max(p, listing.min_participants));
  }, [listing?.min_participants]);

  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestFullName, setGuestFullName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [isReserving, setIsReserving] = useState(false);

  const canReserve = !!selectedDate && !!listing && (!selectedDateStatus || selectedDateStatus.status === "open");

  const handleReserveClick = () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/activities/${listing?.slug ?? slugOrId}`);
      return;
    }
    setGuestFullName(user?.name ?? "");
    setGuestEmail(user?.email ?? "");
    if (user?.id) {
      supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data?.phone) setGuestPhone(data.phone);
      });
    }
    setGuestDialogOpen(true);
  };

  const handleConfirmReserve = async () => {
    if (!listing || !selectedDate) return;
    setIsReserving(true);
    try {
      const hold = await createBookingHold(
        listing.id,
        format(selectedDate, "yyyy-MM-dd"),
        participants,
        { full_name: guestFullName.trim(), contact_email: guestEmail.trim(), contact_phone: guestPhone.trim() }
      );
      setGuestDialogOpen(false);
      navigate(`/booking/${hold.booking_id}/checkout`);
    } catch (err) {
      const { title, action } = reserveErrorMessage(err);
      toast.error(title, action === "my-bookings" ? {
        action: { label: "My Bookings", onClick: () => navigate("/my-bookings") },
      } : undefined);
    } finally {
      setIsReserving(false);
    }
  };

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
  const displayPrice = pricePreview ? Number(pricePreview.unit_price) : price;
  const rating = Number(listing.rating);
  const minParticipants = listing.min_participants ?? 1;
  const maxParticipants = listing.max_participants || 12;
  const listingImages = (listing.images ?? []) as string[];
  const imgs: string[] = listingImages.length ? listingImages : [FALLBACK_IMG];
  const itinerary = (listing.itinerary ?? []) as { day: number; title: string; description: string }[];
  const isInstantBook = listing.confirmation_mode === "instant";
  const genericFreeCancelHours = Number(listing.duration_days) <= 1 ? fee_free_cancel_hours_day : fee_free_cancel_hours_multiday;

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
      navigate(`/login?redirect=/activities/${listing?.slug ?? slugOrId}`);
      return;
    }
    toggleWishlist.mutate({ listingId: listing.id, isSaved: wishlistIds.has(listing.id) });
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
      <div className="pt-28 md:pt-32 bg-background min-h-screen">
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
                  <Star className="h-4 w-4 fill-rating text-rating" />
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
                    to={`/agencies/${agencySlug}`}
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
                  canRespondAsAgency={canRespondAsAgency}
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
                      <p className="text-xs text-muted-foreground mb-0.5">{selectedDateKey ? "Price for your date" : "Starts from"}</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-extrabold text-primary">{formatPrice(displayPrice)}</span>
                        <span className="text-muted-foreground text-sm font-medium">/ person</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-secondary/10 text-secondary px-3 py-1.5 rounded-full text-xs font-bold">
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      {isInstantBook ? "Instant Book" : "Agency Confirms"}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3 mb-6">
                    <div className="p-4 rounded-xl bg-muted/50 border border-border/20">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                        Departure Date
                      </Label>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <button type="button" className="flex items-center justify-between gap-2 w-full text-left">
                            <span className="font-bold text-sm">
                              {selectedDate
                                ? selectedDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                                : "Select a date"}
                            </span>
                            <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(d) => { setSelectedDate(d); setDatePickerOpen(false); }}
                            month={calendarMonth}
                            onMonthChange={setCalendarMonth}
                            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0)) || isDayDisabled(d)}
                            components={{
                              IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                              IconRight: () => <ChevronRight className="h-4 w-4" />,
                              Day: BookableDayCell,
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      {selectedDate && selectedDateStatus && selectedDateStatus.status !== "open" && (
                        <p className="text-xs text-destructive mt-1.5">
                          {selectedDateStatus.reason ?? STATUS_LABELS[selectedDateStatus.status]}
                        </p>
                      )}
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
                            onClick={() => setParticipants((p) => Math.max(minParticipants, p - 1))}
                            disabled={participants <= minParticipants}
                            className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setParticipants((p) => Math.min(maxParticipants, p + 1))}
                            disabled={participants >= maxParticipants}
                            className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {minParticipants > 1 && (
                        <p className="text-xs text-muted-foreground mt-1.5">Minimum group size: {minParticipants}</p>
                      )}
                    </div>
                  </div>

                  {/* Selection summary — the "Reserve" action itself is
                      Prompt 20's reservation-fee payment flow, not built
                      yet; this just confirms what would be booked. */}
                  {selectedDate && (!selectedDateStatus || selectedDateStatus.status === "open") && (
                    <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
                      <span className="font-semibold">
                        {selectedDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                      {" · "}
                      {participants} {participants === 1 ? "traveler" : "travelers"}
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="w-full h-14 text-base font-bold rounded-xl"
                    disabled={!canReserve}
                    onClick={handleReserveClick}
                  >
                    {selectedDate ? "Reserve" : "Select a date to reserve"}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground mt-3">
                    {listing.payment_requirement === "full_online"
                      ? "Full payment is required online to hold your spot for this activity."
                      : "Pay a small reservation fee now to hold your spot — no full payment required yet."}
                  </p>
                </div>

                {/* Free cancellation footer — exact policy text (listing_
                    policy_preview) once a date is picked; a generic,
                    settings-derived version before that, never a hardcoded
                    "7 days" that was the same for every listing regardless
                    of its own free-cancel window. */}
                <div className="px-7 py-5 bg-muted/30 border-t border-border/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm">Free Cancellation</h4>
                      {policySentences && policySentences.length > 0 ? (
                        <ul className="text-xs text-muted-foreground mt-0.5 leading-relaxed space-y-1">
                          {policySentences.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Free cancellation up to {genericFreeCancelHours} hours before your trip starts — your reservation fee is refunded in full. Select a date to see the exact policy.
                        </p>
                      )}
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
                    to={`/activities/${rel.slug}`}
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
                        <Star className="h-3 w-3 fill-rating text-rating" />
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
                          <div className="font-extrabold text-primary">{formatPrice(Number(rel.price))}</div>
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

      <Dialog open={guestDialogOpen} onOpenChange={setGuestDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Who's going?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={guestFullName} onChange={(e) => setGuestFullName(e.target.value)} placeholder="As it appears on your ID" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+977 9812345678" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestDialogOpen(false)} disabled={isReserving}>Cancel</Button>
            <Button onClick={handleConfirmReserve} disabled={isReserving || !guestFullName.trim() || !guestEmail.trim() || !guestPhone.trim()}>
              {isReserving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Hold My Spot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
