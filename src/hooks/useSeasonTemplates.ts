import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SeasonTemplate {
  id: string;
  label: string;
  start_mmdd: string;
  end_mmdd: string;
  suggested_multiplier: number | null;
  sort_order: number;
  active: boolean;
}

export function useSeasonTemplates() {
  return useQuery({
    queryKey: ["season_templates"],
    queryFn: async (): Promise<SeasonTemplate[]> => {
      const { data, error } = await supabase
        .from("season_templates")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SeasonTemplate[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Turns a template's month-day boundaries into real dates for the next
 * occurrence of that window from `from` (default: today). Rolls the end
 * date into the FOLLOWING year when end_mmdd < start_mmdd (e.g. a
 * "Dec – Feb" window) — the bug this replaces built both dates in the same
 * calendar year, so Winter's end date (Feb 28) landed before its start
 * date (Dec 1) and was rejected by seasonal_pricing's end_date >= start_date
 * check.
 */
export function resolveTemplateDates(template: SeasonTemplate, from: Date = new Date()): { startDate: string; endDate: string } {
  const year = from.getFullYear();
  const startDate = `${year}-${template.start_mmdd}`;
  const wrapsYear = template.end_mmdd < template.start_mmdd;
  const endYear = wrapsYear ? year + 1 : year;
  const endDate = `${endYear}-${template.end_mmdd}`;
  return { startDate, endDate };
}
