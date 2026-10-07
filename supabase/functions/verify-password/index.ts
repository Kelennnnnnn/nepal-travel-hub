// Verifies a caller's CURRENT password before the admin panel lets them
// set a new one (Prompt 24 — the old Settings page collected a "current
// password" field but never checked it before calling updateUser()).
//
// This deliberately does NOT call supabase.auth.signInWithPassword() on
// the caller's own session/client. That call issues a brand-new session,
// and a fresh password-only sign-in carries no MFA factor — it would
// silently reset the session's aal claim back to aal1, locking an admin
// out of every other admin action (which all require aal2) until they
// re-verified MFA, as a side effect of merely changing their password.
// Instead, the check runs against a throwaway anon-key client scoped to
// this single request, which never persists a session and is discarded
// the moment this function returns — the caller's real browser session is
// never touched.

import { createClient } from "@supabase/supabase-js";
import { requirePlatformRole, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { fail, handleOptions, HttpError, ok, parseJson, withRequestLog } from "../_shared/http.ts";
import { verifyPasswordSchema } from "../_shared/schemas.ts";

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
    try {
      const caller = await verifyCaller(req);
      logCtx.userId = caller.id;
      requirePlatformRole(caller, ["admin", "super_admin", "support", "finance"]);

      const { password } = await parseJson(req, verifyPasswordSchema);
      if (!caller.email) return fail(req, 400, "Account has no email on file.");

      const probe = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error } = await probe.auth.signInWithPassword({ email: caller.email, password });
      await probe.auth.signOut().catch(() => {});

      return ok(req, { valid: !error });
    } catch (err) {
      if (err instanceof VerificationError) return fail(req, err.status, err.message);
      if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
      return fail(req, 500, "Something went wrong. Please try again.", err);
    }
  });
});
