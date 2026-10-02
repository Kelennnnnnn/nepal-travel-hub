// Centralized platform identity for every edge function that sends email
// or builds a user-facing link/name — one place to read these three
// values from, instead of each file hardcoding (or independently
// env-reading) its own copy. All three fall back to the current
// production identity if the env var isn't set, so nothing breaks in an
// environment where they were never configured.

export const PLATFORM_NAME = Deno.env.get("PLATFORM_NAME") ?? "Into Nepal";
export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://intonepal.com";
export const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX") ?? "support@intonepal.com";
