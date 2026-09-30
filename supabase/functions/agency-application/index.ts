// Agency application submission — thin wrapper around save_agency_draft()/
// submit_agency_application() (supabase/migrations/20260917000013_
// onboarding_transaction.sql), which do the actual atomic, advisory-
// locked work. This function's jobs: Zod-validate the request body,
// call the RPC as the CALLER's own identity (both RPCs use auth.uid()
// internally — see review-agency-application's admin_suspend_agency call
// for the fullest explanation of why that matters), send the confirmation
// email only after a successful submit, dedupe retried requests via
// Idempotency-Key, and turn raw Postgres errors into a generic message +
// requestId rather than ever returning Postgres error text to the client.

import { requirePlatformRole, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { fail, handleOptions, HttpError, ok, parseJson, userClient, withIdempotency, withRequestLog } from "../_shared/http.ts";
import { agencyApplicationSchema } from "../_shared/schemas.ts";

// save_agency_draft()/submit_agency_application() raise these as P0001
// with the code itself as the message — safe, deliberate, user-facing
// strings. Anything else gets a generic message + requestId, with the
// real error logged server-side for correlation.
const KNOWN_ERROR_CODES = new Set([
  "NOT_AUTHENTICATED", "INVALID_COMPANY_NAME", "INVALID_DESCRIPTION", "INVALID_CITY",
  "INVALID_DISTRICT", "INVALID_ADDRESS", "INVALID_PHONE", "INVALID_EMAIL", "INVALID_WEBSITE",
  "CANNOT_EDIT_IN_STATUS", "NO_APPLICATION_FOUND", "CANNOT_SUBMIT_IN_STATUS", "MISSING_REQUIRED_DOCUMENTS",
]);

function rpcErrorResponse(req: Request, rpcErr: { message: string; code?: string }, ctx: Record<string, unknown>) {
  // rpcErr.message is only ever forwarded to the client when it's one of
  // OUR OWN deliberate, safe P0001 code strings (e.g. CANNOT_EDIT_IN_STATUS)
  // from the allowlist below — never a raw/unexpected Postgres error.
  const knownCode = rpcErr.code === "P0001" ? rpcErr.message : undefined;
  if (knownCode && KNOWN_ERROR_CODES.has(knownCode)) {
    return fail(req, 400, knownCode);
  }
  return fail(req, 500, "Something went wrong. Please try again.", rpcErr, ctx);
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    // Any authenticated user may start an application — becoming "agency"
    // platform role happens only on approval (review-agency-application),
    // not here. No AAL requirement: traveler/agency are not elevated roles.
    requirePlatformRole(caller, ["traveler", "agency"]);

    const body = await parseJson(req, agencyApplicationSchema);
    logCtx.action = body.action;
    const callerClient = userClient(req);

    if (body.action === "save_draft") {
      return await withIdempotency(req, caller.id, "agency-application:save_draft", async () => {
        const { data: agencyId, error } = await callerClient.rpc("save_agency_draft", { p_fields: body.fields });
        if (error) return rpcErrorResponse(req, error, { userId: caller.id });
        return ok(req, { success: true, agency_id: agencyId });
      });
    }

    if (body.action === "submit") {
      return await withIdempotency(req, caller.id, "agency-application:submit", async () => {
        // Persist the review step's final field edits first, if any were
        // sent — matches the original function's behavior of also
        // updating fields on submit, not just on save_draft.
        if (body.fields) {
          const { error: draftErr } = await callerClient.rpc("save_agency_draft", { p_fields: body.fields });
          if (draftErr) return rpcErrorResponse(req, draftErr, { userId: caller.id, step: "save_draft" });
        }

        const { data: agencyId, error: submitErr } = await callerClient.rpc("submit_agency_application");
        if (submitErr) return rpcErrorResponse(req, submitErr, { userId: caller.id, step: "submit" });

        // The confirmation email is no longer sent from here — submit_
        // agency_application() (supabase/migrations/20260917000013_
        // onboarding_transaction.sql) already inserts an
        // AGENCY_APPLICATION_SUBMITTED domain_event in the same
        // transaction as the status change, and dispatch-notifications
        // (audit item 4) is what actually sends it, async and with retry.

        return ok(req, { success: true, agency_id: agencyId });
      });
    }

    return fail(req, 400, "Unknown action");
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
