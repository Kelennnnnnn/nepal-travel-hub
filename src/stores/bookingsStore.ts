import { create } from "zustand";

// Booking history/management belonged to the old Stripe-based, two-leg
// commission model — removed along with the rest of that model. This store
// used to query bookings columns (trip_date, total_amount, commission_amount,
// net_payout, agency_id = user.id) that no longer exist in the current
// schema (bookings/departures/booking_quotes, Phase 2/6/7), so it is stubbed
// to an always-empty, not-loading state rather than querying columns that
// don't exist. Every page that used to read from this store now shows a
// "coming soon" state instead of calling into it. Rebuild for real once the
// new NPR reservation-fee booking flow is designed.

export interface Booking {
  id: string;
  booking_ref: string;
  listing_id: string;
  agency_id: string;
  traveler_id: string;
  created_at: string;
  listing?: { title: string } | null;
}

interface BookingsStore {
  agencyBookings: Booking[];
  travelerBookings: Booking[];
  isLoading: boolean;
  error: string | null;
  fetchAgencyBookings: (options?: { silent?: boolean }) => Promise<void>;
  fetchTravelerBookings: () => Promise<void>;
  subscribeToAgencyBookings: () => () => void;
}

export const useBookingsStore = create<BookingsStore>()((set) => ({
  agencyBookings: [],
  travelerBookings: [],
  isLoading: false,
  error: null,
  fetchAgencyBookings: async () => set({ isLoading: false, agencyBookings: [] }),
  fetchTravelerBookings: async () => set({ isLoading: false, travelerBookings: [] }),
  subscribeToAgencyBookings: () => () => {},
}));
