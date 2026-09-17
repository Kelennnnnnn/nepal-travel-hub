import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  ShieldCheck,
  Star,
  CalendarDays,
  ChevronLeft,
  Loader2,
  AlertCircle,
  BadgeCheck,
  MessageSquare,
  Compass,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { supabase } from "@/lib/supabase";
import { useAgencyReviews } from "@/lib/queries";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuthStore } from "@/stores/authStore";
import type { Activity } from "@/components/activities/ActivityCard";
import type { Listing } from "@/stores/listingsStore";
import type { Review } from "@/lib/queries";

interface AgencyPublicProfile {
  id: string;
  display_name: string;
  description: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  created_at: string;
}

type ReviewFilter = "all" | "5" | "4" | "3-";

function listingToActivity(l: Listing, agencyName: string): Activity {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    image: l.images?.[0] || FALLBACK_IMAGE_URL,
    location: l.location,
    duration: l.duration_label,
    price: Number(l.base_price),
    rating: Number(l.rating),
    reviewCount: l.review_count,
    category: l.category,
    agency: agencyName,
    maxParticipants: l.max_participants,
    featured: l.featured,
  };
}

function filterReviews(reviews: Review[], filter: ReviewFilter): Review[] {
  if (filter === "5") return reviews.filter((r) => r.rating === 5);
  if (filter === "4") return reviews.filter((r) => r.rating === 4);
  if (filter === "3-") return reviews.filter((r) => r.rating <= 3);
  return reviews;
}

export default function AgencyProfile() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [agency, setAgency] = useState<AgencyPublicProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const { data: reviews = [], isLoading: reviewsLoading } = useAgencyReviews(agencyId);
  const startConversation = useStartConversation();

  useEffect(() => {
    if (!agencyId) {
      setError("Agency not found.");
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);

      // Fetch agency profile. agencies_public_select_approved (RLS) already
      // guarantees a non-staff/non-admin caller can only ever see approved
      // agencies — do NOT also embed agency_verification!inner(status) here,
      // that hits agency_verification's own RLS (no anon-visible policy)
      // and silently returns nothing even for a genuinely approved agency
      // (see src/lib/queries.ts's usePublicAgencies comment for the full
      // diagnosis — found and fixed in Phase 5 testing).
      const { data: agencyData, error: agencyErr } = await supabase
        .from("agencies")
        .select(
          "id, display_name, description, city, district, address, phone, email, website, created_at"
        )
        .eq("id", agencyId)
        .single();

      if (agencyErr || !agencyData) {
        setError("This agency profile could not be found or is not yet verified.");
        setIsLoading(false);
        return;
      }

      setAgency(agencyData as AgencyPublicProfile);

      // Fetch their published listings
      const { data: listingData } = await supabase
        .from("listings")
        .select("*")
        .eq("agency_id", agencyId)
        .eq("status", "published")
        .order("created_at", { ascending: false });

      setListings((listingData ?? []) as Listing[]);
      setIsLoading(false);
    };

    void load();
  }, [agencyId]);

  // Compute aggregate stats from listings
  const totalActivities = listings.length;
  const ratedListings = listings.map((l) => Number(l.rating)).filter((r) => r > 0);
  const avgRating =
    ratedListings.length > 0
      ? (ratedListings.reduce((s, r) => s + r, 0) / ratedListings.length).toFixed(1)
      : null;
  const memberSince = agency ? new Date(agency.created_at).getFullYear() : null;
  const yearsActive = memberSince ? Math.max(1, new Date().getFullYear() - memberSince) : null;
  const specialties = [...new Set(listings.map((l) => l.category))];
  const coverImage = listings.find((l) => l.images?.[0])?.images?.[0] ?? FALLBACK_IMAGE_URL;

  const summary = (() => {
    if (reviews.length === 0) return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    const distribution = [0, 0, 0, 0, 0];
    let total = 0;
    reviews.forEach((r) => {
      total += r.rating;
      distribution[r.rating - 1]++;
    });
    return { average: total / reviews.length, count: reviews.length, distribution };
  })();

  const filteredReviews = filterReviews(reviews, reviewFilter);

  const handleMessageAgency = async () => {
    if (!agency) return;
    if (!isAuthenticated) {
      toast.info("Sign in to message this agency.");
      navigate("/login");
      return;
    }
    try {
      const conversationId = await startConversation.mutateAsync({ agencyId: agency.id });
      navigate(`/messages?conversation=${conversationId}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ── Loading ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="pt-24 md:pt-28 pb-16">
          <Skeleton className="h-[280px] md:h-[360px] w-full rounded-none" />
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="-mt-14 mb-6">
              <Skeleton className="h-28 w-28 rounded-full border-4 border-background" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Error / not found ────────────────────────────────────────
  if (error || !agency) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h1 className="text-xl font-semibold mb-2">Agency not found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "This agency profile is unavailable."}
          </p>
          <Link to="/activities">
            <Button>Browse Activities</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const initials = agency.display_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Layout>
      <SEO
        title={agency.display_name}
        description={agency.description || `Explore tours and activities by ${agency.display_name}, a verified Nepal travel agency.`}
      />

      <div className="pt-24 md:pt-28 pb-16">
        {/* Cover */}
        <div className="relative w-full h-[280px] md:h-[360px] bg-muted overflow-hidden">
          <img src={coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-foreground/10 to-transparent" />
          <Link
            to="/activities"
            className="absolute top-4 left-4 md:left-8 inline-flex items-center gap-1 text-sm font-medium text-white/90 hover:text-white bg-foreground/30 hover:bg-foreground/40 backdrop-blur-sm rounded-full px-3 py-1.5 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Activities
          </Link>

          {/* Logo badge — agencies has no logo_url column (Phase 5 decision,
              see PHASE_5 report), so this is always the initials fallback. */}
          <div className="absolute -bottom-14 left-4 md:left-8 w-28 h-28 md:w-32 md:h-32 rounded-full border-4 border-background bg-card shadow-lg overflow-hidden flex items-center justify-center">
            <span className="text-3xl font-bold text-primary">{initials}</span>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex flex-col lg:flex-row gap-10 mt-20">
            {/* ── MAIN CONTENT ─────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-10">
              {/* Header info */}
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                    {agency.display_name}
                  </h1>
                  <Badge variant="verified" className="gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Government Verified
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-5 text-muted-foreground text-sm">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {agency.city}, {agency.district}
                  </span>
                  {yearsActive && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {yearsActive} year{yearsActive !== 1 ? "s" : ""} on Into Nepal
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Compass className="h-4 w-4" />
                    {totalActivities} activit{totalActivities !== 1 ? "ies" : "y"} listed
                  </span>
                </div>
              </section>

              {/* About */}
              {agency.description && (
                <section className="bg-muted/40 rounded-xl p-6 md:p-7 border border-border">
                  <h2 className="font-bold text-lg text-foreground mb-3">About the Agency</h2>
                  <p className="text-muted-foreground leading-relaxed">{agency.description}</p>
                </section>
              )}

              {/* Their Trips */}
              <section>
                <h2 className="font-bold text-lg text-foreground mb-4">Their Trips</h2>
                {listings.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No published activities yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {listings.map((l) => (
                      <ActivityCard key={l.id} activity={listingToActivity(l, agency.display_name)} />
                    ))}
                  </div>
                )}
              </section>

              {/* Reviews */}
              <section className="border-t border-border pt-8">
                <h2 className="font-bold text-lg text-foreground mb-5">Traveler Reviews</h2>

                {reviewsLoading ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Loading reviews…</div>
                ) : summary.count > 0 ? (
                  <>
                    <div className="bg-muted/40 rounded-xl p-6 border border-border mb-6">
                      <ReviewSummary
                        average={summary.average}
                        count={summary.count}
                        distribution={summary.distribution}
                      />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
                      {([
                        ["all", "All Reviews"],
                        ["5", "5 Stars"],
                        ["4", "4 Stars"],
                        ["3-", "3 Stars & Below"],
                      ] as [ReviewFilter, string][]).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setReviewFilter(value)}
                          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                            reviewFilter === value
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {filteredReviews.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6">No reviews match this filter.</p>
                    ) : (
                      <div>
                        {filteredReviews.map((review) => (
                          <ReviewCard key={review.id} review={review} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 bg-muted/30 rounded-xl">
                    <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-medium mb-1">No reviews yet</h3>
                    <p className="text-sm text-muted-foreground">
                      This agency hasn't received any traveler reviews yet.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* ── SIDEBAR ─────────────────────────────────────── */}
            <aside className="lg:w-80 flex-shrink-0">
              <div className="lg:sticky lg:top-24 space-y-4">
                <Card>
                  <CardContent className="p-6 flex flex-col gap-3">
                    <Button className="w-full" onClick={handleMessageAgency} disabled={startConversation.isPending}>
                      {startConversation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      Message Agency
                    </Button>
                    {agency.phone && (
                      <a href={`tel:${agency.phone}`}>
                        <Button variant="outline" className="w-full">
                          <Phone className="h-4 w-4" />
                          Call Agency
                        </Button>
                      </a>
                    )}

                    <hr className="border-border my-1" />

                    <ul className="flex flex-col gap-4">
                      <li className="flex items-start gap-3 text-sm">
                        <BadgeCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="block font-semibold text-foreground">License Verified</span>
                          <span className="text-muted-foreground">Nepal Tourism Board</span>
                        </div>
                      </li>
                      {avgRating && (
                        <li className="flex items-start gap-3 text-sm">
                          <Star className="h-4 w-4 text-primary mt-0.5 flex-shrink-0 fill-primary" />
                          <div>
                            <span className="block font-semibold text-foreground">{avgRating} Average Rating</span>
                            <span className="text-muted-foreground">Across all listed activities</span>
                          </div>
                        </li>
                      )}
                      {specialties.length > 0 && (
                        <li className="flex items-start gap-3 text-sm">
                          <Compass className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="block font-semibold text-foreground">Specialties</span>
                            <span className="text-muted-foreground">{specialties.join(", ")}</span>
                          </div>
                        </li>
                      )}
                      {agency.website && (
                        <li className="flex items-start gap-3 text-sm">
                          <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <a
                            href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline break-all"
                          >
                            {agency.website.replace(/^https?:\/\//, "")}
                          </a>
                        </li>
                      )}
                      {agency.email && (
                        <li className="flex items-start gap-3 text-sm">
                          <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <a href={`mailto:${agency.email}`} className="text-muted-foreground hover:text-primary break-all">
                            {agency.email}
                          </a>
                        </li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </Layout>
  );
}
