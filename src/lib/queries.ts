import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { isUuid } from "@/lib/slug";
import type { ListingCategory, ListingDifficulty } from "@/stores/listingsStore";

// Shape returned by usePublishedListings()'s select — a deliberate subset
// of listings columns, with price/duration aliased back from base_price/
// duration_label so existing card/homepage components didn't all need
// their internal field names rewritten (see Phase 5 report). This is NOT
// the full Listing type from listingsStore — do not use interchangeably.
export interface PublishedListingRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  images: string[];
  location: string;
  duration: string;
  duration_days: number;
  price: number;
  rating: number;
  review_count: number;
  category: ListingCategory;
  agency_id: string;
  max_participants: number;
  featured: boolean;
  status: string;
  difficulty: ListingDifficulty | null;
  created_at: string;
}

export interface Review {
  id: string;
  activityId: string;
  agencyId: string | null;
  userName: string;
  userAvatar?: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
  helpful: number;
  verified: boolean;
  tripDate: string;
  photos?: string[];
  agencyResponse: string | null;
}

interface SubmitReviewData {
  listingId: string;
  rating: number;
  title: string;
  comment: string;
}

function formatTripDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function mapReviewRow(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    activityId: row.listing_id as string,
    agencyId: (row.agency_id as string | null) ?? null,
    userName: (row.traveler_name as string | null) ?? "Traveler",
    rating: row.rating as number,
    title: row.title as string,
    comment: row.comment as string,
    date: row.created_at as string,
    helpful: (row.helpful_count as number) ?? 0,
    // Every row in `reviews` requires a real, completed, owned booking to
    // exist at all (reviews_traveler_insert_eligible_only, migration 12) —
    // there's no "unverified" review to distinguish this from. The old
    // `verified` column this used to read from never actually existed on
    // the table (selecting it would have errored).
    verified: true,
    tripDate: formatTripDate(row.created_at as string),
    agencyResponse: (row.agency_response as string | null) ?? null,
  };
}

// Published listings with filters — delegates to the search_listings() RPC
// (supabase/migrations/20260924000001_frontend_accuracy.sql) instead of
// building a PostgREST .or() filter by string interpolation. The old
// `query.or(\`title.ilike.%${search}%,...\`)` broke or silently changed
// which clauses PostgREST parsed out of the string whenever `search`
// contained a comma, parenthesis, or dot — every argument to the RPC is a
// bound parameter instead.
//
// availableOnDate is dropped for now: the old system's listings_available_
// on_date RPC read the old flat `availability` table directly, which no
// longer exists — real departure/inventory-aware availability filtering is
// Phase 7's job (see supabase/migrations/20260916000005_inventory.sql).
// Passing this filter is a silent no-op rather than an error until then.
export function usePublishedListings(filters?: {
  category?: string;
  location?: string;
  search?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
  priceMin?: number;
  priceMax?: number;
  difficulties?: string[];
  durationRange?: string;
  availableOnDate?: string;
}) {
  return useQuery({
    queryKey: ["listings", "published", filters],
    queryFn: async () => {
      const page = filters?.page ?? 1;
      const pageSize = filters?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const sort =
        filters?.sortBy === "price_asc" ? "price_asc"
        : filters?.sortBy === "price_desc" ? "price_desc"
        : filters?.sortBy === "rating" ? "rating"
        : "newest";

      const { data, error } = await supabase.rpc("search_listings", {
        p_query: filters?.search || null,
        p_category: filters?.category || null,
        p_location: filters?.location || null,
        p_price_min: filters?.priceMin ?? null,
        p_price_max: filters?.priceMax ?? null,
        p_difficulties: filters?.difficulties && filters.difficulties.length > 0 ? filters.difficulties : null,
        p_duration_range: filters?.durationRange || null,
        p_sort: sort,
        p_limit: pageSize,
        p_offset: offset,
      });
      if (error) throw error;

      const result = data as unknown as { listings: PublishedListingRow[]; total: number };
      return { listings: result?.listings ?? [], total: result?.total ?? 0, page, pageSize };
    },
    staleTime: 60_000,
  });
}

// Public agency names for a set of agency ids — used to attribute listings
// to their operator. listings.agency_id references agencies.id directly
// (Phase 4's schema; the old agency_applications table this used to query,
// keyed by user_id, no longer exists). agencies has no logo_url column
// (Phase 5 deliberately did not add one — see PHASE_5 report), so logoUrl
// is always null; kept in the return shape only so existing call sites
// that destructure it don't need to change.
//
// Deliberately does NOT filter/embed on agency_verification.status here —
// agencies_public_select_approved (migration 3, fixed in Phase 5) already
// enforces "only approved agencies are visible to a non-staff/non-admin
// caller" at the RLS layer via is_agency_publicly_approved(), so any row
// this query can even see is already guaranteed approved. Embedding
// agency_verification!inner(status) here, as an earlier version of this
// query did, hits the exact same cross-table RLS wall the migration 3
// comment describes: agency_verification has no anon-visible SELECT policy
// of its own, so the embedded join's OWN visibility check (separate from
// the agencies row policy) silently drops every row — caught in Phase 5
// testing, when this returned empty for a confirmed-approved agency.
export function usePublicAgencies(agencyIds: string[]) {
  const uniqueIds = [...new Set(agencyIds)].filter(Boolean).sort();
  return useQuery({
    queryKey: ["agencies", "public", uniqueIds],
    queryFn: async () => {
      if (uniqueIds.length === 0) return {} as Record<string, { name: string; logoUrl: string | null }>;
      const { data, error } = await supabase
        .from("agencies")
        .select("id, display_name")
        .in("id", uniqueIds);
      if (error) throw error;

      const map: Record<string, { name: string; logoUrl: string | null }> = {};
      for (const row of data ?? []) {
        map[row.id as string] = { name: row.display_name as string, logoUrl: null };
      }
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

// Single listing. Aliases price/duration alongside the real base_price/
// duration_label columns (via `*`) so ActivityDetail.tsx's existing field
// references keep working unchanged.
// Accepts either the listing's slug (canonical) or its id (legacy links) —
// ActivityDetail.tsx decides which column to match on via isUuid().
export function useListing(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ["listing", slugOrId],
    queryFn: async () => {
      if (!slugOrId) throw new Error("No listing slug or ID");
      const { data, error } = await supabase
        .from("listings")
        .select("*, price:base_price, duration:duration_label")
        .eq(isUuid(slugOrId) ? "id" : "slug", slugOrId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slugOrId,
  });
}

// Reviews for a listing
export function useListingReviews(listingId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", listingId],
    queryFn: async () => {
      if (!listingId) throw new Error("No listing ID");
      const { data, error } = await supabase
        .from("reviews")
        .select("id, listing_id, agency_id, traveler_name, rating, title, comment, helpful_count, created_at, agency_response")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as Record<string, unknown>[] | null) ?? []).map(mapReviewRow);
    },
    enabled: !!listingId,
  });
}

export function useAgencyReviews(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "agency", agencyId],
    queryFn: async () => {
      if (!agencyId) throw new Error("No agency ID");
      const { data, error } = await supabase
        .from("reviews")
        .select("id, listing_id, agency_id, traveler_name, rating, title, comment, helpful_count, created_at, agency_response")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as Record<string, unknown>[] | null) ?? []).map(mapReviewRow);
    },
    enabled: !!agencyId,
  });
}

export function useCanReviewListing(listingId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "can-review", listingId],
    queryFn: async () => {
      if (!listingId) return false;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return false;

      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("listing_id", listingId)
        .eq("traveler_id", user.id)
        .eq("booking_status", "completed");

      if (!bookings || bookings.length === 0) return false;

      const bookingIds = bookings.map((booking: { id: string }) => booking.id);
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .in("booking_id", bookingIds)
        .limit(1);

      return !existing || existing.length === 0;
    },
    enabled: !!listingId,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, rating, title, comment }: SubmitReviewData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("You must be signed in to submit a review");

      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("listing_id", listingId)
        .eq("traveler_id", user.id)
        .eq("booking_status", "completed")
        .limit(1);

      const bookingId = bookings?.[0]?.id;
      if (!bookingId) throw new Error("No completed booking found for this activity");

      // reviews.agency_id has no DB default, so the insert payload must
      // include SOMETHING — but audit H3's guard_review_fields trigger
      // always overwrites it server-side from the booking's real agency_id
      // before the NOT NULL constraint is even checked, so this value is
      // never actually trusted or used; traveler_name/helpful_count are
      // likewise always server-derived and intentionally not sent at all.
      const { data: listing } = await supabase
        .from("listings")
        .select("agency_id")
        .eq("id", listingId)
        .single();

      const { error } = await supabase.from("reviews").insert({
        listing_id: listingId,
        booking_id: bookingId,
        traveler_id: user.id,
        agency_id: listing?.agency_id ?? "",
        rating,
        title,
        comment,
      });

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", variables.listingId] });
      void queryClient.invalidateQueries({ queryKey: ["reviews", "can-review", variables.listingId] });
      void queryClient.invalidateQueries({ queryKey: ["listing", variables.listingId] });
    },
  });
}

// Agency (manager+) responds to a review via the respond_to_review RPC
// (audit H3) — reviews.agency_response replaces the old, never-actually-
// existent admin_note column, and is only ever writable through this RPC,
// which re-derives manager+ access from the review's real agency_id
// server-side rather than trusting anything the client sends.
export function useRespondToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId, note, listingId }: { reviewId: string; note: string; listingId: string }) => {
      const { error } = await supabase.rpc("respond_to_review", {
        p_review_id: reviewId,
        p_text: note,
      });
      if (error) throw error;
      return listingId;
    },
    onSuccess: (listingId) => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", listingId] });
    },
  });
}

// The current user's own review_votes, for a given set of review ids — lets
// ReviewCard show correct "already voted" button state on load/reload
// instead of relying on localStorage (audit H3).
export function useMyReviewVotes(reviewIds: string[]) {
  const sortedIds = [...reviewIds].sort();
  return useQuery({
    queryKey: ["review-votes", "mine", sortedIds],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || sortedIds.length === 0) return new Set<string>();

      const { data, error } = await supabase
        .from("review_votes")
        .select("review_id")
        .in("review_id", sortedIds);
      if (error) throw error;
      return new Set((data ?? []).map((v) => v.review_id as string));
    },
    enabled: sortedIds.length > 0,
  });
}

// Vote/un-vote a review as helpful. Refetches the review's real
// helpful_count from the server afterward (via the reviews query
// invalidation) instead of an optimistic-only +1/-1, since helpful_count is
// maintained server-side by recalc_review_helpful_count (migration 12).
export function useToggleReviewHelpful() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId, hasVoted }: { reviewId: string; listingId: string; hasVoted: boolean }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in to vote.");

      if (hasVoted) {
        const { error } = await supabase
          .from("review_votes")
          .delete()
          .eq("review_id", reviewId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("review_votes").insert({ review_id: reviewId, user_id: user.id });
        // A unique-violation means this vote already exists (e.g. a second
        // tab, or stale client state) — treat that as success rather than
        // an error; the query invalidation below reconciles the UI either way.
        if (error && error.code !== "23505") throw error;
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", variables.listingId] });
      void queryClient.invalidateQueries({ queryKey: ["review-votes", "mine"] });
    },
  });
}

// Traveler bookings
export function useTravelerBookings() {
  return useQuery({
    queryKey: ["bookings", "traveler"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("bookings")
        .select(`*, listing:listings(title, location, duration:duration_label, images, category)`)
        .eq("traveler_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
