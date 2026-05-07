export function bookingConfirmationEmail(data: {
  travelerName: string;
  bookingRef: string;
  activityTitle: string;
  tripDate: string;
  guests: number;
  totalAmount: number;
  agencyName: string;
}): { subject: string; html: string } {
  return {
    subject: `Booking Confirmed — ${data.bookingRef}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #16a34a;">Booking Confirmed!</h1>
        <p>Hi ${data.travelerName},</p>
        <p>Your booking has been confirmed. Here are the details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Booking Ref</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.bookingRef}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Activity</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.activityTitle}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.tripDate}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Guests</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.guests}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Total Paid</td><td style="padding: 8px;">$${data.totalAmount.toFixed(2)}</td></tr>
        </table>
        <p>Your trip will be operated by <strong>${data.agencyName}</strong>.</p>
        <p>If you have questions, you can reply to this email or contact your agency directly.</p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function bookingCancellationEmail(data: {
  travelerName: string;
  bookingRef: string;
  activityTitle: string;
  reason: string;
}): { subject: string; html: string } {
  return {
    subject: `Booking Cancelled — ${data.bookingRef}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Booking Cancelled</h1>
        <p>Hi ${data.travelerName},</p>
        <p>Your booking <strong>${data.bookingRef}</strong> for <strong>${data.activityTitle}</strong> has been cancelled.</p>
        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
        <p>If a refund is applicable, it will be processed within 5-10 business days.</p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function newBookingAgencyEmail(data: {
  agencyName: string;
  bookingRef: string;
  activityTitle: string;
  travelerName: string;
  tripDate: string;
  guests: number;
  totalAmount: number;
  netPayout: number;
}): { subject: string; html: string } {
  return {
    subject: `New Booking Received — ${data.bookingRef}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">New Booking!</h1>
        <p>Hi ${data.agencyName},</p>
        <p>You have a new booking for <strong>${data.activityTitle}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Booking Ref</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.bookingRef}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Traveler</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.travelerName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Date</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.tripDate}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Guests</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.guests}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Your Payout</td><td style="padding: 8px;">$${data.netPayout.toFixed(2)}</td></tr>
        </table>
        <p>Log in to your partner dashboard to manage this booking.</p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function bookingCancelledAgencyEmail(data: {
  agencyName: string;
  bookingRef: string;
  activityTitle: string;
  travelerName: string;
  refundAmount: number;
  refundPercentage: number;
}): { subject: string; html: string } {
  return {
    subject: `Booking Cancelled — ${data.bookingRef}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Booking Cancelled</h1>
        <p>Hi ${data.agencyName},</p>
        <p>A booking for <strong>${data.activityTitle}</strong> has been cancelled by the traveler.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Booking Ref</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.bookingRef}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Traveler</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.travelerName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Refund Issued</td><td style="padding: 8px;">${data.refundPercentage}% ($${data.refundAmount.toFixed(2)})</td></tr>
        </table>
        <p>Log in to your dashboard for full details.</p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function payoutProcessedAgencyEmail(data: {
  agencyName: string;
  amount: number;
  bookingCount: number;
  transferId: string;
}): { subject: string; html: string } {
  return {
    subject: `Payout Processed — $${data.amount.toFixed(2)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #16a34a;">Payout Processed</h1>
        <p>Hi ${data.agencyName},</p>
        <p>Your payout has been transferred to your connected Stripe account.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${data.amount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Bookings Covered</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.bookingCount}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Transfer ID</td><td style="padding: 8px; font-family: monospace; font-size: 13px;">${data.transferId}</td></tr>
        </table>
        <p>Funds typically arrive within 2–3 business days depending on your bank.</p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function agencyApprovedEmail(data: {
  agencyName: string;
}): { subject: string; html: string } {
  return {
    subject: `Your Agency Has Been Verified!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #16a34a;">Congratulations!</h1>
        <p>Hi ${data.agencyName},</p>
        <p>Your agency has been verified and approved on Yatra Nepal. You can now create listings and start receiving bookings.</p>
        <p><a href="https://partner.yatranepal.com/agency/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Go to Dashboard</a></p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}

export function agencyRejectedEmail(data: {
  agencyName: string;
  reason: string;
}): { subject: string; html: string } {
  return {
    subject: `Agency Application Update`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Application Not Approved</h1>
        <p>Hi ${data.agencyName},</p>
        <p>Unfortunately, your agency application was not approved at this time.</p>
        <p><strong>Reason:</strong> ${data.reason}</p>
        <p>You can update your application and resubmit for review.</p>
        <p><a href="https://partner.yatranepal.com/agency/onboarding" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Update Application</a></p>
        <p style="color: #6b7280; font-size: 14px;">— The Yatra Nepal Team</p>
      </div>
    `,
  };
}
