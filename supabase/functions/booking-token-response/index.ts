// booking-token-response — the backing endpoint for the one-tap /r/:token
// accept/decline link an agency gets emailed/texted when a booking needs
// their confirmation (Phase 21). No login required — the token itself is
// the credential (respond_via_token(), migration 20260920000001, is
// granted to anon for exactly this reason). IP rate-limited here (not in
// SQL — hit_rate_limit() is service_role-only and this is a cheap, purely
// abuse-prevention concern that belongs at the edge, same reasoning as
// contact-form's own IP limit).

import { createClient } from "@supabase/supabase-js";
import { fail, handleOptions, HttpError, ok, parseJson, withRequestLog } from "../_shared/http.ts";
import { bookingTokenResponseSchema } from "../_shared/schemas.ts";

const IP_RATE_LIMIT_MAX = 20;
const IP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function serviceRoleAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function anonClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** respond_via_token()'s own exceptions are already generic enough to show a traveler/agency directly (no internal detail leaks) — this just maps them to friendly copy; anything unrecognized falls back to a fully generic message. */
function publicMessageFor(dbMessage: string | undefined): string {
  switch (dbMessage) {
    case "INVALID_TOKEN": return "This link is invalid.";
    case "TOKEN_ALREADY_USED": return "This link has already been used.";
    case "TOKEN_EXPIRED": return "This link has expired.";
    case "NOT_AWAITING_CONFIRMATION": return "This booking is no longer waiting on a response.";
    case "DEADLINE_PASSED": return "The response window for this booking has passed.";
    default:
      if (dbMessage?.startsWith("INVALID_REASON")) return "Please provide a reason (10-500 characters) when declining.";
      return "Something went wrong. Please try again.";
  }
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;
  if (req.method !== "POST") return fail(req, 405, "Method not allowed");

  return withRequestLog(req, async () => {
    try {
      const { token, accept, reason } = await parseJson(req, bookingTokenResponseSchema);
      const clientIp = getClientIp(req);

      const admin = serviceRoleAdmin();
      const { data: withinLimit, error: limitErr } = await admin.rpc("hit_rate_limit", {
        p_bucket: `booking-token-response:ip:${clientIp}`,
        p_limit: IP_RATE_LIMIT_MAX,
        p_window_seconds: IP_RATE_LIMIT_WINDOW_SECONDS,
      });
      if (limitErr) return fail(req, 500, "Something went wrong. Please try again.", limitErr, { clientIp });
      if (!withinLimit) return fail(req, 429, "Too many attempts. Please try again later.");

      const supabase = anonClient();
      const { error: respondErr } = await supabase.rpc("respond_via_token", {
        p_token: token,
        p_accept: accept,
        p_reason: reason ?? null,
      });

      if (respondErr) {
        return fail(req, 400, publicMessageFor(respondErr.message), respondErr);
      }

      return ok(req, { success: true });
    } catch (err) {
      if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
      return fail(req, 500, "Something went wrong. Please try again.", err);
    }
  });
});
