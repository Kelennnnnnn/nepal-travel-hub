import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = () => createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** Throws a 503-style object if payments/payouts are disabled or maintenance is on. */
export async function assertPaymentsEnabled(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sb = admin();
  const { data } = await sb
    .from("platform_settings")
    .select("key, value")
    .in("key", ["payments_enabled", "maintenance_mode"]);

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  if (map.maintenance_mode === true) {
    return { ok: false, status: 503, error: "The platform is under maintenance. Please try again shortly." };
  }
  if (map.payments_enabled === false) {
    return { ok: false, status: 503, error: "Payments are temporarily paused. Please try again shortly." };
  }
  return { ok: true };
}

export async function assertPayoutsEnabled(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sb = admin();
  const { data } = await sb
    .from("platform_settings")
    .select("value")
    .eq("key", "payouts_enabled")
    .maybeSingle();
  if (data?.value === false) {
    return { ok: false, status: 503, error: "Payouts are temporarily paused." };
  }
  return { ok: true };
}

/** Reads the commission rate from settings; defaults to 10 if unset. */
export async function getCommissionRate(): Promise<number> {
  const sb = admin();
  const { data } = await sb
    .from("platform_settings")
    .select("value")
    .eq("key", "commission_rate")
    .maybeSingle();
  const rate = Number(data?.value);
  return Number.isFinite(rate) && rate > 0 ? rate : 10;
}

/** Strips sensitive keys before logging. Use instead of raw console.error on objects. */
const SENSITIVE = ["account_number", "account_number_encrypted", "routing_swift", "cvv", "card", "password", "token", "client_secret", "secret"];
export function scrub(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const clone: Record<string, unknown> = Array.isArray(obj) ? [] as never : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) clone[k] = "***REDACTED***";
    else if (v && typeof v === "object") clone[k] = scrub(v);
    else clone[k] = v;
  }
  return clone;
}

export function logError(context: string, err: unknown, extra?: Record<string, unknown>) {
  console.error(context, (err as Error)?.message ?? err, extra ? scrub(extra) : "");
}
