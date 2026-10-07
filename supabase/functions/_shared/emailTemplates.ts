import { escapeHtml } from "./html.ts";
import { renderEmail, btnStyle, HR, alertBanner, row, detailsTable } from "./emailBase.ts";
import { PLATFORM_NAME, SITE_URL } from "./branding.ts";

// SITE_URL/PLATFORM_NAME (target §34/§35: "centralize brand name, domain,
// support email...") now come from ./branding.ts — the old booking-
// confirmation/cancellation/payout templates that hardcoded the old
// domain directly were removed along with the old payment model, not
// migrated to this constant; new booking/payment emails, when that
// model exists, should use it from the start.

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
  const subject = `Welcome to ${PLATFORM_NAME}, ${name}!`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Welcome aboard, ${name}! &#127968;</h1>
    <p style="margin:0 0 20px;color:#374151;">Your email has been confirmed and your ${PLATFORM_NAME} account is ready. Here's what you can do next:</p>

    ${alertBanner("Your account is verified and active.", "success")}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      ${_featureRow("&#128269;", "Explore Activities", "Browse trekking, tours, and adventures across Nepal.")}
      ${_featureRow("&#128722;", "Book Instantly", "Secure your spot with real-time availability.")}
      ${_featureRow("&#11088;", "Leave Reviews", "Help other travellers with honest feedback after your trip.")}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/explore" style="${btnStyle()}">Explore Activities</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reply to this email or visit our <a href="${SITE_URL}/contact" style="color:#16a34a;">help centre</a>. We reply within one business day.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Safe travels,<br><strong style="color:#111827;">The ${PLATFORM_NAME} Team</strong></p>
  `);

  const text = `Welcome to ${PLATFORM_NAME}, ${data.name}!

Your email has been confirmed and your account is ready.

What you can do now:
- Explore Activities: Browse trekking, tours, and adventures across Nepal.
  ${SITE_URL}/explore
- Book Instantly: Secure your spot with real-time availability.
- Leave Reviews: Help other travellers after your trip.

Questions? Reply to this email or visit ${SITE_URL}/contact

Safe travels,
The ${PLATFORM_NAME} Team
${SITE_URL}`;

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

// ─────────────────────────────────────────────────────────────────────────────
// 7. Agency reinstated  (agency) — admin_reinstate_agency() has always
//    inserted an AGENCY_REINSTATED domain_event, but nothing ever consumed
//    it, so a reinstated agency never actually heard about it. Added
//    alongside the notification-dispatch worker (audit item 4).
// ─────────────────────────────────────────────────────────────────────────────

export function agencyReinstatedEmail(data: {
  agencyName: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const subject = `Your Agency Account Has Been Reinstated — Into Nepal`;

  const html = renderEmail(`
    ${alertBanner("Your agency account has been reinstated.", "success")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Welcome Back</h1>
    <p style="margin:0 0 20px;color:#374151;">Hi ${agencyName}, your agency account is active again and you can accept new bookings.</p>

    <p style="margin:0 0 20px;color:#374151;">Your listings were paused when your account was suspended and are NOT automatically republished — review each one and republish it manually before travellers can book it again.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${SITE_URL}/agency/listings" style="${btnStyle()}">Review Your Listings</a>
        </td>
      </tr>
    </table>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reply to this email.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Your Agency Account Has Been Reinstated

Hi ${data.agencyName},

Your agency account is active again and you can accept new bookings.

Your listings were paused when your account was suspended and are NOT automatically republished — review each one and republish it manually before travellers can book it again.

Review your listings: ${SITE_URL}/agency/listings

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Agency team invitation  (audit M1) — sent when an owner invites a
//    manager/staff member to join their agency.
// ─────────────────────────────────────────────────────────────────────────────

export function agencyTeamInvitationEmail(data: {
  agencyName: string;
  role: string;
  inviteUrl: string;
}): EmailTemplate {
  const agencyName = escapeHtml(data.agencyName);
  const role = escapeHtml(data.role);
  const subject = `You've been invited to join ${data.agencyName} on Into Nepal`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You're Invited</h1>
    <p style="margin:0 0 20px;color:#374151;"><strong>${agencyName}</strong> has invited you to join their team on Into Nepal as a <strong>${role}</strong>.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td>
          <a href="${data.inviteUrl}" style="${btnStyle()}">Accept Invitation</a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">This invitation expires in 7 days. If you don't recognize ${agencyName} or weren't expecting this, you can safely ignore this email.</p>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reply to this email.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `You're Invited

${data.agencyName} has invited you to join their team on Into Nepal as a ${data.role}.

Accept your invitation: ${data.inviteUrl}

This invitation expires in 7 days. If you don't recognize ${data.agencyName} or weren't expecting this, you can safely ignore this email.

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Ops daily health alert  (internal — OPS_ALERT_EMAIL, not a
//    traveler/agency-facing template) — sent by check_ops_daily_health()'s
//    OPS_DAILY_HEALTH domain_event, and only when something is actually
//    wrong (see that function's own comment for why a clean day sends
//    nothing at all).
// ─────────────────────────────────────────────────────────────────────────────

export function opsDailyHealthEmail(data: {
  failedJobIds: number[];
  permanentlyFailedNotifications: number;
  checkedAt: string;
}): EmailTemplate {
  const subject = `[Into Nepal] Daily health check found issues — ${data.checkedAt.slice(0, 10)}`;

  const jobsLine = data.failedJobIds.length > 0
    ? `${data.failedJobIds.length} cron job run(s) failed in the last 24h (job ids: ${data.failedJobIds.join(", ")}).`
    : null;
  const notificationsLine = data.permanentlyFailedNotifications > 0
    ? `${data.permanentlyFailedNotifications} notification(s) permanently failed (exhausted all retries).`
    : null;

  const html = renderEmail(`
    ${alertBanner("Daily platform health check found one or more issues.", "warning")}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Ops Daily Health Alert</h1>
    <ul style="margin:0 0 20px;padding-left:20px;color:#374151;">
      ${jobsLine ? `<li style="margin-bottom:8px;">${escapeHtml(jobsLine)}</li>` : ""}
      ${notificationsLine ? `<li>${escapeHtml(notificationsLine)}</li>` : ""}
    </ul>
    <p style="margin:0;font-size:13px;color:#6b7280;">Check cron.job_run_details and the notifications table directly for full details — this email is a summary, not a substitute for the admin dashboard's cron-health card.</p>
  `);

  const text = `Ops Daily Health Alert — ${data.checkedAt}

${jobsLine ?? ""}
${notificationsLine ?? ""}

Check cron.job_run_details and the notifications table directly for full details.`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Post-payment flow (Phase 21) — agency confirmation request/reminder,
//     booking confirmed, declined/timed-out.
// ─────────────────────────────────────────────────────────────────────────────

export function agencyBookingAwaitingConfirmationEmail(data: {
  activityTitle: string;
  departureDateNpt: string;
  participantCount: number;
  travelerFirstName: string;
  deadlineNpt: string;
  actionUrl: string;
  reminder?: boolean;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const travelerFirstName = escapeHtml(data.travelerFirstName);
  const subject = data.reminder
    ? `12 hours left to confirm: ${data.activityTitle}`
    : `New booking needs your confirmation: ${data.activityTitle}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">${data.reminder ? "12 Hours Left to Respond" : "A Traveler Is Waiting On You"}</h1>
    <p style="margin:0 0 20px;color:#374151;">${travelerFirstName} has paid the reservation fee for <strong>${activityTitle}</strong> and is waiting for your confirmation.</p>

    ${detailsTable(
      row("Activity", activityTitle) +
      row("Date", escapeHtml(data.departureDateNpt) + " (Nepal time)") +
      row("Group size", String(data.participantCount)) +
      row("Respond by", escapeHtml(data.deadlineNpt) + " (Nepal time)")
    )}

    ${data.reminder ? alertBanner("If you don't respond in time, this booking is automatically cancelled and counts as a missed response.", "warning") : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.actionUrl}" style="${btnStyle()}">Review &amp; Respond</a></td></tr>
    </table>

    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">This link lets you accept or decline directly — no login needed. You can also respond from your Into Nepal dashboard.</p>

    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `${data.reminder ? "12 Hours Left to Respond" : "A Traveler Is Waiting On You"}

${data.travelerFirstName} has paid the reservation fee for ${data.activityTitle} and is waiting for your confirmation.

Activity: ${data.activityTitle}
Date: ${data.departureDateNpt} (Nepal time)
Group size: ${data.participantCount}
Respond by: ${data.deadlineNpt} (Nepal time)

${data.reminder ? "If you don't respond in time, this booking is automatically cancelled and counts as a missed response.\n\n" : ""}Review & respond: ${data.actionUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

export function agencyBookingReminderEmail(data: {
  activityTitle: string;
  departureDateNpt: string;
  participantCount: number;
  travelerFirstName: string;
  deadlineNpt: string;
  actionUrl: string;
}): EmailTemplate {
  return agencyBookingAwaitingConfirmationEmail({ ...data, reminder: true });
}

export function bookingConfirmedTravelerEmail(data: {
  activityTitle: string;
  departureDateNpt: string;
  bookingRef: string;
  myBookingsUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Confirmed: ${data.activityTitle}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Your Booking Is Confirmed! &#127881;</h1>
    ${alertBanner(`${data.activityTitle} is booked for ${data.departureDateNpt} (Nepal time).`, "success")}
    ${detailsTable(row("Booking reference", escapeHtml(data.bookingRef)) + row("Date", escapeHtml(data.departureDateNpt) + " (Nepal time)"))}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.myBookingsUrl}" style="${btnStyle()}">View My Bookings</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Safe travels,<br><strong style="color:#111827;">The Into Nepal Team</strong></p>
  `);

  const text = `Your Booking Is Confirmed!

${data.activityTitle} is booked for ${data.departureDateNpt} (Nepal time).
Booking reference: ${data.bookingRef}

View it: ${data.myBookingsUrl}

Safe travels,
The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingConfirmedAgencyEmail(data: {
  activityTitle: string;
  departureDateNpt: string;
  travelerFirstName: string;
  bookingRef: string;
  dashboardUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const travelerFirstName = escapeHtml(data.travelerFirstName);
  const subject = `Booking confirmed: ${data.activityTitle}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Confirmed Booking</h1>
    <p style="margin:0 0 20px;color:#374151;">${travelerFirstName}'s booking for <strong>${activityTitle}</strong> is confirmed.</p>
    ${detailsTable(row("Booking reference", escapeHtml(data.bookingRef)) + row("Date", escapeHtml(data.departureDateNpt) + " (Nepal time)"))}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.dashboardUrl}" style="${btnStyle()}">View Booking</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `New Confirmed Booking

${data.travelerFirstName}'s booking for ${data.activityTitle} is confirmed.
Booking reference: ${data.bookingRef}
Date: ${data.departureDateNpt} (Nepal time)

View it: ${data.dashboardUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingDeclinedOrTimeoutTravelerEmail(data: {
  activityTitle: string;
  reason?: string;
  timedOut: boolean;
  alternativesUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Update on your booking: ${data.activityTitle}`;
  const reasonLine = data.timedOut
    ? "The agency didn't respond in time, so we've cancelled this reservation."
    : `The agency wasn't able to confirm this booking${data.reason ? `: "${escapeHtml(data.reason)}"` : "."}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">We Couldn't Confirm This Booking</h1>
    <p style="margin:0 0 16px;color:#374151;">${reasonLine}</p>
    ${alertBanner(`Your reservation fee for ${data.activityTitle} is being refunded in full.`, "warning")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.alternativesUrl}" style="${btnStyle()}">See Similar Activities</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">Sorry for the inconvenience — we're here to help you find another great trip.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `We Couldn't Confirm This Booking

${reasonLine}

Your reservation fee for ${data.activityTitle} is being refunded in full.

See similar activities: ${data.alternativesUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 22: cancellation / no-show / dispute lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function bookingCancelledTravelerEmail(data: {
  activityTitle: string;
  cancelledBy: "traveler" | "agency" | "admin" | "system";
  feeRefundAmount: number;
  balanceRefundAmount: number;
  currency: string;
  myBookingsUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Cancelled: ${data.activityTitle}`;
  const byLine = data.cancelledBy === "traveler" ? "You cancelled this booking." : "This booking has been cancelled.";
  const totalRefund = data.feeRefundAmount + data.balanceRefundAmount;

  const refundLine = totalRefund > 0
    ? `${data.currency} ${totalRefund.toFixed(2)} is being refunded.`
    : "No refund applies to this cancellation.";

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Booking Cancelled</h1>
    <p style="margin:0 0 16px;color:#374151;">${byLine}</p>
    ${alertBanner(`${activityTitle}: ${refundLine}`, totalRefund > 0 ? "warning" : "danger")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.myBookingsUrl}" style="${btnStyle()}">View My Bookings</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Booking Cancelled

${byLine}
${activityTitle}: ${refundLine}

View it: ${data.myBookingsUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingDisruptedTravelerEmail(data: {
  activityTitle: string;
  reasonCode: string;
  note?: string;
  choiceDeadlineNpt: string;
  myBookingsUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Action needed: ${data.activityTitle}`;
  const reasonLabel = data.reasonCode === "conditions_weather" ? "weather" : data.reasonCode === "conditions_flight" ? "flight disruption" : "safety conditions";

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Your Trip Needs a New Plan</h1>
    <p style="margin:0 0 16px;color:#374151;">Your operator can't run <strong>${activityTitle}</strong> as planned due to ${reasonLabel}${data.note ? `: "${escapeHtml(data.note)}"` : "."}</p>
    ${alertBanner(`Choose a free date change or a full refund by ${data.choiceDeadlineNpt} (Nepal time).`, "warning")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.myBookingsUrl}" style="${btnStyle()}">Choose Now</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">If you don't choose by the deadline, we'll refund you in full automatically.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Your Trip Needs a New Plan

Your operator can't run ${activityTitle} as planned due to ${reasonLabel}.
Choose a free date change or a full refund by ${data.choiceDeadlineNpt} (Nepal time).

Choose now: ${data.myBookingsUrl}

If you don't choose by the deadline, we'll refund you in full automatically.
— The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingRescheduledEmail(data: {
  activityTitle: string;
  newDateNpt: string;
  recipientIsAgency: boolean;
  bookingRef: string;
  linkUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Rescheduled: ${data.activityTitle}`;
  const intro = data.recipientIsAgency
    ? "A traveler's disrupted booking has been rescheduled."
    : "Your booking has been rescheduled to a new date, at the same price.";

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Booking Rescheduled</h1>
    <p style="margin:0 0 16px;color:#374151;">${intro}</p>
    ${detailsTable(row("Booking reference", escapeHtml(data.bookingRef)) + row("New date", escapeHtml(data.newDateNpt) + " (Nepal time)"))}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.linkUrl}" style="${btnStyle()}">View Booking</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Booking Rescheduled

${intro}
Booking reference: ${data.bookingRef}
New date: ${data.newDateNpt} (Nepal time)

View it: ${data.linkUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingNoShowTravelerEmail(data: {
  activityTitle: string;
  disputeUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `Marked as no-show: ${data.activityTitle}`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You Were Marked as a No-Show</h1>
    <p style="margin:0 0 16px;color:#374151;">The agency reported that you didn't show up for <strong>${activityTitle}</strong>. Your reservation fee is non-refundable for a no-show.</p>
    ${alertBanner("If this is wrong, you have 48 hours to dispute it.", "danger")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.disputeUrl}" style="${btnStyle()}">This Is Wrong — Dispute It</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `You Were Marked as a No-Show

The agency reported that you didn't show up for ${activityTitle}. Your reservation fee is non-refundable for a no-show.
If this is wrong, you have 48 hours to dispute it.

Dispute it: ${data.disputeUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}

export function bookingDisputeOpenedAdminEmail(data: {
  activityTitle: string;
  kind: "no_show" | "agency_no_show";
  bookingRef: string;
  disputesUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `New dispute: ${data.activityTitle}`;
  const kindLabel = data.kind === "no_show" ? "traveler disputing a no-show" : "traveler reporting the agency never showed up";

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Dispute Opened</h1>
    <p style="margin:0 0 16px;color:#374151;">${kindLabel} for <strong>${activityTitle}</strong> (${escapeHtml(data.bookingRef)}).</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.disputesUrl}" style="${btnStyle()}">Review Dispute</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— Into Nepal Ops</p>
  `);

  const text = `New Dispute Opened

${kindLabel} for ${activityTitle} (${data.bookingRef}).

Review it: ${data.disputesUrl}

— Into Nepal Ops`;

  return { subject, html, text };
}

export function bookingCompletedTravelerEmail(data: {
  activityTitle: string;
  reviewUrl: string;
}): EmailTemplate {
  const activityTitle = escapeHtml(data.activityTitle);
  const subject = `How was ${data.activityTitle}?`;

  const html = renderEmail(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Trip Complete! &#127794;</h1>
    <p style="margin:0 0 20px;color:#374151;">We hope you had a great time on <strong>${activityTitle}</strong>. Got a minute to leave a review?</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
      <tr><td><a href="${data.reviewUrl}" style="${btnStyle()}">Leave a Review</a></td></tr>
    </table>
    ${HR}
    <p style="margin:0;font-size:13px;color:#6b7280;">— The Into Nepal Team</p>
  `);

  const text = `Trip Complete!

We hope you had a great time on ${activityTitle}. Got a minute to leave a review?

Leave a review: ${data.reviewUrl}

— The Into Nepal Team`;

  return { subject, html, text };
}
