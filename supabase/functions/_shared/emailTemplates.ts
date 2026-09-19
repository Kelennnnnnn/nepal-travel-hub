import { escapeHtml } from "./html.ts";
import { renderEmail, btnStyle, HR, row, detailsTable, alertBanner } from "./emailBase.ts";

// Centralized site URL (target §34/§35: "centralize brand name, domain,
// support email..."). Introduced in Phase 4 for the templates it touches
// (agency application/approval/rejection); the old booking-confirmation/
// cancellation/payout templates that also hardcoded "yatranepal.com" were
// removed along with the Stripe-based payment model, not migrated to this
// constant — new booking/payment emails, when that model exists, should
// use it from the start.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://intonepal.com";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Welcome email  (sent after email is confirmed)
// ─────────────────────────────────────────────────────────────────────────────

export function welcomeEmail(data: {
  name: string;
}): EmailTemplate {
  const name = escapeHtml(data.name);
  const subject = `Welcome to Yatra Nepal, ${name}!`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Welcome aboard, ${name}! &#127968;</h1>
    <p style="margin:0 0 20px;color:#374151;">Your email has been confirmed and your Yatra Nepal account is ready. Here's what you can do next:</p>

    ${alertBanner("Your account is verified and active.", "success")}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_featureRow("&#128269;", "Explore Activities", "Browse trekking, tours, and adventures across Nepal.")}
      ${_featureRow("&#128722;", "Book Instantly", "Secure your spot with real-time availability.")}
      ${_featureRow("&#11088;", "Leave Reviews", "Help other travellers with honest feedback after your trip.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://yatranepal.com/explore" style="${btnStyle()}">Explore Activities</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reply to this email or visit our <a href="https://yatranepal.com/contact" style="color:#16a34a;">help centre</a>. We reply within one business day.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Safe travels,<br><strong style="color:#111827;">The Yatra Nepal Team</strong></p>
  `);

  const text = `Welcome to Yatra Nepal, ${data.name}!

Your email has been confirmed and your account is ready.

What you can do now:
- Explore Activities: Browse trekking, tours, and adventures across Nepal.
  https://yatranepal.com/explore
- Book Instantly: Secure your spot with real-time availability.
- Leave Reviews: Help other travellers after your trip.

Questions? Reply to this email or visit https://yatranepal.com/contact

Safe travels,
The Yatra Nepal Team
https://yatranepal.com`;

  return { subject, html, text };
}

function _featureRow(icon: string, title: string, desc: string): string {
  return `<tr>
    <td style="padding:10px 0;vertical-align:top;width:36px;">
      <span style="font-size:20px;line-height:1;">${icon}</span>
    </td>
    <td style="padding:10px 0 10px 12px;vertical-align:top;">
      <strong style="font-size:14px;color:#111827;display:block;">${title}</strong>
      <span style="font-size:13px;color:#6b7280;">${desc}</span>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Agency application received  (sent to agency on submission)
// ─────────────────────────────────────────────────────────────────────────────

export function agencyApplicationReceivedEmail(data: {
  agencyName: string;
  ownerName: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const ownerName = escapeHtml(data.ownerName);
  const subject = `Application Received — ${agencyName}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Application Received</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${ownerName}, thank you for applying to become an Into Nepal partner agency!</p>

    ${alertBanner("We received your application and will review it within 2–3 business days.", "success")}

    <p style="margin:0 0 16px;color:#374151;">While you wait, here's what happens next:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_stepRow("1", "Document Review", "Our team checks your registration, PAN, and tourism licence.")}
      ${_stepRow("2", "Verification Call", "We may contact you for a short verification call.")}
      ${_stepRow("3", "Decision Email", "You'll get an approval or feedback email within 2–3 business days.")}
      ${_stepRow("4", "Go Live", "Once approved, set up your payout account and start listing activities.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/agency/onboarding/status" style="${btnStyle()}">Check Application Status</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you have questions, reply to this email. We're here to help.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Partner Team</p>
  `);

  const text = `Application Received — ${data.agencyName}

Hi ${data.ownerName},

Thank you for applying to become an Into Nepal partner agency! We'll review your application within 2–3 business days.

What happens next:
1. Document Review — Our team checks your registration, PAN, and tourism licence.
2. Verification Call — We may contact you for a short verification call.
3. Decision Email — You'll get an approval or feedback email within 2–3 business days.
4. Go Live — Once approved, set up your payout account and start listing activities.

Check your status: ${SITE_URL}/agency/onboarding/status

Questions? Reply to this email.

— The Into Nepal Partner Team`;

  return { subject, html, text };
}

function _stepRow(num: string, title: string, desc: string): string {
  return `<tr>
    <td style="padding:8px 0;vertical-align:top;width:32px;">
      <div style="width:28px;height:28px;border-radius:50%;background-color:#dcfce7;display:inline-flex;align-items:center;justify-content:center;text-align:center;line-height:28px;">
        <span style="font-size:12px;font-weight:700;color:#16a34a;">${num}</span>
      </div>
    </td>
    <td style="padding:8px 0 8px 12px;vertical-align:top;">
      <strong style="font-size:14px;color:#111827;display:block;">${title}</strong>
      <span style="font-size:13px;color:#6b7280;">${desc}</span>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Agency approved  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function agencyApprovedEmail(data: {
  agencyName: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const subject = `Your Agency is Verified! Welcome to Into Nepal Partners`;

  const html = renderEmail(`
    ${alertBanner("Congratulations — your agency has been approved!", "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're a Verified Partner</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, welcome to the Into Nepal partner network! You can now create listings and start receiving bookings.</p>

    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;">Get started in 3 steps:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_stepRow("1", "Set Up Payouts", "Add your payout account details so you can receive payments.")}
      ${_stepRow("2", "Create a Listing", "Add your first activity with photos, pricing, and availability.")}
      ${_stepRow("3", "Go Live", "Your listing will appear on Into Nepal for travellers to discover.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/agency/dashboard" style="${btnStyle()}">Go to Partner Dashboard</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Need help getting started? Reply to this email — our partner success team is happy to assist.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Your Agency is Verified — Welcome to Into Nepal Partners

Hi ${data.agencyName},

Congratulations! Your agency has been approved and you can now create listings and receive bookings.

Get started:
1. Set Up Payouts — Add your payout account details.
   ${SITE_URL}/agency/settings
2. Create a Listing — Add your first activity.
   ${SITE_URL}/agency/listings/new
3. Go Live — Appear in search results for travellers.

Go to Partner Dashboard: ${SITE_URL}/agency/dashboard

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Agency rejected  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function agencyRejectedEmail(data: {
  agencyName: string;
  reason: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const reason = escapeHtml(data.reason);
  const subject = `Update on Your Agency Application — Into Nepal`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Application Not Approved</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, thank you for applying to become an Into Nepal partner. After reviewing your application, we're unable to approve it at this time.</p>

    <div style="background-color:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
      <p style="margin:0;font-size:14px;color:#7f1d1d;">${reason}</p>
    </div>

    <p style="margin:0 0 20px;color:#374151;">You can update your application and resubmit for review. Common reasons for rejection and how to address them:</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_featureRow("&#128196;", "Documents", "Ensure your Tourism Licence, PAN, and registration are current and clearly legible.")}
      ${_featureRow("&#128247;", "Business Details", "Verify your company name and registration number match official records.")}
      ${_featureRow("&#128222;", "Contact Info", "Make sure your phone and email are correct and reachable.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/agency/onboarding" style="${btnStyle()}">Update & Resubmit Application</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you believe this decision was made in error, reply to this email and our team will review your case.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Update on Your Agency Application

Hi ${data.agencyName},

After reviewing your application, we're unable to approve it at this time.

Reason:
${data.reason}

You can update and resubmit your application:
${SITE_URL}/agency/onboarding

If you believe this was an error, reply to this email.

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Agency more info requested  (agency) — target §22 MORE_INFO_REQUIRED status
// ─────────────────────────────────────────────────────────────────────────────

export function agencyMoreInfoRequiredEmail(data: {
  agencyName: string;
  note: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const note = escapeHtml(data.note);
  const subject = `Action Needed on Your Agency Application — Into Nepal`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">We Need a Bit More Information</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, we're reviewing your application and need some additional information before we can make a decision.</p>

    <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">What we need</p>
      <p style="margin:0;font-size:14px;color:#78350f;">${note}</p>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/agency/onboarding" style="${btnStyle()}">Update Application</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions about what's needed? Reply to this email.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Action Needed on Your Agency Application

Hi ${data.agencyName},

We're reviewing your application and need some additional information before we can make a decision.

What we need:
${data.note}

Update your application: ${SITE_URL}/agency/onboarding

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Agency suspended  (agency) — target §26 AGENCY_SUSPENDED
// ─────────────────────────────────────────────────────────────────────────────

export function agencySuspendedEmail(data: {
  agencyName: string;
  reason: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const reason = escapeHtml(data.reason);
  const subject = `Your Agency Account Has Been Suspended — Into Nepal`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Account Suspended</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, your agency account has been suspended. Your listings are no longer visible to travellers and you cannot accept new bookings until this is resolved.</p>

    <div style="background-color:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
      <p style="margin:0;font-size:14px;color:#7f1d1d;">${reason}</p>
    </div>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you believe this is a mistake, reply to this email and our team will review your case.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Your Agency Account Has Been Suspended

Hi ${data.agencyName},

Your agency account has been suspended. Your listings are no longer visible to travellers and you cannot accept new bookings until this is resolved.

Reason:
${data.reason}

If you believe this is a mistake, reply to this email.

— The Into Nepal Team`;

  return { subject, html, text };
}
