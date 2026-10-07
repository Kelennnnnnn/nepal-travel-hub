// SMS/WhatsApp transport for the Phase 21 post-payment notification flow
// (BOOKING_AWAITING_AGENCY/BOOKING_AGENCY_REMINDER). Same "explicit choice,
// never a silent downgrade" discipline as email.ts: a provider with no
// credentials in this environment reports "not_configured" — dispatch-
// notifications marks the notification row accordingly and never claims a
// channel was sent when it wasn't. Nothing here is required for email to
// work; email always sends regardless of SMS/WhatsApp configuration.

export type MessagingResult =
  | { status: "sent" }
  | { status: "failed"; error: string }
  | { status: "not_configured" };

export interface MessagingProvider {
  sendSms(toE164: string, text: string): Promise<MessagingResult>;
  sendWhatsAppTemplate(
    toE164: string,
    templateName: string,
    params: string[],
  ): Promise<MessagingResult>;
}

const TIMEOUT_MS = 8000;

// Logged once per provider per cold start, not per call — same reasoning
// as email.ts's own one-line startup log.
let loggedSmsNotConfigured = false;
let loggedWhatsAppNotConfigured = false;

// ── Sparrow SMS (Nepal) ──────────────────────────────────────────────────
// https://sparrowsms.com/ — simple HTTP GET/POST API, token + sender id.

const SPARROW_SMS_TOKEN = Deno.env.get("SPARROW_SMS_TOKEN") ?? "";
const SPARROW_SMS_FROM = Deno.env.get("SPARROW_SMS_FROM") ?? "";

async function sendSmsViaSparrow(toE164: string, text: string): Promise<MessagingResult> {
  if (!SPARROW_SMS_TOKEN || !SPARROW_SMS_FROM) {
    if (!loggedSmsNotConfigured) {
      console.log(JSON.stringify({ level: "info", msg: "SMS provider not configured (SPARROW_SMS_TOKEN/SPARROW_SMS_FROM missing) — SMS channel will report not_configured" }));
      loggedSmsNotConfigured = true;
    }
    return { status: "not_configured" };
  }

  // Sparrow expects a local Nepali number (97XXXXXXXX / 98XXXXXXXX), not
  // the full E.164 form — strip a leading +977 if present.
  const to = toE164.replace(/^\+?977/, "");

  try {
    const res = await fetch("https://api.sparrowsms.com/v2/sms/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: SPARROW_SMS_TOKEN, from: SPARROW_SMS_FROM, to, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { status: "failed", error: `Sparrow SMS HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => null) as { response_code?: number } | null;
    // Sparrow's own success code is 200 inside the JSON body, not just the HTTP status.
    if (body?.response_code !== 200) {
      return { status: "failed", error: `Sparrow SMS response_code ${body?.response_code ?? "unknown"}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: (err as Error).message };
  }
}

// ── Meta WhatsApp Cloud API ──────────────────────────────────────────────
// https://developers.facebook.com/docs/whatsapp/cloud-api/
//
// Template messages only — WhatsApp requires any business-initiated
// message to use a pre-approved template. The two templates this flow
// needs (booking_confirm_request, booking_confirm_reminder) must be
// created and approved in Meta Business Manager BEFORE this code can
// actually deliver anything; until then, every call here will fail with a
// real error from Meta's API (not silently), which is the correct
// behavior — this is infrastructure Meta approval cannot be skipped by code.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

async function sendWhatsAppViaMeta(
  toE164: string,
  templateName: string,
  params: string[],
): Promise<MessagingResult> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    if (!loggedWhatsAppNotConfigured) {
      console.log(JSON.stringify({ level: "info", msg: "WhatsApp provider not configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID missing) — WhatsApp channel will report not_configured" }));
      loggedWhatsAppNotConfigured = true;
    }
    return { status: "not_configured" };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164.replace(/^\+/, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: params.map((p) => ({ type: "text", text: p })),
          }],
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text();
      // Meta error bodies can echo back request fields — never log the
      // raw body (could include the phone number/token context) beyond a
      // bounded, generic slice.
      return { status: "failed", error: `WhatsApp Cloud API HTTP ${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: (err as Error).message };
  }
}

export const messagingProvider: MessagingProvider = {
  sendSms: sendSmsViaSparrow,
  sendWhatsAppTemplate: sendWhatsAppViaMeta,
};

// Template names dispatch-notifications sends by. Must already exist,
// approved, in Meta Business Manager — this code cannot create them.
export const WHATSAPP_TEMPLATES = {
  bookingConfirmRequest: "booking_confirm_request",
  bookingConfirmReminder: "booking_confirm_reminder",
} as const;
