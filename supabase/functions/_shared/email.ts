const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")  ?? "";
const FROM_EMAIL      = Deno.env.get("FROM_EMAIL")      ?? "onboarding@resend.dev";
const REPLY_TO_EMAIL  = Deno.env.get("REPLY_TO_EMAIL")  ?? "hello@yatranepal.com";
const PLATFORM_NAME   = "Yatra Nepal";

// Mailtrap Email Testing — set MAILTRAP_USER + MAILTRAP_PASS (the SMTP credentials
// shown in mailtrap.io → Email Testing → Inboxes → Show Credentials).
// The SMTP password doubles as the Bearer token for Mailtrap's HTTP API.
// Also set MAILTRAP_INBOX_ID to the number in the inbox URL.
const MAILTRAP_USER      = Deno.env.get("MAILTRAP_USER")      ?? "";
const MAILTRAP_API_TOKEN = Deno.env.get("MAILTRAP_API_TOKEN") ?? Deno.env.get("MAILTRAP_PASS") ?? "";
const MAILTRAP_INBOX_ID  = Deno.env.get("MAILTRAP_INBOX_ID")  ?? "";

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

  // ── Mailtrap sandbox (dev / staging) ────────────────────────────────────
  if ((MAILTRAP_USER || MAILTRAP_API_TOKEN) && MAILTRAP_INBOX_ID) {
    return sendViaMailtrap({ to, subject, html, text, replyTo });
  }

  // ── Resend (production) ──────────────────────────────────────────────────
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
      from:    { email: FROM_EMAIL, name: PLATFORM_NAME },
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
