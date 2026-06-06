import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Shield,
  ShieldCheck,
  Star,
  CalendarDays,
  ChevronLeft,
  Loader2,
  AlertCircle,
  BadgeCheck,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { supabase } from "@/lib/supabase";
import type { Activity } from "@/components/activities/ActivityCard";
import type { Listing } from "@/stores/listingsStore";

interface AgencyPublicProfile {
  user_id: string;
  company_name: string;
  description: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  status: string;
  created_at: string;
  registration_number: string;
  logo_url: string;
}

function listingToActivity(l: Listing): Activity {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    image: l.images?.[0] || FALLBACK_IMAGE_URL,
    location: l.location,
    duration: l.duration,
    price: Number(l.price),
    rating: Number(l.rating),
    reviewCount: l.review_count,
    category: l.category,
    agency: l.agency_id,
    maxParticipants: l.max_participants,
    featured: l.featured,
  };
}

export default function AgencyProfile() {
  const { agencyId } = useParams<{ agencyId: string }>();

  const [agency, setAgency] = useState<AgencyPublicProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agencyId) {
      setError("Agency not found.");
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);

      // Fetch agency profile — only show verified agencies
      const { data: agencyData, error: agencyErr } = await supabase
        .from("agency_applications")
        .select(
          "user_id, company_name, description, city, district, address, phone, email, website, status, created_at, registration_number, logo_url"
        )
        .eq("user_id", agencyId)
        .eq("status", "verified")
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
  const avgRating =
    listings.length > 0
      ? (
          listings
            .map((l) => Number(l.rating))
            .filter((r) => r > 0)
            .reduce((s, r, _, a) => s + r / a.length, 0)
        ).toFixed(1)
      : null;
  const totalReviews = listings.reduce((s, l) => s + l.review_count, 0);
  const memberSince = agency
    ? new Date(agency.created_at).getFullYear()
    : null;

  // ── Loading ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="pt-24 md:pt-28 pb-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <Skeleton className="h-6 w-32 mb-8" />
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-72 space-y-4">
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <div className="flex-1 space-y-4">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
              </div>
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

  const initials = agency.company_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Layout>
      <SEO
        title={agency.company_name}
        description={agency.description || `Explore tours and activities by ${agency.company_name}, a verified Nepal travel agency.`}
      />
      <div className="pt-20 md:pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* Back link */}
          <Link
            to="/activities"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Activities
          </Link>

          <div className="flex flex-col lg:flex-row gap-8">

            {/* ── LEFT SIDEBAR ────────────────────────────────── */}
            <aside className="lg:w-72 space-y-4">

              {/* Identity card */}
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary mx-auto mb-4 overflow-hidden">
                    {agency.logo_url
                      ? <img src={agency.logo_url} alt={agency.company_name} className="w-full h-full object-cover" />
                      : initials}
                  </div>
                  <h1 className="text-lg font-bold text-foreground leading-tight mb-2">
                    {agency.company_name}
                  </h1>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verified Partner
                  </div>
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {agency.city}, {agency.district}
                  </div>
                </CardContent>
              </Card>

              {/* Contact card */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Contact
                  </p>
                  {agency.phone && (
                    <a
                      href={`tel:${agency.phone}`}
                      className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      {agency.phone}
                    </a>
                  )}
                  {agency.email && (
                    <a
                      href={`mailto:${agency.email}`}
                      className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors break-all"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      {agency.email}
                    </a>
                  )}
                  {agency.website && (
                    <a
                      href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 text-sm text-primary hover:underline break-all"
                    >
                      <Globe className="h-4 w-4 flex-shrink-0" />
                      {agency.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {agency.address && (
                    <div className="flex items-start gap-3 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{agency.address}, {agency.city}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Verification details */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Verification
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-foreground">Government Registered</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-foreground">License Verified</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-foreground">PAN / VAT Verified</span>
                  </div>
                  {memberSince && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">Partner since {memberSince}</span>
                    </div>
                  )}
                  {agency.registration_number && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Reg. Number</p>
                      <code className="text-xs font-mono text-foreground">
                        {agency.registration_number}
                      </code>
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>

            {/* ── MAIN CONTENT ─────────────────────────────────── */}
            <div className="flex-1 space-y-8 min-w-0">

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{totalActivities}</p>
                    <p className="text-xs text-muted-foreground mt-1">Activities</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{avgRating ?? "—"}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Star className="h-3 w-3 fill-secondary text-secondary" />
                      <p className="text-xs text-muted-foreground">Avg rating</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{totalReviews}</p>
                    <p className="text-xs text-muted-foreground mt-1">Reviews</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{memberSince ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Member since</p>
                  </CardContent>
                </Card>
              </div>

              {/* About */}
              {agency.description && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">About</h2>
                  <p className="text-muted-foreground leading-relaxed">{agency.description}</p>
                </div>
              )}

              {/* Listings */}
              <div>
                <h2 className="text-lg font-semibold mb-4">
                  Activities by {agency.company_name}
                </h2>
                {listings.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No published activities yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {listings.map((l) => (
                      <ActivityCard key={l.id} activity={listingToActivity(l)} />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
