// Shared caller-verification helpers for edge functions.
//
// PHASE_3_AUTH.md: every admin-tier action must independently verify BOTH
// the caller's platform role (from app_metadata, never user_metadata — see
// AUDIT_REPORT.md AUTH-07/RLS-02) AND the caller's authentication-assurance
// level (AUDIT_REPORT.md AUTH-01 found nothing server-side ever checked
// this, so an admin session that had never completed its TOTP challenge
// still carried full admin authorization everywhere).
//
// This is the Deno/edge-function equivalent of the Postgres helpers in
// supabase/migrations/20260916000001_extensions_and_helpers.sql
// (is_admin() / is_finance_or_admin() / is_support_or_admin() / is_super_admin()).
// The two implementations cannot share code (one runs inside Postgres, one
// in Deno) and must be kept in sync BY HAND — documented here and there so
// this duplication is a deliberate, tracked decision, not a discovered gap.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PlatformRole = "traveler" | "agency" | "admin" | "super_admin" | "support" | "finance";

export interface VerifiedCaller {
  id: string;
  email: string | undefined;
  role: PlatformRole;
  aal: "aal1" | "aal2";
}

/**
 * Decodes the `aal` claim directly from the JWT payload. This is safe to do
 * WITHOUT re-verifying the signature here, because the token has already
 * been cryptographically verified by the `supabase.auth.getUser(token)` call
 * that must always run immediately before this — decoding a claim from an
 * already-verified token is just reading data, not trusting an unverified
 * one. Never call this on a token you have not first passed through
 * getUser().
 */
function decodeAal(token: string): "aal1" | "aal2" {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/**
 * Verifies the caller's identity from the request's Bearer token and
 * returns their platform role (app_metadata only) and AAL. Throws a
 * `VerificationError` (with an HTTP status) on any failure — callers should
 * catch this and translate it into a JSON error response.
 */
export class VerificationError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function verifyCaller(req: Request): Promise<VerifiedCaller> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new VerificationError("Missing or invalid Authorization header", 401);
  }
  const token = authHeader.slice(7);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    throw new VerificationError("Invalid or expired token", 401);
  }

  return {
    id: user.id,
    email: user.email,
    role: (user.app_metadata?.role as PlatformRole | undefined) ?? "traveler",
    aal: decodeAal(token),
  };
}

/** Elevated roles that are subject to the mandatory-MFA rule (target §28). */
const ELEVATED_ROLES: PlatformRole[] = ["admin", "super_admin", "support", "finance"];

/**
 * Throws unless the caller's role is one of `allowedRoles` AND — for any
 * elevated role — their session is at aal2. Mirrors the SQL is_admin()/
 * is_finance_or_admin()/is_support_or_admin() functions exactly: an
 * elevated-role account that has not completed MFA can never pass this,
 * by design (PHASE_3_AUTH.md — this is the fix for AUDIT_REPORT.md AUTH-01,
 * applied at the edge-function layer to match the database layer).
 */
export function requirePlatformRole(caller: VerifiedCaller, allowedRoles: PlatformRole[]): void {
  if (!allowedRoles.includes(caller.role)) {
    throw new VerificationError(`Requires one of: ${allowedRoles.join(", ")}`, 403);
  }
  if (ELEVATED_ROLES.includes(caller.role) && caller.aal !== "aal2") {
    throw new VerificationError("This action requires multi-factor authentication. Please complete MFA verification.", 403);
  }
}

/** Convenience export for building a service-role client — every admin-tier edge function needs one. */
export function serviceRoleClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
