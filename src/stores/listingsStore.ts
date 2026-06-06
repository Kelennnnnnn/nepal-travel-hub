import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────

export type ListingCategory =
  | "Trekking"
  | "Adventure"
  | "Cultural"
  | "Wildlife"
  | "Rafting"
  | "Mountaineering"
  | "Wellness"
  | "Photography";

export type ListingDifficulty =
  | "Easy"
  | "Moderate"
  | "Challenging"
  | "Difficult"
  | "Expert";

export type ListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "paused"
  | "rejected";

export interface Listing {
  id: string;
  agency_id: string;
  title: string;
  description: string;
  category: ListingCategory;
  location: string;
  price: number;
  duration: string;
  max_participants: number;
  difficulty: ListingDifficulty;
  images: string[];
  includes: string[];
  excludes: string[];
  itinerary: Record<string, unknown>[];
  status: ListingStatus;
  featured: boolean;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  id: string;
  listing_id: string;
  agency_id: string;
  date: string;
  spots_total: number;
  spots_remaining: number;
  price_override: number | null;
  blocked: boolean;
  created_at: string;
}

export interface ListingFormData {
  title: string;
  description: string;
  category: ListingCategory;
  location: string;
  price: number;
  duration: string;
  max_participants: number;
  difficulty: ListingDifficulty;
  images: string[];
  includes: string[];
  excludes: string[];
  itinerary: Record<string, unknown>[];
  status: ListingStatus;
}

// ── Store interface ────────────────────────────────────────

interface ListingsStore {
  // Agency-side state
  myListings: Listing[];
  myAvailability: AvailabilitySlot[];
  isLoading: boolean;
  error: string | null;

  // Agency-side actions
  fetchMyListings: () => Promise<void>;
  createListing: (data: ListingFormData) => Promise<{ data: Listing | null; error: string | null }>;
  updateListing: (id: string, data: Partial<ListingFormData>) => Promise<{ error: string | null }>;
  deleteListing: (id: string) => Promise<{ error: string | null }>;
  toggleListingStatus: (id: string, status: ListingStatus) => Promise<{ error: string | null }>;
  fetchMyAvailability: (listingId: string) => Promise<void>;
  upsertAvailability: (slot: Omit<AvailabilitySlot, "id" | "created_at">) => Promise<{ error: string | null }>;
  deleteAvailability: (id: string) => Promise<{ error: string | null }>;

  // Reset
  reset: () => void;
}

// ── Store ──────────────────────────────────────────────────

export const useListingsStore = create<ListingsStore>((set, get) => ({
  myListings: [],
  myAvailability: [],
  isLoading: false,
  error: null,

  // ── Agency: fetch own listings ───────────────────────────
  fetchMyListings: async () => {
    set({ isLoading: true, error: null });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ isLoading: false });
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("agency_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching my listings:", error.message);
      set({ isLoading: false, error: error.message });
      return;
    }

    set({ myListings: (data ?? []) as Listing[], isLoading: false });
  },

  // ── Agency: create a new listing ─────────────────────────
  createListing: async (formData) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };

    const { data, error } = await supabase
      .from("listings")
      .insert({
        agency_id: user.id,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        location: formData.location,
        price: formData.price,
        duration: formData.duration,
        max_participants: formData.max_participants,
        difficulty: formData.difficulty,
        images: formData.images,
        includes: formData.includes,
        excludes: formData.excludes,
        itinerary: formData.itinerary,
        status: formData.status,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    const listing = data as Listing;
    // Add to local state
    const current = get().myListings;
    set({ myListings: [listing, ...current] });
    return { data: listing, error: null };
  },

  // ── Agency: update an existing listing ───────────────────
  updateListing: async (id, formData) => {
    const { error } = await supabase
      .from("listings")
      .update(formData)
      .eq("id", id);

    if (error) return { error: error.message };

    // Optimistic update in local state
    const current = get().myListings;
    set({
      myListings: current.map((listing) =>
        listing.id === id ? { ...listing, ...formData } : listing
      ),
    });
    return { error: null };
  },

  // ── Agency: delete a listing ─────────────────────────────
  deleteListing: async (id) => {
    const { error } = await supabase
      .from("listings")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };

    // Remove from local state
    const current = get().myListings;
    set({ myListings: current.filter((listing) => listing.id !== id) });
    return { error: null };
  },

  // ── Agency: toggle listing status ────────────────────────
  toggleListingStatus: async (id, status) => {
    const { error } = await supabase
      .from("listings")
      .update({ status })
      .eq("id", id);

    if (error) return { error: error.message };

    // Optimistic update
    const current = get().myListings;
    set({
      myListings: current.map((listing) =>
        listing.id === id ? { ...listing, status } : listing
      ),
    });
    return { error: null };
  },

  // ── Agency: fetch availability for a listing ─────────────
  fetchMyAvailability: async (listingId) => {
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from("availability")
      .select("*")
      .eq("listing_id", listingId)
      .order("date", { ascending: true });

    if (error) {
      logger.error("Error fetching availability:", error.message);
      set({ isLoading: false, error: error.message });
      return;
    }

    set({ myAvailability: (data ?? []) as AvailabilitySlot[], isLoading: false });
  },

  // ── Agency: upsert an availability slot ──────────────────
  upsertAvailability: async (slot) => {
    const { error } = await supabase
      .from("availability")
      .upsert(
        {
          listing_id: slot.listing_id,
          agency_id: slot.agency_id,
          date: slot.date,
          spots_total: slot.spots_total,
          spots_remaining: slot.spots_remaining,
          price_override: slot.price_override,
          blocked: slot.blocked,
        },
        { onConflict: "listing_id,date" }
      );

    if (error) return { error: error.message };

    // Refresh availability for this listing
    await get().fetchMyAvailability(slot.listing_id);
    return { error: null };
  },

  // ── Agency: delete an availability slot ──────────────────
  deleteAvailability: async (id) => {
    const { error } = await supabase
      .from("availability")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };

    // Remove from local state
    const current = get().myAvailability;
    set({ myAvailability: current.filter((slot) => slot.id !== id) });
    return { error: null };
  },

  // ── Reset ────────────────────────────────────────────────
  reset: () =>
    set({
      myListings: [],
      myAvailability: [],
      error: null,
    }),
}));
