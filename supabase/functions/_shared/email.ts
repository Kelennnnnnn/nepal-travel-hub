// Email transport selection — audit M3.
//
// The old logic routed to the Mailtrap sandbox whenever Mailtrap secrets
// happened to be *present* in the environment, regardless of what
// environment this actually was — leaving MAILTRAP_* secrets set in a
// production project (e.g. forgotten after testing) would silently
// swallow every real email into a sandbox inbox nobody looks at, with no
// error, no log, nothing. Transport is now an explicit choice
// (EMAIL_MODE), not an accident of which secrets exist, and picking the
// sandbox in production is a boot-time failure, not a silent behavior
// change.

const ENVIRONMENT = (Deno.env.get("ENVIRONMENT") ?? "").toLowerCase();
const IS_PRODUCTION = ENVIRONMENT === "production";

const EMAIL_MODE = (Deno.env.get("EMAIL_MODE") ?? "resend").toLowerCase();
if (EMAIL_MODE !== "resend" && EMAIL_MODE !== "mailtrap") {
  throw new Error(`Invalid EMAIL_MODE "${EMAIL_MODE}" — must be "resend" or "mailtrap".`);
}
if (EMAIL_MODE === "mailtrap" && IS_PRODUCTION) {
  throw new Error("EMAIL_MODE=mailtrap is not allowed when ENVIRONMENT=production — refusing to boot.");
}

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")  ?? "";
const REPLY_TO_EMAIL  = Deno.env.get("REPLY_TO_EMAIL")  ?? "hello@intonepal.com";
const PLATFORM_NAME   = "Into Nepal";

// No onboarding@resend.dev fallback in production — that address is
// Resend's own shared test sender, rate-limited and not actually
// deliverable as "from" real domains' inboxes expect; a production
// deployment that never set FROM_EMAIL would otherwise silently send
// every email from a sandbox address indefinitely.
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? (IS_PRODUCTION ? "" : "onboarding@resend.dev");
if (IS_PRODUCTION && !FROM_EMAIL) {
  throw new Error("FROM_EMAIL must be set when ENVIRONMENT=production — refusing to boot.");
}

// Mailtrap Email Testing — set MAILTRAP_USER + MAILTRAP_PASS (the SMTP credentials
// shown in mailtrap.io → Email Testing → Inboxes → Show Credentials).
// The SMTP password doubles as the Bearer token for Mailtrap's HTTP API.
// Also set MAILTRAP_INBOX_ID to the number in the inbox URL.
const MAILTRAP_USER      = Deno.env.get("MAILTRAP_USER")      ?? "";
const MAILTRAP_API_TOKEN = Deno.env.get("MAILTRAP_API_TOKEN") ?? Deno.env.get("MAILTRAP_PASS") ?? "";
const MAILTRAP_INBOX_ID  = Deno.env.get("MAILTRAP_INBOX_ID")  ?? "";
if (EMAIL_MODE === "mailtrap" && !((MAILTRAP_USER || MAILTRAP_API_TOKEN) && MAILTRAP_INBOX_ID)) {
  throw new Error("EMAIL_MODE=mailtrap requires MAILTRAP_USER/MAILTRAP_API_TOKEN and MAILTRAP_INBOX_ID to be set.");
}

// Logged exactly once, at module load (cold start) — one line per running
// isolate, not per request, so this doesn't add log noise but still makes
// "which transport is this deployment actually using" a fact anyone
// reading the logs can just see, rather than something to infer from
// which secrets happen to be set.
console.log(JSON.stringify({ level: "info", msg: "email transport active", mode: EMAIL_MODE, environment: ENVIRONMENT || "(unset)" }));

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  tags,
  headers,
}: EmailParams): Promise<{ error: string | null }> {
  if (EMAIL_MODE === "mailtrap") {
    return sendViaMailtrap({ to, subject, html, text, replyTo });
  }

  // ── Resend ────────────────────────────────────────────────────────────
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return { error: "Email service not configured" };
  }

  const payload: Record<string, unknown> = {
    from: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    reply_to: replyTo ?? REPLY_TO_EMAIL,
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": crypto.randomUUID(),
      "List-Unsubscribe": `<mailto:${REPLY_TO_EMAIL}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      ...headers,
    },
  };

  if (tags?.length) payload.tags = tags;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return { error: err };
    }
    return { error: null };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Mailtrap REST API helper ─────────────────────────────────────────────────
// Docs: https://api-docs.mailtrap.io/docs/mailtrap-api-docs/bcf61cdc1547e-send-email-sandbox
async function sendViaMailtrap(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ error: string | null }> {
  try {
    const body = {
      from:    { email: FROM_EMAIL || "onboarding@resend.dev", name: PLATFORM_NAME },
      to:      [{ email: params.to }],
      reply_to: { email: params.replyTo ?? REPLY_TO_EMAIL },
      subject: params.subject,
      html:    params.html,
      text:    params.text,
    };

    const res = await fetch(
      `https://sandbox.api.mailtrap.io/api/send/${MAILTRAP_INBOX_ID}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MAILTRAP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Mailtrap error:", err);
      return { error: err };
    }
    return { error: null };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
