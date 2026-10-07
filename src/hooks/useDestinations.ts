import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Destination {
  id: string;
  name: string;
  district: string;
  province: string;
  region: string | null;
  active: boolean;
  sort_order: number;
}

/**
 * Reads public.destinations (admin-managed — supabase/migrations/
 * 20260923000001_admin_managed_data.sql). Like categories, destinations_
 * public_select exposes inactive rows too, so traveler-facing consumers
 * pass `activeOnly: true` (the default) and the admin Catalog page passes
 * `activeOnly: false` to manage every row.
 */
export function useDestinations(options: { activeOnly?: boolean } = {}) {
  const { activeOnly = true } = options;
  return useQuery({
    queryKey: ["destinations", activeOnly],
    queryFn: async (): Promise<Destination[]> => {
      let query = supabase.from("destinations").select("*").order("sort_order", { ascending: true });
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Destination[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
