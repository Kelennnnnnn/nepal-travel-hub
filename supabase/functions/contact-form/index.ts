// Contact form — audit M2. The old version was an open relay: no bot
// check at all, CORS wildcard, rate-limited only per submitted email (an
// attacker can just vary the email every request), no length caps beyond
// "truthy", an auto-reply that echoed the attacker's own text back to
// whatever address they typed (a spoofable reflection/spam vector), and a
// notification recipient still pointing at the pre-rebrand
// hello@yatranepal.com address. Fixed: a Cloudflare Turnstile token is
// required and verified server-side, an IP-based rate limit sits
// alongside the existing per-email one, the submission is persisted
// BEFORE any email is sent (so a submission is never silently lost if
// email sending later fails), and the auto-reply is a fixed template with
// zero user-controlled content in it at all.

import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/html.ts";
import { fail, handleOptions, HttpError, ok, parseJson, withRequestLog } from "../_shared/http.ts";
import { contactFormSchema } from "../_shared/schemas.ts";

// Public/anonymous — no verifyCaller() here by design (anyone, signed in
// or not, can use the contact form). No idempotency wrapping either: that
// mechanism is keyed on an authenticated user_id, which doesn't exist for
// an anonymous caller — Turnstile + the two rate limits below are this
// function's actual abuse defenses.

const EMAIL_RATE_LIMIT_MAX = 3;
const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX") ?? "support@intonepal.com";

function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!secret) {
    console.error(JSON.stringify({ level: "error", fn: "contact-form", msg: "TURNSTILE_SECRET_KEY not configured" }));
    return false;
  }
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;

  return withRequestLog(req, async () => {
  try {
    const { name, email, subject, message, turnstileToken } = await parseJson(req, contactFormSchema);
    const clientIp = getClientIp(req);

    // Service-role client (bypasses RLS) — created up front so we can rate-limit
    // and persist the submission before sending any email.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // IP rate limit: at most IP_RATE_LIMIT_MAX submissions per hour from
    // the same IP, regardless of what email address is submitted with
    // each one — closes the "just vary the email" bypass of the
    // per-email limit below.
    const { data: withinIpLimit, error: ipLimitErr } = await supabaseAdmin.rpc("hit_rate_limit", {
      p_bucket: `contact-form:ip:${clientIp}`,
      p_limit: IP_RATE_LIMIT_MAX,
      p_window_seconds: IP_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (ipLimitErr) return fail(req, 500, "Something went wrong. Please try again.", ipLimitErr, { clientIp });
    if (!withinIpLimit) return fail(req, 429, "Too many messages sent recently. Please try again later.");

    // Per-email rate limit (kept from before): at most EMAIL_RATE_LIMIT_MAX
    // submissions per email address per hour.
    const since = new Date(Date.now() - EMAIL_RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("contact_submissions")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= EMAIL_RATE_LIMIT_MAX) {
      return fail(req, 429, "Too many messages sent recently. Please try again later.");
    }

    const turnstileOk = await verifyTurnstile(turnstileToken, clientIp);
    if (!turnstileOk) return fail(req, 400, "Verification failed. Please try again.");

    // Persist FIRST — a submission must never be silently lost just
    // because the notification email later fails to send.
    const { error: insertErr } = await supabaseAdmin.from("contact_submissions").insert({
      name,
      email,
      subject: subject ?? "",
      message,
      status: "new",
    });
    if (insertErr) return fail(req, 500, "Failed to send message. Please try again.", insertErr, { email });

    // Escape all user-supplied values before interpolating into the
    // notification email — raw interpolation would let a crafted name/
    // subject/message inject markup or scripts into the recipient's mail
    // client. The auto-reply below deliberately contains NONE of this —
    // see its own comment.
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = subject ? escapeHtml(subject) : "";
    const safeMessage = escapeHtml(message);

    const contactSubject = subject ? `Contact: ${subject}` : `New message from ${name}`;
    const contactTimestamp = new Date().toISOString();

    const { error: notifyErr } = await sendEmail({
      to: SUPPORT_INBOX,
      subject: contactSubject,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a1a">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:8px 0;color:#666;width:100px"><strong>Name</strong></td>
              <td style="padding:8px 0">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Email</strong></td>
              <td style="padding:8px 0"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
            </tr>
            ${safeSubject ? `
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Subject</strong></td>
              <td style="padding:8px 0">${safeSubject}</td>
            </tr>` : ""}
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px">
            <p style="margin:0;white-space:pre-wrap">${safeMessage}</p>
          </div>
          <p style="margin-top:16px;color:#999;font-size:12px">
            Sent via the Into Nepal contact form on ${contactTimestamp}.
          </p>
        </div>
      `,
      text: `New Contact Form Submission\n\nName   : ${name}\nEmail  : ${email}${subject ? `\nSubject: ${subject}` : ""}\n\n${message}\n\n---\nSent via Into Nepal contact form on ${contactTimestamp}.`,
      replyTo: email,
    });
    if (notifyErr) console.error(JSON.stringify({ level: "warn", fn: "contact-form", msg: "notification send failed", err: notifyErr, email }));

    // Audit M2: the auto-reply is a FIXED template — no name, no message
    // preview, nothing the submitter typed. The old version interpolated
    // both, which meant anyone could make this endpoint deliver arbitrary
    // attacker-controlled text to any address (via the `email` field) via
    // a real, trusted platform mail server.
    const { error: replyErr } = await sendEmail({
      to: email,
      subject: "We received your message — Into Nepal",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a1a">We received your message</h2>
          <p>Thanks for reaching out. We've received your message and will get back to you within one business day.</p>
          <p>If your enquiry is urgent, you can also call us at <strong>+977 1-XXXXXXX</strong> (Sun–Fri, 9am–6pm NPT).</p>
          <p>— The Into Nepal Team</p>
        </div>
      `,
      text: `We received your message\n\nThanks for reaching out. We've received your message and will get back to you within one business day.\n\nIf your enquiry is urgent, call us at +977 1-XXXXXXX (Sun–Fri, 9am–6pm NPT).\n\n— The Into Nepal Team`,
    });
    // The notification email (to support) already went out and the
    // submission is already persisted, so the request itself succeeded —
    // log the auto-reply failure but don't fail the whole response over it.
    if (replyErr) console.error(JSON.stringify({ level: "warn", fn: "contact-form", msg: "auto-reply send failed", err: replyErr, email }));

    return ok(req, { success: true });
  } catch (err) {
    if (err instanceof HttpError) return fail(req, err.status, err.publicMessage);
    return fail(req, 500, "Failed to send message. Please try again.", err);
  }
  });
});
