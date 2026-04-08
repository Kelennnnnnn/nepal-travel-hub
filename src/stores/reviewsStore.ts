import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────

/** Matches the shape expected by ReviewCard / ReviewSummary */
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
  bookingId: string;
  rating: number;
  title: string;
  comment: string;
}

// ── Store interface ────────────────────────────────────────

interface ReviewsStore {
  reviews: Review[];
  canReview: boolean;
  isLoading: boolean;
  isSubmitting: boolean;

  fetchReviewsForListing: (listingId: string) => Promise<void>;
  checkCanReview: (listingId: string) => Promise<void>;
  submitReview: (data: SubmitReviewData) => Promise<{ error: string | null }>;
}

// ── Helpers ────────────────────────────────────────────────

function formatTripDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function mapRow(row: Record<string, unknown>): Review {
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

// ── Store ──────────────────────────────────────────────────

export const useReviewsStore = create<ReviewsStore>()((set) => ({
  reviews: [],
  canReview: false,
  isLoading: false,
  isSubmitting: false,

  fetchReviewsForListing: async (listingId) => {
    set({ isLoading: true });

    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, listing_id, traveler_name, rating, title, comment, helpful_count, verified, created_at"
      )
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });

    if (error) {
      set({ isLoading: false });
      return;
    }

    set({
      reviews: (data as Record<string, unknown>[]).map(mapRow),
      isLoading: false,
    });
  },

  checkCanReview: async (listingId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      set({ canReview: false });
      return;
    }

    // Check for a completed booking with no existing review
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", listingId)
      .eq("traveler_id", user.id)
      .eq("status", "completed");

    if (!bookings || bookings.length === 0) {
      set({ canReview: false });
      return;
    }

    const bookingIds = bookings.map((b: { id: string }) => b.id);

    const { data: existing } = await supabase
      .from("reviews")
      .select("id")
      .in("booking_id", bookingIds)
      .limit(1);

    // Can review if they have a completed booking with no review yet
    set({ canReview: !existing || existing.length === 0 });
  },

  submitReview: async ({ listingId, bookingId, rating, title, comment }) => {
    set({ isSubmitting: true });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      set({ isSubmitting: false });
      return { error: "Not authenticated" };
    }

    // Fetch the listing's agency_id
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

    set({ isSubmitting: false });

    if (error) return { error: error.message };

    return { error: null };
  },
}));
