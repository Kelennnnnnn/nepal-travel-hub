import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Reads one row of admin-editable marketing copy from site_content
 * (publicly readable — site_content_public_select). `fallback` is the
 * exact current hardcoded copy for that key, so a missing row or failed
 * query never blanks the page — it just falls back to today's wording.
 * Works for both flat object shapes (home_hero: {heading, subheading}) and
 * array shapes (faq, about_team, home_quick_picks, topbar_announcements) —
 * an array value is returned as-is; a plain-object value is merged over
 * `fallback` so a partially-edited row still has every expected key.
 */
export function useSiteContent<T>(key: string, fallback: T): T {
  const { data } = useQuery({
    queryKey: ["site_content", key],
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error || !data) return fallback;
      const value = data.value as unknown;
      if (Array.isArray(value)) return value as T;
      if (value && typeof value === "object") return { ...(fallback as object), ...value } as T;
      return fallback;
    },
    staleTime: 10 * 60 * 1000,
  });
  return data ?? fallback;
}
