// Account deletion — pseudonymize, never hard-delete (supabase/
// migrations/20260917000014_account_deletion.sql). bookings/booking_
// quotes/reviews stay (tax/legal record, and other travelers' trust in
// review content); only personal data is scrubbed. The auth.users row
// itself is never deleted — deleteUser() would fail anyway (bookings.
// traveler_id, booking_quotes.traveler_id, messages.sender_id, review_
// votes.user_id, conversation_participants.user_id all reference it with
// no ON DELETE rule, by design, since those records must survive account
// deletion) — instead this function bans the account and scrubs its
// email/metadata via updateUserById(), which is what actually makes
// "cannot sign in" true without breaking every FK that points at this user.

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { logError } from "../_shared/guards.ts";
import { fail, getRequestId, handleOptions, HttpError, ok, parseJson, userClient, withIdempotency, withRequestLog } from "../_shared/http.ts";
import { deleteAccountSchema } from "../_shared/schemas.ts";

// delete_my_account() raises these as P0001 with the code itself as the
// message — mapped here to the actual sentence shown to the user. Any
// other error (a genuinely unexpected one) gets a generic message + a
// requestId, never the raw Postgres error text.
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "You must be signed in to delete your account.",
  ACTIVE_BOOKINGS: "You have an active or upcoming booking. Please wait until it's completed, or cancel it, before deleting your account.",
  SOLE_AGENCY_OWNER: "You're the only owner of an agency. Add another owner or transfer ownership before deleting your account.",
};

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    requirePlatformRole(caller, ["traveler", "agency", "admin", "super_admin", "support", "finance"]);
    await parseJson(req, deleteAccountSchema);

    return await withIdempotency(req, caller.id, "delete-account", async () => {
      // delete_my_account() uses auth.uid() internally to scope every
      // write to the caller's own data — that only resolves correctly
      // when this call is authenticated as the caller's own JWT, not the
      // service-role key.
      const callerClient = userClient(req);

      const { error: rpcErr } = await callerClient.rpc("delete_my_account", { p_request_id: getRequestId(req) });
      if (rpcErr) {
        if (rpcErr.code === "P0001" && KNOWN_ERROR_MESSAGES[rpcErr.message]) {
          return fail(req, 400, KNOWN_ERROR_MESSAGES[rpcErr.message]);
        }
        return fail(req, 500, "Something went wrong. Please try again.", rpcErr, { userId: caller.id });
      }

      // From here on the caller's personal data has already been scrubbed
      // and committed — these remaining steps (avatar removal, banning
      // the auth account, revoking sessions) are best-effort cleanup on
      // top of that, not a second chance to refuse the deletion.
      const supabaseAdmin = serviceRoleClient();

      const { data: avatarFiles } = await supabaseAdmin.storage.from("avatars").list(caller.id);
      if (avatarFiles?.length) {
        const { error: removeErr } = await supabaseAdmin.storage
          .from("avatars")
          .remove(avatarFiles.map((f) => `${caller.id}/${f.name}`));
        if (removeErr) logError("delete-account:remove-avatar", removeErr, { userId: caller.id });
      }

      // The actual "you can no longer sign in" guarantee. If this fails,
      // the promise this endpoint makes is broken even though the
      // person's data is already gone, so it's surfaced as an error
      // rather than silently reported as success.
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(caller.id, {
        email: `deleted+${caller.id}@deleted.intonepal.invalid`,
        user_metadata: {},
        ban_duration: "876000h",
      });
      if (banErr) {
        return fail(
          req, 500,
          "Your data has been deleted, but we couldn't fully lock your account. Please contact support.",
          banErr, { userId: caller.id },
        );
      }

      const { error: revokeErr } = await supabaseAdmin.rpc("revoke_user_sessions", { p_user_id: caller.id });
      if (revokeErr) logError("delete-account:revoke_user_sessions", revokeErr, { userId: caller.id });

      return ok(req, { success: true });
    });
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
