import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PlatformSettingsMap {
  platform_name: string;
  site_url: string;
  support_email: string;
  legal_email: string;
  privacy_email: string;
  /** null = not configured yet; callers must hide the phone line entirely rather than show a placeholder. */
  support_phone: string | null;
  support_hours: string;
  maintenance_mode: boolean;
  reservation_fee_percent: number;
  fee_free_cancel_hours_day: number;
  fee_free_cancel_hours_multiday: number;
  inventory_hold_ttl_minutes: number;
  max_holds_per_traveler: number;
  agency_confirm_window_hours: number;
  agency_confirm_reminder_hours: number;
  no_show_dispute_hours: number;
  auto_complete_after_hours: number;
}

// Matches platform_settings' own seeded defaults (supabase/migrations/
// 20260916000015_admin_and_audit.sql, extended by 20260923000001_
// admin_managed_data.sql) — used only if a row is somehow missing or the
// query fails, so the site never renders blank/NaN instead of a sane value.
export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettingsMap = {
  platform_name: "Into Nepal",
  site_url: "https://intonepal.com",
  support_email: "support@intonepal.com",
  legal_email: "legal@intonepal.com",
  privacy_email: "privacy@intonepal.com",
  support_phone: null,
  support_hours: "Sun–Fri, 9am–6pm NPT",
  maintenance_mode: false,
  reservation_fee_percent: 15,
  fee_free_cancel_hours_day: 24,
  fee_free_cancel_hours_multiday: 168,
  inventory_hold_ttl_minutes: 15,
  max_holds_per_traveler: 3,
  agency_confirm_window_hours: 24,
  agency_confirm_reminder_hours: 12,
  no_show_dispute_hours: 48,
  auto_complete_after_hours: 24,
};

/**
 * Reads every platform_settings row (publicly readable —
 * platform_settings_public_select) into one typed map. Every page that
 * used to hardcode a contact address, fee percentage, or cancellation
 * window reads it from here instead, so an admin changing a setting is
 * reflected everywhere without a redeploy. Cached for 10 minutes: these
 * values change rarely and are not security-sensitive to read, so a short
 * staleness window is an acceptable trade for not refetching on every
 * navigation.
 */
export function usePlatformSettings(): PlatformSettingsMap {
  const { data } = useQuery({
    queryKey: ["platform_settings", "all"],
    queryFn: async (): Promise<PlatformSettingsMap> => {
      const { data, error } = await supabase.from("platform_settings").select("key, value");
      if (error || !data) return PLATFORM_SETTINGS_DEFAULTS;
      const byKey = Object.fromEntries(data.map((row) => [row.key, row.value])) as Record<string, unknown>;
      const map = { ...PLATFORM_SETTINGS_DEFAULTS };
      for (const key of Object.keys(map) as (keyof PlatformSettingsMap)[]) {
        if (byKey[key] !== undefined && byKey[key] !== null) {
          (map as Record<string, unknown>)[key] = byKey[key];
        } else if (byKey[key] === null) {
          (map as Record<string, unknown>)[key] = null;
        }
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });
  return data ?? PLATFORM_SETTINGS_DEFAULTS;
}
