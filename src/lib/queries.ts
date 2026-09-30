import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { ListingCategory, ListingDifficulty } from "@/stores/listingsStore";

// Shape returned by usePublishedListings()'s select — a deliberate subset
// of listings columns, with price/duration aliased back from base_price/
// duration_label so existing card/homepage components didn't all need
// their internal field names rewritten (see Phase 5 report). This is NOT
// the full Listing type from listingsStore — do not use interchangeably.
export interface PublishedListingRow {
  id: string;
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

// Published listings with filters.
//
// Phase 5 note: durationRange now filters server-side on the real numeric
// duration_days column (supabase/migrations/20260916000004_catalog.sql,
// made required in Phase 5) instead of fetching up to 2000 rows and
// parsing free-text duration in JS — this was AUDIT_REPORT.md FE-01, a
// concrete, named audit finding, not just incidental cleanup.
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
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("listings")
        .select(
          "id, title, description, images, location, duration:duration_label, duration_days, price:base_price, rating, review_count, category, agency_id, max_participants, featured, status, difficulty, created_at",
          { count: "estimated" }
        )
        .eq("status", "published");

      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.location) query = query.ilike("location", `%${filters.location}%`);
      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }
      if (filters?.priceMin != null) query = query.gte("base_price", filters.priceMin);
      if (filters?.priceMax != null) query = query.lte("base_price", filters.priceMax);
      if (filters?.difficulties && filters.difficulties.length > 0) {
        query = query.in("difficulty", filters.difficulties);
      }
      switch (filters?.durationRange) {
        case "1": query = query.eq("duration_days", 1); break;
        case "2-3": query = query.gte("duration_days", 2).lte("duration_days", 3); break;
        case "4-7": query = query.gte("duration_days", 4).lte("duration_days", 7); break;
        case "8+": query = query.gte("duration_days", 8); break;
        default: break;
      }

      switch (filters?.sortBy) {
        case "price_asc": query = query.order("base_price", { ascending: true }); break;
        case "price_desc": query = query.order("base_price", { ascending: false }); break;
        case "rating": query = query.order("rating", { ascending: false }); break;
        default: query = query.order("created_at", { ascending: false });
      }

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      return { listings: (data ?? []) as unknown as PublishedListingRow[], total: count ?? 0, page, pageSize };
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
export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      if (!id) throw new Error("No listing ID");
      const { data, error } = await supabase
        .from("listings")
        .select("*, price:base_price, duration:duration_label")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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
