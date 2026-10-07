import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Category {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  active: boolean;
  is_multi_day_default: boolean;
  default_confirmation_mode: "instant" | "agency_confirm";
}

/**
 * Reads public.categories (admin-managed — supabase/migrations/20260923000001_
 * admin_managed_data.sql). categories_public_select exposes inactive rows
 * too (existing listings in a deactivated category must still resolve), so
 * every traveler-facing consumer (listing form, filters) must pass
 * `activeOnly: true` to hide deactivated categories from new selection
 * while still letting existing listings display. The admin Catalog page
 * passes `activeOnly: false` to manage every row, including inactive ones.
 */
export function useCategories(options: { activeOnly?: boolean } = {}) {
  const { activeOnly = true } = options;
  return useQuery({
    queryKey: ["categories", activeOnly],
    queryFn: async (): Promise<Category[]> => {
      let query = supabase.from("categories").select("*").order("sort_order", { ascending: true });
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
