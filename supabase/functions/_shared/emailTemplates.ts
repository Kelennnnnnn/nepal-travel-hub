import { escapeHtml } from "./html.ts";
import { renderEmail, btnStyle, HR, row, detailsTable, alertBanner } from "./emailBase.ts";

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
    <p style="margin:0 0 20px;color:#374151;">Hi ${ownerName}, thank you for applying to become a Yatra Nepal partner agency!</p>

    ${alertBanner("We received your application and will review it within 2–3 business days.", "success")}

    <p style="margin:0 0 16px;color:#374151;">While you wait, here's what happens next:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_stepRow("1", "Document Review", "Our team checks your registration, PAN, and tourism licence.")}
      ${_stepRow("2", "Verification Call", "We may contact you for a short verification call.")}
      ${_stepRow("3", "Decision Email", "You'll get an approval or feedback email within 2–3 business days.")}
      ${_stepRow("4", "Go Live", "Once approved, set up your Stripe account and start listing activities.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://partner.yatranepal.com/agency/status" style="${btnStyle()}">Check Application Status</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you have questions, reply to this email. We're here to help.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Partner Team</p>
  `);

  const text = `Application Received — ${data.agencyName}

Hi ${data.ownerName},

Thank you for applying to become a Yatra Nepal partner agency! We'll review your application within 2–3 business days.

What happens next:
1. Document Review — Our team checks your registration, PAN, and tourism licence.
2. Verification Call — We may contact you for a short verification call.
3. Decision Email — You'll get an approval or feedback email within 2–3 business days.
4. Go Live — Once approved, set up Stripe and start listing activities.

Check your status: https://partner.yatranepal.com/agency/status

Questions? Reply to this email.

— The Yatra Nepal Partner Team`;

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
// 3. Booking confirmation  (traveller)
// ─────────────────────────────────────────────────────────────────────────────

export function bookingConfirmationEmail(data: {
  travelerName: string;
  bookingRef: string;
  activityTitle: string;
  tripDate: string;
  guests: number;
  totalAmount: number;
  agencyName: string;
}): EmailTemplate {
  const travelerName = escapeHtml(data.travelerName);
  const activityTitle = escapeHtml(data.activityTitle);
  const agencyName = escapeHtml(data.agencyName);
  const subject = `Booking Confirmed — ${data.bookingRef}`;

  const html = renderEmail(`
    ${alertBanner("Your booking is confirmed!", "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're all set, ${travelerName}!</h1>
    <p style="margin:0 0 24px;color:#374151;">Your adventure with <strong>${agencyName}</strong> is booked. Keep this email for your records.</p>

    ${detailsTable(
      row("Booking Ref", `<span style="font-family:monospace;font-size:13px;font-weight:600;">${escapeHtml(data.bookingRef)}</span>`) +
      row("Activity", activityTitle) +
      row("Date", escapeHtml(data.tripDate)) +
      row("Guests", String(data.guests)) +
      row("Total Paid", `<strong>$${data.totalAmount.toFixed(2)}</strong>`) +
      row("Operated by", agencyName)
    )}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://yatranepal.com/bookings" style="${btnStyle()}">View My Bookings</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions about your trip? Reply to this email or contact ${agencyName} directly through your booking page.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Booking Confirmed — ${data.bookingRef}

Hi ${data.travelerName}, you're all set!

Your adventure with ${data.agencyName} is confirmed.

Booking details:
  Booking Ref : ${data.bookingRef}
  Activity    : ${data.activityTitle}
  Date        : ${data.tripDate}
  Guests      : ${data.guests}
  Total Paid  : $${data.totalAmount.toFixed(2)}
  Operated by : ${data.agencyName}

View your bookings: https://yatranepal.com/bookings

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Booking cancellation  (traveller)
// ─────────────────────────────────────────────────────────────────────────────

export function bookingCancellationEmail(data: {
  travelerName: string;
  bookingRef: string;
  activityTitle: string;
  reason: string;
}): EmailTemplate {
  const travelerName = escapeHtml(data.travelerName);
  const activityTitle = escapeHtml(data.activityTitle);
  const reason = data.reason ? escapeHtml(data.reason) : "";
  const subject = `Booking Cancelled — ${data.bookingRef}`;

  const html = renderEmail(`
    ${alertBanner("Your booking has been cancelled.", "danger")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;color:#374151;">Hi ${travelerName}, your booking for <strong>${activityTitle}</strong> (ref: <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">${escapeHtml(data.bookingRef)}</code>) has been cancelled.</p>

    ${reason ? `<div style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin-bottom:20px;"><p style="margin:0;font-size:14px;color:#c2410c;"><strong>Reason:</strong> ${reason}</p></div>` : ""}

    <p style="margin:0 0 20px;color:#374151;">If a refund is applicable, it will be processed to your original payment method within <strong>5–10 business days</strong>.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://yatranepal.com/explore" style="${btnStyle()}">Find Another Activity</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you have questions about your refund, reply to this email and we'll help.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Booking Cancelled — ${data.bookingRef}

Hi ${data.travelerName},

Your booking for "${data.activityTitle}" (ref: ${data.bookingRef}) has been cancelled.
${reason ? `\nReason: ${data.reason}\n` : ""}
If a refund is applicable, it will be processed within 5–10 business days.

Browse other activities: https://yatranepal.com/explore

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. New booking notification  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function newBookingAgencyEmail(data: {
  agencyName: string;
  bookingRef: string;
  activityTitle: string;
  travelerName: string;
  tripDate: string;
  guests: number;
  totalAmount: number;
  netPayout: number;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const activityTitle = escapeHtml(data.activityTitle);
  const travelerName = escapeHtml(data.travelerName);
  const subject = `New Booking — ${data.bookingRef}`;

  const html = renderEmail(`
    ${alertBanner("You have a new booking!", "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Booking Received</h1>
    <p style="margin:0 0 24px;color:#374151;">Hi ${agencyName}, a traveller just booked <strong>${activityTitle}</strong>.</p>

    ${detailsTable(
      row("Booking Ref", `<span style="font-family:monospace;font-size:13px;font-weight:600;">${escapeHtml(data.bookingRef)}</span>`) +
      row("Traveller", travelerName) +
      row("Activity", activityTitle) +
      row("Trip Date", escapeHtml(data.tripDate)) +
      row("Guests", String(data.guests)) +
      row("Total Charged", `$${data.totalAmount.toFixed(2)}`) +
      row("Your Net Payout", `<strong style="color:#16a34a;">$${data.netPayout.toFixed(2)}</strong>`)
    )}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://partner.yatranepal.com/agency/bookings" style="${btnStyle()}">Manage Bookings</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Respond promptly to keep your response rate high and maintain your partner status.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `New Booking — ${data.bookingRef}

Hi ${data.agencyName},

You have a new booking for "${data.activityTitle}".

Booking details:
  Booking Ref  : ${data.bookingRef}
  Traveller    : ${data.travelerName}
  Activity     : ${data.activityTitle}
  Trip Date    : ${data.tripDate}
  Guests       : ${data.guests}
  Total Charged: $${data.totalAmount.toFixed(2)}
  Your Payout  : $${data.netPayout.toFixed(2)}

Manage bookings: https://partner.yatranepal.com/agency/bookings

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Booking cancelled notification  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function bookingCancelledAgencyEmail(data: {
  agencyName: string;
  bookingRef: string;
  activityTitle: string;
  travelerName: string;
  refundAmount: number;
  refundPercentage: number;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const activityTitle = escapeHtml(data.activityTitle);
  const travelerName = escapeHtml(data.travelerName);
  const subject = `Booking Cancelled — ${data.bookingRef}`;

  const html = renderEmail(`
    ${alertBanner("A booking has been cancelled by the traveller.", "warning")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;color:#374151;">Hi ${agencyName}, <strong>${travelerName}</strong> cancelled their booking for <strong>${activityTitle}</strong>.</p>

    ${detailsTable(
      row("Booking Ref", `<span style="font-family:monospace;font-size:13px;font-weight:600;">${escapeHtml(data.bookingRef)}</span>`) +
      row("Traveller", travelerName) +
      row("Activity", activityTitle) +
      row("Refund Issued", `${data.refundPercentage}% ($${data.refundAmount.toFixed(2)})`)
    )}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://partner.yatranepal.com/agency/bookings" style="${btnStyle("#2563eb")}">View Dashboard</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Your payout will be adjusted to reflect the cancellation policy. Log in for full details.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Booking Cancelled — ${data.bookingRef}

Hi ${data.agencyName},

${data.travelerName} cancelled their booking for "${data.activityTitle}".

  Booking Ref   : ${data.bookingRef}
  Traveller     : ${data.travelerName}
  Refund Issued : ${data.refundPercentage}% ($${data.refundAmount.toFixed(2)})

View dashboard: https://partner.yatranepal.com/agency/bookings

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Payout processed  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function payoutProcessedAgencyEmail(data: {
  agencyName: string;
  amount: number;
  bookingCount: number;
  transferId: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const subject = `Payout of $${data.amount.toFixed(2)} Processed`;

  const html = renderEmail(`
    ${alertBanner(`$${data.amount.toFixed(2)} has been transferred to your bank account.`, "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Payout Processed</h1>
    <p style="margin:0 0 24px;color:#374151;">Hi ${agencyName}, your payout has been sent to your connected Stripe account.</p>

    ${detailsTable(
      row("Amount", `<strong style="color:#16a34a;font-size:16px;">$${data.amount.toFixed(2)}</strong>`) +
      row("Bookings Covered", String(data.bookingCount)) +
      row("Transfer ID", `<span style="font-family:monospace;font-size:12px;">${escapeHtml(data.transferId)}</span>`)
    )}

    <p style="margin:0 0 24px;color:#374151;font-size:14px;">Funds typically arrive within <strong>2–3 business days</strong> depending on your bank.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://partner.yatranepal.com/agency/payouts" style="${btnStyle()}">View Payout History</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions about your payout? Reply to this email.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Payout of $${data.amount.toFixed(2)} Processed

Hi ${data.agencyName},

Your payout has been transferred to your connected Stripe account.

  Amount           : $${data.amount.toFixed(2)}
  Bookings Covered : ${data.bookingCount}
  Transfer ID      : ${data.transferId}

Funds arrive within 2–3 business days.

View payout history: https://partner.yatranepal.com/agency/payouts

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Agency approved  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function agencyApprovedEmail(data: {
  agencyName: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const subject = `Your Agency is Verified! Welcome to Yatra Nepal Partners`;

  const html = renderEmail(`
    ${alertBanner("Congratulations — your agency has been approved!", "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're a Verified Partner</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, welcome to the Yatra Nepal partner network! You can now create listings and start receiving bookings.</p>

    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;">Get started in 3 steps:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_stepRow("1", "Connect Stripe", "Set up your payout account to receive payments.")}
      ${_stepRow("2", "Create a Listing", "Add your first activity with photos, pricing, and availability.")}
      ${_stepRow("3", "Go Live", "Your listing will appear on Yatra Nepal for travellers to discover.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="https://partner.yatranepal.com/agency/dashboard" style="${btnStyle()}">Go to Partner Dashboard</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Need help getting started? Reply to this email — our partner success team is happy to assist.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Your Agency is Verified — Welcome to Yatra Nepal Partners

Hi ${data.agencyName},

Congratulations! Your agency has been approved and you can now create listings and receive bookings.

Get started:
1. Connect Stripe — Set up your payout account.
   https://partner.yatranepal.com/agency/settings
2. Create a Listing — Add your first activity.
   https://partner.yatranepal.com/agency/listings/new
3. Go Live — Appear in search results for travellers.

Go to Partner Dashboard: https://partner.yatranepal.com/agency/dashboard

— The Yatra Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Agency rejected  (agency)
// ─────────────────────────────────────────────────────────────────────────────

export function agencyRejectedEmail(data: {
  agencyName: string;
  reason: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const reason = escapeHtml(data.reason);
  const subject = `Update on Your Agency Application — Yatra Nepal`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Application Not Approved</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, thank you for applying to become a Yatra Nepal partner. After reviewing your application, we're unable to approve it at this time.</p>

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
          <a href="https://partner.yatranepal.com/agency/onboarding" style="${btnStyle()}">Update & Resubmit Application</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you believe this decision was made in error, reply to this email and our team will review your case.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Yatra Nepal Team</p>
  `);

  const text = `Update on Your Agency Application

Hi ${data.agencyName},

After reviewing your application, we're unable to approve it at this time.

Reason:
${data.reason}

You can update and resubmit your application:
https://partner.yatranepal.com/agency/onboarding

If you believe this was an error, reply to this email.

— The Yatra Nepal Team`;

  return { subject, html, text };
}
