import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface Review {
  id: string;
  activityId: string;
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
    userName: (row.traveler_name as string | null) ?? "Traveler",
    rating: row.rating as number,
    title: row.title as string,
    comment: row.comment as string,
    date: row.created_at as string,
    helpful: (row.helpful_count as number) ?? 0,
    verified: (row.verified as boolean) ?? true,
    tripDate: formatTripDate(row.created_at as string),
  };
}

function parseDurationDays(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const lower = duration.toLowerCase();
  const numbers = lower.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length === 0) return null;

  const value = Math.max(...numbers);
  if (lower.includes("week")) return value * 7;
  if (lower.includes("month")) return value * 30;
  return value;
}

function matchesDurationRange(duration: string | null | undefined, range: string | undefined) {
  if (!range) return true;
  const days = parseDurationDays(duration);
  if (days == null) return false;

  switch (range) {
    case "1":
      return days === 1;
    case "2-3":
      return days >= 2 && days <= 3;
    case "4-7":
      return days >= 4 && days <= 7;
    case "8+":
      return days >= 8;
    default:
      return true;
  }
}

// Published listings with filters
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

      // If date filter is set, get available listing IDs first via RPC
      let availableIds: string[] | null = null;
      if (filters?.availableOnDate) {
        const { data: rpcData } = await supabase.rpc("listings_available_on_date", {
          target_date: filters.availableOnDate,
        });
        availableIds = (rpcData as string[] | null) ?? [];
        if (availableIds.length === 0) {
          return { listings: [], total: 0, page, pageSize };
        }
      }

      let query = supabase
        .from("listings")
        .select("*", { count: "exact" })
        .eq("status", "published");

      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.location) query = query.ilike("location", `%${filters.location}%`);
      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }
      if (filters?.priceMin != null) query = query.gte("price", filters.priceMin);
      if (filters?.priceMax != null) query = query.lte("price", filters.priceMax);
      if (filters?.difficulties && filters.difficulties.length > 0) {
        query = query.in("difficulty", filters.difficulties);
      }
      if (availableIds) {
        query = query.in("id", availableIds);
      }

      switch (filters?.sortBy) {
        case "price_asc": query = query.order("price", { ascending: true }); break;
        case "price_desc": query = query.order("price", { ascending: false }); break;
        case "rating": query = query.order("rating", { ascending: false }); break;
        default: query = query.order("created_at", { ascending: false });
      }

      if (!filters?.durationRange) {
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      if (filters?.durationRange) {
        const filtered = (data ?? []).filter((listing) =>
          matchesDurationRange((listing as { duration?: string }).duration, filters.durationRange)
        );

        return {
          listings: filtered.slice(from, to + 1),
          total: filtered.length,
          page,
          pageSize,
        };
      }

      return { listings: data ?? [], total: count ?? 0, page, pageSize };
    },
    staleTime: 60_000,
  });
}

// Single listing
export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      if (!id) throw new Error("No listing ID");
      const { data, error } = await supabase
        .from("listings")
        .select("*")
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
        .select("id, listing_id, traveler_name, rating, title, comment, helpful_count, verified, created_at")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as Record<string, unknown>[] | null) ?? []).map(mapReviewRow);
    },
    enabled: !!listingId,
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
        .eq("status", "completed");

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
        .eq("status", "completed")
        .limit(1);

      const bookingId = bookings?.[0]?.id;
      if (!bookingId) throw new Error("No completed booking found for this activity");

      const { data: listing } = await supabase
        .from("listings")
        .select("agency_id")
        .eq("id", listingId)
        .single();

      const { error } = await supabase.from("reviews").insert({
        listing_id: listingId,
        booking_id: bookingId,
        agency_id: listing?.agency_id ?? null,
        traveler_id: user.id,
        traveler_name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
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

// Traveler bookings
export function useTravelerBookings() {
  return useQuery({
    queryKey: ["bookings", "traveler"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("bookings")
        .select(`*, listing:listings(title, location, duration, images, category)`)
        .eq("traveler_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
