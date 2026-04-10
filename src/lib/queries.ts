import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

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

      query = query.range(from, to);
      const { data, error, count } = await query;
      if (error) throw error;
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
        .select("*")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!listingId,
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
