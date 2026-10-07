import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────
// Matches supabase/migrations/20260918000001_booking_rules.sql
// (agency_blackout_periods, platform_blackout_presets, apply_blackout_
// preset, agency_close_date).

export interface AgencyBlackoutPeriod {
  id: string;
  agency_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  listing_ids: string[] | null;
  created_at: string;
}

export interface BlackoutPreset {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  year: number;
  description: string | null;
  active: boolean;
}

// ── Store interface ────────────────────────────────────────

interface BookingRulesStore {
  blackoutPeriods: AgencyBlackoutPeriod[];
  presets: BlackoutPreset[];
  allPresets: BlackoutPreset[];   // admin: every preset, not just active ones
  isLoading: boolean;

  fetchBlackoutPeriods: (agencyId: string) => Promise<void>;
  addBlackoutPeriod: (row: {
    agency_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
    listing_ids?: string[] | null;
  }) => Promise<{ error: string | null }>;
  deleteBlackoutPeriod: (id: string) => Promise<{ error: string | null }>;
  closeDate: (listingId: string, date: string, reason?: string) => Promise<{ error: string | null }>;

  // Agency: active presets only, for the "Apply festival preset" dropdown.
  fetchPresets: () => Promise<void>;
  applyPreset: (presetId: string, listingIds?: string[] | null) => Promise<{ error: string | null }>;

  // Admin: full CRUD over every preset (active or not).
  fetchAllPresets: () => Promise<void>;
  createPreset: (row: Omit<BlackoutPreset, "id">) => Promise<{ error: string | null }>;
  updatePreset: (id: string, row: Partial<Omit<BlackoutPreset, "id">>) => Promise<{ error: string | null }>;
  deletePreset: (id: string) => Promise<{ error: string | null }>;

  reset: () => void;
}

export const useBookingRulesStore = create<BookingRulesStore>((set, get) => ({
  blackoutPeriods: [],
  presets: [],
  allPresets: [],
  isLoading: false,

  fetchBlackoutPeriods: async (agencyId) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from("agency_blackout_periods")
      .select("*")
      .eq("agency_id", agencyId)
      .order("start_date", { ascending: true });
    if (error) {
      logger.error("Error fetching agency blackout periods:", error.message);
      set({ isLoading: false });
      return;
    }
    set({ blackoutPeriods: (data ?? []) as AgencyBlackoutPeriod[], isLoading: false });
  },

  addBlackoutPeriod: async (row) => {
    const { data, error } = await supabase.from("agency_blackout_periods").insert(row).select().single();
    if (error) return { error: error.message };
    set({
      blackoutPeriods: [...get().blackoutPeriods, data as AgencyBlackoutPeriod].sort((a, b) =>
        a.start_date.localeCompare(b.start_date)
      ),
    });
    return { error: null };
  },

  deleteBlackoutPeriod: async (id) => {
    const { error } = await supabase.from("agency_blackout_periods").delete().eq("id", id);
    if (error) return { error: error.message };
    set({ blackoutPeriods: get().blackoutPeriods.filter((b) => b.id !== id) });
    return { error: null };
  },

  closeDate: async (listingId, date, reason) => {
    const { error } = await supabase.rpc("agency_close_date", {
      p_listing_id: listingId,
      p_date: date,
      p_reason: reason ?? null,
    });
    return { error: error?.message ?? null };
  },

  fetchPresets: async () => {
    const { data, error } = await supabase
      .from("platform_blackout_presets")
      .select("*")
      .eq("active", true)
      .order("start_date", { ascending: true });
    if (error) {
      logger.error("Error fetching blackout presets:", error.message);
      return;
    }
    set({ presets: (data ?? []) as BlackoutPreset[] });
  },

  applyPreset: async (presetId, listingIds) => {
    const { error } = await supabase.rpc("apply_blackout_preset", {
      p_preset_id: presetId,
      p_listing_ids: listingIds ?? null,
    });
    return { error: error?.message ?? null };
  },

  fetchAllPresets: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from("platform_blackout_presets")
      .select("*")
      .order("year", { ascending: false })
      .order("start_date", { ascending: true });
    if (error) {
      logger.error("Error fetching all blackout presets:", error.message);
      set({ isLoading: false });
      return;
    }
    set({ allPresets: (data ?? []) as BlackoutPreset[], isLoading: false });
  },

  createPreset: async (row) => {
    const { data, error } = await supabase.from("platform_blackout_presets").insert(row).select().single();
    if (error) return { error: error.message };
    set({ allPresets: [data as BlackoutPreset, ...get().allPresets] });
    return { error: null };
  },

  updatePreset: async (id, row) => {
    const { error } = await supabase.from("platform_blackout_presets").update(row).eq("id", id);
    if (error) return { error: error.message };
    set({ allPresets: get().allPresets.map((p) => (p.id === id ? { ...p, ...row } : p)) });
    return { error: null };
  },

  deletePreset: async (id) => {
    const { error } = await supabase.from("platform_blackout_presets").delete().eq("id", id);
    if (error) return { error: error.message };
    set({ allPresets: get().allPresets.filter((p) => p.id !== id) });
    return { error: null };
  },

  reset: () => set({ blackoutPeriods: [], presets: [], allPresets: [] }),
}));
