// send-welcome-email
//
// Called from the frontend (src/stores/authStore.ts) once a session is
// established whose email_confirmed_at is set. There is no pg_net/DB
// trigger anywhere in this project's migration history that ever called
// this — that was a documented-but-never-built delivery path (see the
// migration that added welcome_emails for the full story) — so this is
// now the ONLY caller, and it accepts only a real user JWT: the service-
// role path this used to also accept is gone, since nothing legitimate
// calls it that way anymore and dropping it removes an entire class of
// "is this really the trusted caller" question.
//
// Double-send safety: welcome_emails.user_id is a primary key, so
// `insert ... on conflict do nothing returning user_id` only returns a row
// for whichever of two concurrent calls actually wins the race — the
// loser sees no returned row and sends nothing. If the actual send then
// fails, the winner's row is deleted so a later retry (next page load,
// next auth state change) can try again instead of being permanently
// blocked by a row that recorded a send that never happened.

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { welcomeEmail } from "../_shared/emailTemplates.ts";
import { fail, handleOptions, HttpError, ok, parseJson, withRequestLog } from "../_shared/http.ts";
import { sendWelcomeEmailSchema } from "../_shared/schemas.ts";

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;
  if (req.method !== "POST") return fail(req, 405, "Method not allowed");

  return withRequestLog(req, async (logCtx) => {
  try {
    const caller = await verifyCaller(req);
    logCtx.userId = caller.id;
    requirePlatformRole(caller, ["traveler", "agency", "admin", "super_admin", "support", "finance"]);
    await parseJson(req, sendWelcomeEmailSchema);

    const supabaseAdmin = serviceRoleClient();

    const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(caller.id);
    if (userErr || !authUser.user) return fail(req, 404, "User not found");

    const user = authUser.user;
    const email = user.email;
    if (!email) return fail(req, 400, "User has no email address");
    if (!user.email_confirmed_at) return ok(req, { success: true, skipped: true });

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("welcome_emails")
      .insert({ user_id: caller.id })
      .select("user_id")
      .maybeSingle();
    if (insertErr && insertErr.code !== "23505") {
      return fail(req, 500, "Something went wrong. Please try again.", insertErr, { userId: caller.id });
    }
    if (!inserted) {
      // Either already sent, or a concurrent call just won the race —
      // either way, not this call's job to send.
      return ok(req, { success: true, skipped: true });
    }

    const name = (user.user_metadata?.name as string) ?? email.split("@")[0];
    const { subject, html, text } = welcomeEmail({ name });

    const { error: emailErr } = await sendEmail({
      to: email,
      subject,
      html,
      text,
      tags: [{ name: "type", value: "welcome" }],
    });
    if (emailErr) {
      // Sending failed — remove the row we just inserted so a later retry
      // isn't permanently blocked by a "sent" record for a send that
      // never actually happened.
      await supabaseAdmin.from("welcome_emails").delete().eq("user_id", caller.id);
      return fail(req, 500, "Failed to send welcome email.", emailErr, { userId: caller.id });
    }

    return ok(req, { success: true });
  } catch (err) {
    if (err instanceof VerificationError) return fail(req, err.status, err.message);
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Something went wrong. Please try again.", err);
  }
  });
});
