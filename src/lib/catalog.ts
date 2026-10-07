export const DURATION_RANGES = [
  { value: "1",   label: "1 day" },
  { value: "2-3", label: "2–3 days" },
  { value: "4-7", label: "4–7 days" },
  { value: "8+",  label: "8+ days" },
];

// Single source of truth for difficulty — mirrors listings' difficulty
// CHECK constraint (supabase/migrations/20260916000004_catalog.sql) exactly.
// Unlike category/location (Prompt 24: admin-managed via DB tables),
// difficulty is a small, stable enum not worth a full CRUD table for — a
// pgTAP test (supabase/tests/difficulty-enum-matches-frontend.sql) asserts
// this array and the live CHECK constraint never drift apart.
export const DIFFICULTIES = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"] as const;
