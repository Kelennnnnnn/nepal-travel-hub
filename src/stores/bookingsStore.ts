import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "refunded";

export interface Booking {
  id: string;
  booking_ref: string;
  listing_id: string;
  agency_id: string;
  traveler_id: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  commission_amount: number;
  net_payout: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  traveler_name: string | null;
  traveler_email: string | null;
  traveler_phone: string | null;
  created_at: string;
  /** From `listing:listings (title)` */
  listing?: { title: string } | null;
}

// ── Store interface ────────────────────────────────────────

interface BookingsStore {
  agencyBookings: Booking[];
  travelerBookings: Booking[];
  isLoading: boolean;
  error: string | null;

  /** Pass `{ silent: true }` for background refresh (e.g. realtime) to avoid toggling isLoading. */
  fetchAgencyBookings: (options?: { silent?: boolean }) => Promise<void>;
  fetchTravelerBookings: () => Promise<void>;
  updateBookingStatus: (
    id: string,
    status: "confirmed" | "cancelled" | "completed"
  ) => Promise<{ error: string | null }>;
  /** Call returned function on unmount. Uses filtered realtime for this agency only. */
  subscribeToAgencyBookings: () => () => void;
}

function mapBookingRows(data: unknown): Booking[] {
  return (data as Record<string, unknown>[] | null | undefined)?.map((row) => ({
    id: row.id as string,
    booking_ref: row.booking_ref as string,
    listing_id: row.listing_id as string,
    agency_id: row.agency_id as string,
    traveler_id: row.traveler_id as string,
    trip_date: row.trip_date as string,
    guests: row.guests as number,
    price_per_person: Number(row.price_per_person),
    total_amount: Number(row.total_amount),
    commission_amount: Number(row.commission_amount),
    net_payout: Number(row.net_payout),
    status: row.status as BookingStatus,
    payment_status: row.payment_status as PaymentStatus,
    traveler_name: (row.traveler_name as string | null) ?? null,
    traveler_email: (row.traveler_email as string | null) ?? null,
    traveler_phone: (row.traveler_phone as string | null) ?? null,
    created_at: row.created_at as string,
    listing: normalizeListing(row.listing),
  })) ?? [];
}

function normalizeListing(
  raw: unknown
): { title: string } | null | undefined {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as { title?: string } | undefined;
    return first?.title != null ? { title: first.title } : null;
  }
  const o = raw as { title?: string };
  return o.title != null ? { title: o.title } : null;
}

// ── Store ──────────────────────────────────────────────────

export const useBookingsStore = create<BookingsStore>()((set, get) => ({
  agencyBookings: [],
  travelerBookings: [],
  isLoading: false,
  error: null,

  fetchAgencyBookings: async (options) => {
    const silent = options?.silent === true;
    if (!silent) set({ isLoading: true, error: null });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ isLoading: false, error: "Not authenticated", agencyBookings: [] });
      return;
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id,
        booking_ref,
        listing_id,
        agency_id,
        traveler_id,
        trip_date,
        guests,
        price_per_person,
        total_amount,
        commission_amount,
        net_payout,
        status,
        payment_status,
        traveler_name,
        traveler_email,
        traveler_phone,
        created_at,
        listing:listings ( title )
      `
      )
      .eq("agency_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, ...(silent ? {} : { isLoading: false }) });
      return;
    }

    set({
      agencyBookings: mapBookingRows(data),
      error: null,
      ...(silent ? {} : { isLoading: false }),
    });
  },

  fetchTravelerBookings: async () => {
    set({ isLoading: true, error: null });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ isLoading: false, error: "Not authenticated", travelerBookings: [] });
      return;
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id,
        booking_ref,
        listing_id,
        agency_id,
        traveler_id,
        trip_date,
        guests,
        price_per_person,
        total_amount,
        commission_amount,
        net_payout,
        status,
        payment_status,
        traveler_name,
        traveler_email,
        traveler_phone,
        created_at,
        listing:listings ( title )
      `
      )
      .eq("traveler_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ travelerBookings: mapBookingRows(data), isLoading: false });
  },

  updateBookingStatus: async (id, status) => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);

    if (error) {
      return { error: error.message };
    }

    set((state) => ({
      agencyBookings: state.agencyBookings.map((b) =>
        b.id === id ? { ...b, status: status as BookingStatus } : b
      ),
      travelerBookings: state.travelerBookings.map((b) =>
        b.id === id ? { ...b, status: status as BookingStatus } : b
      ),
    }));

    return { error: null };
  },

  subscribeToAgencyBookings: () => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const ch = supabase
        .channel(`agency-bookings:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
            filter: `agency_id=eq.${user.id}`,
          },
          () => {
            void get().fetchAgencyBookings({ silent: true });
          }
        )
        .subscribe();

      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  },
}));
