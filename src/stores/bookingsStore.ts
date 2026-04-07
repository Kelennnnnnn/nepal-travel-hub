import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────

export interface Booking {
  id: string;
  booking_ref: string;
  listing_id: string;
  agency_id: string;
  traveler_id: string;
  availability_id: string | null;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  commission_rate: number;
  commission_amount: number;
  net_payout: number;
  status: "pending_payment" | "confirmed" | "completed" | "cancelled";
  payment_status: "unpaid" | "paid" | "refunded";
  payment_intent_id: string | null;
  traveler_name: string | null;
  traveler_email: string | null;
  traveler_phone: string | null;
  special_requests: string;
  cancellation_reason: string;
  created_at: string;
  updated_at: string;
  // Joined listing data (may be null if JOIN fails)
  listing?: {
    title: string;
    location: string;
    category: string;
    images: string[];
  } | null;
}

// ── Store interface ────────────────────────────────────────

interface BookingsStore {
  agencyBookings: Booking[];
  travelerBookings: Booking[];
  isLoading: boolean;
  error: string | null;

  fetchAgencyBookings: () => Promise<void>;
  fetchTravelerBookings: () => Promise<void>;
  updateBookingStatus: (
    id: string,
    status: "confirmed" | "cancelled" | "completed"
  ) => Promise<{ error: string | null }>;
  subscribeToAgencyBookings: () => () => void;
}

// ── Store ──────────────────────────────────────────────────

export const useBookingsStore = create<BookingsStore>()((set, get) => ({
  agencyBookings: [],
  travelerBookings: [],
  isLoading: false,
  error: null,

  // ── Agency: fetch all bookings for my listings ───────────

  fetchAgencyBookings: async () => {
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        listing:listings (
          title,
          location,
          category,
          images
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    // Normalize joined data (Supabase returns object for single FK)
    const bookings: Booking[] = (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
    })) as Booking[];

    set({ agencyBookings: bookings, isLoading: false });
  },

  // ── Traveler: fetch my bookings ──────────────────────────

  fetchTravelerBookings: async () => {
    set({ isLoading: true, error: null });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ error: "Not authenticated", isLoading: false });
      return;
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        listing:listings (
          title,
          location,
          category,
          images
        )
      `
      )
      .eq("traveler_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    const bookings: Booking[] = (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
    })) as Booking[];

    set({ travelerBookings: bookings, isLoading: false });
  },

  // ── Update booking status ────────────────────────────────

  updateBookingStatus: async (id, status) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    // Optimistic update in local state
    set((state) => ({
      agencyBookings: state.agencyBookings.map((b) =>
        b.id === id ? { ...b, status } : b
      ),
      travelerBookings: state.travelerBookings.map((b) =>
        b.id === id ? { ...b, status } : b
      ),
    }));

    return { error: null };
  },

  // ── Realtime subscription for agency bookings ────────────

  subscribeToAgencyBookings: () => {
    const channel = supabase
      .channel("agency-bookings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          // Re-fetch on any change to stay in sync
          get().fetchAgencyBookings();
        }
      )
      .subscribe();

    // Return cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
