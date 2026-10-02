import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PlatformBranding {
  platformName: string;
  supportEmail: string;
}

// Matches platform_settings' own seeded defaults (supabase/migrations/
// 20260916000015_admin_and_audit.sql) — used only if the row is somehow
// missing or the query fails, so the site never renders a blank brand
// name/support address.
const DEFAULTS: PlatformBranding = { platformName: "Into Nepal", supportEmail: "support@intonepal.com" };

/**
 * Reads the platform's display name and support email from
 * platform_settings (publicly readable — platform_settings_public_select,
 * same migration) instead of hardcoding either string at every call site.
 * Cached indefinitely for the session: these values essentially never
 * change while someone is on the site, and a real change is picked up on
 * the next full page load — not worth refetching on every navigation.
 */
export function usePlatformSettings(): PlatformBranding {
  const { data } = useQuery({
    queryKey: ["platform_settings", "branding"],
    queryFn: async (): Promise<PlatformBranding> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["platform_name", "support_email"]);
      if (error || !data) return DEFAULTS;
      const byKey = Object.fromEntries(data.map((row) => [row.key, row.value]));
      return {
        platformName: (byKey.platform_name as string | undefined) ?? DEFAULTS.platformName,
        supportEmail: (byKey.support_email as string | undefined) ?? DEFAULTS.supportEmail,
      };
    },
    staleTime: Infinity,
  });
  return data ?? DEFAULTS;
}
