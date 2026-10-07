import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PublishedListingRow } from "@/lib/queries";

export interface HomeSections {
  tabs: {
    all: PublishedListingRow[];
    best_sellers: PublishedListingRow[];
    remote: PublishedListingRow[];
    cultural: PublishedListingRow[];
  };
  difficulty_counts: Record<string, { count: number; example_location: string | null }>;
}

const EMPTY: HomeSections = {
  tabs: { all: [], best_sellers: [], remote: [], cultural: [] },
  difficulty_counts: {},
};

/**
 * Everything the home page needs (featured-tab listings + a per-difficulty
 * breakdown) in one call, instead of fetching 100 published listings
 * client-side just to build the same four tabs and difficulty counts in JS.
 */
export function useHomeSections() {
  const { data } = useQuery({
    queryKey: ["home_sections"],
    queryFn: async (): Promise<HomeSections> => {
      const { data, error } = await supabase.rpc("home_sections");
      if (error || !data) return EMPTY;
      return data as unknown as HomeSections;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? EMPTY;
}
