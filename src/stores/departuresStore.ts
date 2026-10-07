import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────
// Matches supabase/migrations/20260916000004_catalog.sql (blackout_dates,
// seasonal_pricing — Phase 2). Departures themselves are system-managed as
// of Phase 19 (supabase/migrations/20260918000001_booking_rules.sql) —
// ensure_departure() creates them on demand, so there is no more agency-
// facing departure/capacity CRUD here; see src/stores/bookingRulesStore.ts
// and the booking-rule columns on listingsStore.ts's Listing type instead.

export interface SeasonalPricing {
  id: string;
  listing_id: string;
  season_name: string;
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
}

export interface BlackoutDate {
  id: string;
  listing_id: string;
  blackout_date: string;
  reason: string | null;
}

// ── Store interface ────────────────────────────────────────

interface DeparturesStore {
  seasonalPricing: SeasonalPricing[];
  blackoutDates: BlackoutDate[];
  isLoading: boolean;

  fetchSeasonalPricing: (listingId: string) => Promise<void>;
  addSeasonalPricing: (row: Omit<SeasonalPricing, "id" | "currency">) => Promise<{ error: string | null }>;
  deleteSeasonalPricing: (id: string) => Promise<{ error: string | null }>;

  fetchBlackoutDates: (listingId: string) => Promise<void>;
  addBlackoutDate: (listingId: string, blackoutDate: string, reason?: string) => Promise<{ error: string | null }>;
  deleteBlackoutDate: (id: string) => Promise<{ error: string | null }>;

  reset: () => void;
}

export const useDeparturesStore = create<DeparturesStore>((set, get) => ({
  seasonalPricing: [],
  blackoutDates: [],
  isLoading: false,

  fetchSeasonalPricing: async (listingId) => {
    const { data, error } = await supabase
      .from("seasonal_pricing")
      .select("*")
      .eq("listing_id", listingId)
      .order("start_date", { ascending: true });
    if (error) {
      logger.error("Error fetching seasonal pricing:", error.message);
      return;
    }
    set({ seasonalPricing: (data ?? []) as SeasonalPricing[] });
  },

  addSeasonalPricing: async (row) => {
    const { data, error } = await supabase.from("seasonal_pricing").insert(row).select().single();
    if (error) return { error: error.message };
    set({ seasonalPricing: [...get().seasonalPricing, data as SeasonalPricing] });
    return { error: null };
  },

  deleteSeasonalPricing: async (id) => {
    const { error } = await supabase.from("seasonal_pricing").delete().eq("id", id);
    if (error) return { error: error.message };
    set({ seasonalPricing: get().seasonalPricing.filter((s) => s.id !== id) });
    return { error: null };
  },

  fetchBlackoutDates: async (listingId) => {
    const { data, error } = await supabase
      .from("blackout_dates")
      .select("*")
      .eq("listing_id", listingId)
      .order("blackout_date", { ascending: true });
    if (error) {
      logger.error("Error fetching blackout dates:", error.message);
      return;
    }
    set({ blackoutDates: (data ?? []) as BlackoutDate[] });
  },

  addBlackoutDate: async (listingId, blackoutDate, reason) => {
    const { data, error } = await supabase
      .from("blackout_dates")
      .insert({ listing_id: listingId, blackout_date: blackoutDate, reason: reason || null })
      .select()
      .single();
    if (error) return { error: error.message };
    set({ blackoutDates: [...get().blackoutDates, data as BlackoutDate] });
    return { error: null };
  },

  deleteBlackoutDate: async (id) => {
    const { error } = await supabase.from("blackout_dates").delete().eq("id", id);
    if (error) return { error: error.message };
    set({ blackoutDates: get().blackoutDates.filter((b) => b.id !== id) });
    return { error: null };
  },

  reset: () => set({ seasonalPricing: [], blackoutDates: [] }),
}));
