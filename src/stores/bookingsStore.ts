import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Rebuilt against the real Phase 20 schema (bookings/booking_quotes/
// departures/listings, flexible-date holds) — the old store here was
// stubbed to always-empty because it predated this schema entirely. No
// financial logic lives here: these are read-only list views, backed by
// RLS (bookings_select_traveler / bookings_select_agency), never a
// client-side UPDATE.

export type BookingStatus =
  | "draft" | "pending_payment" | "payment_processing" | "awaiting_agency_confirmation"
  | "confirmed" | "cancel_requested" | "cancelled" | "in_progress" | "completed"
  | "no_show" | "disputed" | "expired";

export interface BookingQuoteSummary {
  product_value: number;
  platform_fee: number;
  agency_balance: number;
  amount_due_now: number;
  currency: string;
  confirmation_mode: string;
  payment_requirement: string;
  start_at: string;
  end_at: string;
  no_show_grace_minutes: number;
  expires_at: string;
  status: string;
}

export interface TravelerBooking {
  id: string;
  booking_ref: string;
  booking_status: BookingStatus;
  participant_count: number;
  created_at: string;
  agency_confirm_deadline: string | null;
  cancellation_reason_code: string | null;
  no_show_dispute_deadline: string | null;
  listing_id: string;
  listing: { id: string; title: string; images: string[]; location: string } | null;
  departure: { departure_date: string } | null;
  quote: BookingQuoteSummary | null;
}

export interface AgencyBookingGuest {
  full_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_primary: boolean;
}

export interface AgencyBooking {
  id: string;
  booking_ref: string;
  booking_status: BookingStatus;
  payment_status: string;
  participant_count: number;
  created_at: string;
  agency_id: string;
  agency_confirm_deadline: string | null;
  listing: { id: string; title: string } | null;
  departure: { departure_date: string } | null;
  quote: BookingQuoteSummary | null;
  guests: AgencyBookingGuest[];
}

const BOOKING_SELECT =
  "id, booking_ref, booking_status, payment_status, participant_count, created_at, agency_id, listing_id, agency_confirm_deadline, cancellation_reason_code, no_show_dispute_deadline, " +
  "listing:listings(id, title, images, location), " +
  "departure:departures(departure_date), " +
  "quote:booking_quotes(product_value, platform_fee, agency_balance, amount_due_now, currency, confirmation_mode, payment_requirement, start_at, end_at, no_show_grace_minutes, expires_at, status)";

interface BookingsStore {
  travelerBookings: TravelerBooking[];
  agencyBookings: AgencyBooking[];
  isLoading: boolean;
  error: string | null;
  fetchTravelerBookings: () => Promise<void>;
  fetchAgencyBookings: (options?: { silent?: boolean }) => Promise<void>;
  subscribeToAgencyBookings: () => () => void;
}

export const useBookingsStore = create<BookingsStore>((set, get) => ({
  travelerBookings: [],
  agencyBookings: [],
  isLoading: false,
  error: null,

  fetchTravelerBookings: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching traveler bookings:", error.message);
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ travelerBookings: (data ?? []) as unknown as TravelerBooking[], isLoading: false });
  },

  fetchAgencyBookings: async (options) => {
    if (!options?.silent) set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT + ", guests:booking_guests(full_name, contact_email, contact_phone, is_primary)")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error fetching agency bookings:", error.message);
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ agencyBookings: (data ?? []) as unknown as AgencyBooking[], isLoading: false });
  },

  subscribeToAgencyBookings: () => {
    const channel = supabase
      .channel("agency-bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void get().fetchAgencyBookings({ silent: true });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
}));
