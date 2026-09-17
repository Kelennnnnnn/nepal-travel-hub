import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────
// Matches supabase/migrations/20260916000004_catalog.sql (Phase 2) as
// amended by Phase 5 (category/difficulty casing aligned to the shipped
// frontend taxonomy, featured added, duration_days made required).

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
  | "approved"
  | "published"
  | "paused"
  | "rejected"
  | "archived";

export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
}

export interface Listing {
  id: string;
  agency_id: string;
  slug: string;
  title: string;
  description: string;
  category: ListingCategory;
  location: string;
  duration_label: string;
  duration_days: number;
  base_price: number;
  currency: string;
  max_participants: number;
  difficulty: ListingDifficulty | null;
  featured: boolean;
  images: string[];
  includes: string[];
  excludes: string[];
  itinerary: ItineraryDay[];
  status: ListingStatus;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListingImageRecord {
  id: string;
  listing_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
}

export interface ListingFormData {
  title: string;
  description: string;
  category: ListingCategory;
  location: string;
  duration_label: string;
  duration_days: number;
  base_price: number;
  max_participants: number;
  difficulty: ListingDifficulty;
  includes: string[];
  excludes: string[];
  itinerary: ItineraryDay[];
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "listing"}-${suffix}`;
}

// ── Store interface ────────────────────────────────────────

interface ListingsStore {
  // Agency-side state
  myAgencyId: string | null;
  myListings: Listing[];
  isLoading: boolean;
  error: string | null;

  // Admin-side state
  allListings: Listing[];
  isLoadingAll: boolean;

  // Agency-side actions
  fetchMyListings: () => Promise<void>;
  createListing: (data: ListingFormData) => Promise<{ data: Listing | null; error: string | null }>;
  updateListing: (id: string, data: Partial<ListingFormData> & { images?: string[] }) => Promise<{ error: string | null }>;
  deleteListing: (id: string) => Promise<{ error: string | null }>;
  setOwnStatus: (id: string, status: ListingStatus) => Promise<{ error: string | null }>;
  submitForReview: (id: string) => Promise<{ error: string | null }>;
  publishListing: (id: string) => Promise<{ error: string | null }>;
  pauseListing: (id: string) => Promise<{ error: string | null }>;
  unpauseListing: (id: string) => Promise<{ error: string | null }>;
  archiveListing: (id: string) => Promise<{ error: string | null }>;

  // Image management (real Storage bucket + listing_images metadata rows —
  // see supabase/migrations/20260916000016_storage_buckets.sql's
  // listing-images bucket, path convention <agency_id>/<listing_id>/<file>)
  uploadListingImage: (
    listingId: string,
    agencyId: string,
    file: Blob,
    ext: string,
  ) => Promise<{ url: string | null; error: string | null }>;
  fetchListingImages: (listingId: string) => Promise<ListingImageRecord[]>;

  // Admin-side actions
  fetchAllListings: () => Promise<void>;
  subscribeToAllListings: () => () => void;
  adminSetStatus: (id: string, status: ListingStatus) => Promise<{ error: string | null }>;

  // Reset
  reset: () => void;
}

// ── Store ──────────────────────────────────────────────────

export const useListingsStore = create<ListingsStore>((set, get) => ({
  myAgencyId: null,
  myListings: [],
  isLoading: false,
  error: null,
  allListings: [],
  isLoadingAll: false,

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

    const { data: membership } = await supabase
      .from("agency_users")
      .select("agency_id")
      .eq("user_id", user.id)
      .in("agency_role", ["owner", "manager"])
      .is("removed_at", null)
      .limit(1)
      .maybeSingle();

    const agencyId = (membership?.agency_id as string | undefined) ?? null;
    set({ myAgencyId: agencyId });
    if (!agencyId) {
      set({ isLoading: false, myListings: [] });
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching my listings:", error.message);
      set({ isLoading: false, error: error.message });
      return;
    }

    set({ myListings: (data ?? []) as Listing[], isLoading: false });
  },

  // ── Agency: create a new listing (starts in draft) ───────
  createListing: async (formData) => {
    let agencyId = get().myAgencyId;
    if (!agencyId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { data: null, error: "Not authenticated" };
      const { data: membership } = await supabase
        .from("agency_users")
        .select("agency_id")
        .eq("user_id", user.id)
        .in("agency_role", ["owner", "manager"])
        .is("removed_at", null)
        .limit(1)
        .maybeSingle();
      agencyId = (membership?.agency_id as string | undefined) ?? null;
      if (!agencyId) return { data: null, error: "No agency membership found for this account" };
      set({ myAgencyId: agencyId });
    }

    const { data, error } = await supabase
      .from("listings")
      .insert({
        agency_id: agencyId,
        slug: slugify(formData.title),
        title: formData.title,
        description: formData.description,
        category: formData.category,
        location: formData.location,
        duration_label: formData.duration_label,
        duration_days: formData.duration_days,
        base_price: formData.base_price,
        max_participants: formData.max_participants,
        difficulty: formData.difficulty,
        includes: formData.includes,
        excludes: formData.excludes,
        itinerary: formData.itinerary,
        images: [],
        status: "draft",
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    const listing = data as Listing;
    set({ myListings: [listing, ...get().myListings] });
    return { data: listing, error: null };
  },

  // ── Agency: update an existing listing's editable fields ─
  updateListing: async (id, formData) => {
    const { error } = await supabase.from("listings").update(formData).eq("id", id);
    if (error) return { error: error.message };

    set({
      myListings: get().myListings.map((listing) =>
        listing.id === id ? { ...listing, ...formData } : listing
      ),
    });
    return { error: null };
  },

  // ── Agency: delete a draft listing (nothing else references it yet) ──
  deleteListing: async (id) => {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) return { error: error.message };
    set({ myListings: get().myListings.filter((listing) => listing.id !== id) });
    return { error: null };
  },

  // ── Agency: self-service status transitions ──────────────
  // Each is a thin wrapper — the actual legality of the transition (and,
  // for approved/rejected, that ONLY an admin may cause it) is enforced by
  // guard_listing_status_transition() in the database, not here. A rejected
  // UPDATE surfaces as a Postgres error via `error`.
  setOwnStatus: async (id, status) => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) return { error: error.message };
    set({
      myListings: get().myListings.map((l) => (l.id === id ? { ...l, status } : l)),
    });
    return { error: null };
  },
  submitForReview: async (id) => get().setOwnStatus(id, "pending_review"),
  publishListing: async (id) => get().setOwnStatus(id, "published"),
  pauseListing: async (id) => get().setOwnStatus(id, "paused"),
  unpauseListing: async (id) => get().setOwnStatus(id, "published"),
  archiveListing: async (id) => get().setOwnStatus(id, "archived"),

  // ── Images ─────────────────────────────────────────────────
  uploadListingImage: async (listingId, agencyId, file, ext) => {
    const path = `${agencyId}/${listingId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-images")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) return { url: null, error: uploadError.message };

    const currentCount = (await get().fetchListingImages(listingId)).length;
    const { error: insertError } = await supabase.from("listing_images").insert({
      listing_id: listingId,
      storage_path: path,
      mime_type: file.type || `image/${ext}`,
      size_bytes: file.size,
      sort_order: currentCount,
    });
    if (insertError) return { url: null, error: insertError.message };

    const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  },

  fetchListingImages: async (listingId) => {
    const { data, error } = await supabase
      .from("listing_images")
      .select("*")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });
    if (error) {
      logger.error("Error fetching listing images:", error.message);
      return [];
    }
    return (data ?? []) as ListingImageRecord[];
  },

  // ── Admin: fetch all listings ─────────────────────────────
  fetchAllListings: async () => {
    set({ isLoadingAll: true });
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching all listings:", error.message);
      set({ isLoadingAll: false });
      return;
    }
    set({ allListings: (data ?? []) as Listing[], isLoadingAll: false });
  },

  subscribeToAllListings: () => {
    const channel = supabase
      .channel("admin-listings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => {
        void get().fetchAllListings();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  adminSetStatus: async (id, status) => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) return { error: error.message };
    set({
      allListings: get().allListings.map((l) => (l.id === id ? { ...l, status } : l)),
    });
    return { error: null };
  },

  // ── Reset ────────────────────────────────────────────────
  reset: () =>
    set({
      myAgencyId: null,
      myListings: [],
      error: null,
      allListings: [],
    }),
}));
