// ── Traveler: booking confirmed ─────────────────────────────
export function bookingConfirmationEmail({
  travelerName,
  activityTitle,
  bookingDate,
  participants,
  totalAmount,
  bookingId,
}: {
  travelerName: string;
  activityTitle: string;
  bookingDate: string;
  participants: number;
  totalAmount: number;
  bookingId: string;
}) {
  return {
    subject: `Booking Confirmed – ${activityTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">Booking Confirmed!</h2>
        <p>Hi ${travelerName},</p>
        <p>Your booking has been confirmed. Here are your details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Activity</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${activityTitle}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Date</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${bookingDate}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Participants</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${participants}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Total Paid</strong></td><td style="padding:8px;border:1px solid #e5e7eb">$${totalAmount.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${bookingId}</td></tr>
        </table>
        <p>We look forward to seeing you on your adventure!</p>
        <p style="color:#6b7280;font-size:12px">NepalTrails · Yatra Nepal Pvt. Ltd.</p>
      </div>
    `,
  };
}

// ── Traveler: booking cancelled ──────────────────────────────
export function bookingCancellationEmail({
  travelerName,
  activityTitle,
  bookingDate,
  reason,
}: {
  travelerName: string;
  activityTitle: string;
  bookingDate: string;
  reason?: string;
}) {
  return {
    subject: `Booking Cancelled – ${activityTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Booking Cancelled</h2>
        <p>Hi ${travelerName},</p>
        <p>Your booking for <strong>${activityTitle}</strong> on <strong>${bookingDate}</strong> has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>If you have any questions, please contact our support team.</p>
        <p style="color:#6b7280;font-size:12px">NepalTrails · Yatra Nepal Pvt. Ltd.</p>
      </div>
    `,
  };
}

// ── Agency: new booking notification ────────────────────────
export function newBookingAgencyEmail({
  agencyName,
  activityTitle,
  travelerName,
  bookingDate,
  participants,
  totalAmount,
  bookingId,
}: {
  agencyName: string;
  activityTitle: string;
  travelerName: string;
  bookingDate: string;
  participants: number;
  totalAmount: number;
  bookingId: string;
}) {
  return {
    subject: `New Booking Received – ${activityTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563eb">New Booking!</h2>
        <p>Hi ${agencyName},</p>
        <p>You have received a new booking:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Activity</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${activityTitle}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Traveler</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${travelerName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Date</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${bookingDate}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Participants</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${participants}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Total</strong></td><td style="padding:8px;border:1px solid #e5e7eb">$${totalAmount.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${bookingId}</td></tr>
        </table>
        <p>Log in to your agency dashboard to manage this booking.</p>
        <p style="color:#6b7280;font-size:12px">NepalTrails · Yatra Nepal Pvt. Ltd.</p>
      </div>
    `,
  };
}

// ── Agency: application approved ────────────────────────────
export function agencyApprovedEmail({
  agencyName,
  email,
}: {
  agencyName: string;
  email: string;
}) {
  return {
    subject: "Your Agency Has Been Approved – NepalTrails",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">Congratulations! You're Approved</h2>
        <p>Hi ${agencyName},</p>
        <p>Your agency application has been reviewed and <strong>approved</strong>. You can now log in and start listing your activities on NepalTrails.</p>
        <p>Sign in using your registered email: <strong>${email}</strong></p>
        <p style="color:#6b7280;font-size:12px">NepalTrails · Yatra Nepal Pvt. Ltd.</p>
      </div>
    `,
  };
}

// ── Agency: application rejected ────────────────────────────
export function agencyRejectedEmail({
  agencyName,
  reason,
}: {
  agencyName: string;
  reason?: string;
}) {
  return {
    subject: "Agency Application Update – NepalTrails",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Application Not Approved</h2>
        <p>Hi ${agencyName},</p>
        <p>After reviewing your agency application, we are unable to approve it at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>If you believe this is a mistake or would like to reapply, please contact our support team.</p>
        <p style="color:#6b7280;font-size:12px">NepalTrails · Yatra Nepal Pvt. Ltd.</p>
      </div>
    `,
  };
}
