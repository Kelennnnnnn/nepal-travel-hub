// (assertPaymentsEnabled/assertPayoutsEnabled/getCommissionRate used to live
// here, backing the old Stripe-based payment/payout/commission model —
// removed along with that model. Their platform_settings keys
// (payments_enabled, payouts_enabled, commission_rate) are gone too; see
// supabase/migrations/20260916000015_admin_and_audit.sql for what
// platform_settings now holds. A new gate here, if needed, returns once the
// new NPR reservation-fee model is designed.)

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
