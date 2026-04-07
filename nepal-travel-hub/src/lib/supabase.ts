import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when env vars are missing — auth and API calls need a real Supabase project. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl?.trim() && supabaseAnonKey?.trim()
);

if (!isSupabaseConfigured) {
  console.warn(
    "[nepal-travel-hub] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and add your Supabase URL and anon key. " +
      "The UI will load without them; sign-in and data features require a configured project."
  );
}

// Placeholder values only satisfy createClient when env is missing; guard real usage with isSupabaseConfigured.
export const supabase = createClient(
  supabaseUrl ?? "https://ljgifhifmvwmoblpwbth.supabase.co",
  supabaseAnonKey ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.local-dev-placeholder"
);
