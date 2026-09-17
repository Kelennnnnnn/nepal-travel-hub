import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────
// Matches supabase/migrations/20260916000004_catalog.sql (departures,
// blackout_dates, seasonal_pricing — Phase 2) and
// supabase/migrations/20260916000005_inventory.sql (inventory — Phase 2),
// with the capacity write path added in Phase 6
// (20260917000003_departure_capacity.sql).

export type DepartureStatus = "scheduled" | "closed" | "cancelled";

export interface Inventory {
  id: string;
  departure_id: string;
  capacity_total: number;
  capacity_held: number;
  capacity_confirmed: number;
  version: number;
}

export interface Departure {
  id: string;
  listing_id: string;
  agency_id: string;
  departure_date: string;
  cutoff_at: string | null;
  status: DepartureStatus;
  created_at: string;
  updated_at: string;
  inventory: Inventory | null;
}

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

function available(inv: Inventory | null): number {
  if (!inv) return 0;
  return inv.capacity_total - inv.capacity_held - inv.capacity_confirmed;
}

// ── Store interface ────────────────────────────────────────

interface DeparturesStore {
  departures: Departure[];
  seasonalPricing: SeasonalPricing[];
  blackoutDates: BlackoutDate[];
  isLoading: boolean;

  fetchDepartures: (listingId: string) => Promise<void>;
  createDeparture: (listingId: string, agencyId: string, departureDate: string, cutoffAt?: string | null) => Promise<{ error: string | null }>;
  setCapacity: (departureId: string, capacityTotal: number) => Promise<{ error: string | null }>;
  setDepartureStatus: (departureId: string, status: DepartureStatus) => Promise<{ error: string | null }>;
  deleteDeparture: (departureId: string) => Promise<{ error: string | null }>;

  fetchSeasonalPricing: (listingId: string) => Promise<void>;
  addSeasonalPricing: (row: Omit<SeasonalPricing, "id" | "currency">) => Promise<{ error: string | null }>;
  deleteSeasonalPricing: (id: string) => Promise<{ error: string | null }>;

  fetchBlackoutDates: (listingId: string) => Promise<void>;
  addBlackoutDate: (listingId: string, blackoutDate: string, reason?: string) => Promise<{ error: string | null }>;
  deleteBlackoutDate: (id: string) => Promise<{ error: string | null }>;

  reset: () => void;
}

export const useDeparturesStore = create<DeparturesStore>((set, get) => ({
  departures: [],
  seasonalPricing: [],
  blackoutDates: [],
  isLoading: false,

  fetchDepartures: async (listingId) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from("departures")
      .select("*, inventory(*)")
      .eq("listing_id", listingId)
      .order("departure_date", { ascending: true });

    if (error) {
      logger.error("Error fetching departures:", error.message);
      set({ isLoading: false });
      return;
    }
    const rows = (data ?? []).map((d) => ({
      ...d,
      inventory: Array.isArray(d.inventory) ? (d.inventory[0] ?? null) : d.inventory,
    })) as Departure[];
    set({ departures: rows, isLoading: false });
  },

  createDeparture: async (listingId, agencyId, departureDate, cutoffAt = null) => {
    const { data, error } = await supabase
      .from("departures")
      .insert({ listing_id: listingId, agency_id: agencyId, departure_date: departureDate, cutoff_at: cutoffAt })
      .select()
      .single();
    if (error) return { error: error.message };
    set({ departures: [...get().departures, { ...data, inventory: null } as Departure].sort((a, b) => a.departure_date.localeCompare(b.departure_date)) });
    return { error: null };
  },

  setCapacity: async (departureId, capacityTotal) => {
    const { error } = await supabase.rpc("set_departure_capacity", {
      p_departure_id: departureId,
      p_capacity_total: capacityTotal,
    });
    if (error) return { error: error.message };

    // Re-fetch just this departure's inventory row rather than the whole
    // list — set_departure_capacity() is SECURITY DEFINER so it doesn't
    // return the row itself.
    const { data } = await supabase.from("inventory").select("*").eq("departure_id", departureId).single();
    if (data) {
      set({
        departures: get().departures.map((d) => (d.id === departureId ? { ...d, inventory: data as Inventory } : d)),
      });
    }
    return { error: null };
  },

  setDepartureStatus: async (departureId, status) => {
    const { error } = await supabase.from("departures").update({ status }).eq("id", departureId);
    if (error) return { error: error.message };
    set({ departures: get().departures.map((d) => (d.id === departureId ? { ...d, status } : d)) });
    return { error: null };
  },

  deleteDeparture: async (departureId) => {
    const { error } = await supabase.from("departures").delete().eq("id", departureId);
    if (error) return { error: error.message };
    set({ departures: get().departures.filter((d) => d.id !== departureId) });
    return { error: null };
  },

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

  reset: () => set({ departures: [], seasonalPricing: [], blackoutDates: [] }),
}));

export { available as availableCapacity };
