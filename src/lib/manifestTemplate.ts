/** Escapes HTML-significant characters so traveler/agency-supplied values can't inject markup or scripts when written into the print window via document.write. */
function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TripGroup {
  key: string;
  date: string;
  activity: string;
  bookings: Array<{
    id: string;
    booking_ref: string;
    customer: string;
    email: string;
    phone: string;
    guests: number;
    notes?: string;
  }>;
  totalGuests: number;
  totalRevenue: number;
}

export function buildManifestHtml(group: TripGroup, agencyName: string): string {
  const generatedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const rows = group.bookings
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(b.booking_ref)}</td>
        <td>${escapeHtml(b.customer)}</td>
        <td>${escapeHtml(b.email)}</td>
        <td>${escapeHtml(b.phone)}</td>
        <td style="text-align:center">${b.guests}</td>
        <td>${b.notes ? escapeHtml(b.notes) : "—"}</td>
      </tr>`,
    )
    .join("");

  const activityTitle = escapeHtml(group.activity);
  const safeAgencyName = escapeHtml(agencyName);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Guest Manifest – ${activityTitle} – ${escapeHtml(group.date)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; max-width: 920px; margin: 0 auto; padding: 40px 32px; color: #111; font-size: 13px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 28px; }
    .summary { display: flex; gap: 0; margin-bottom: 28px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; }
    .summary-item { flex: 1; padding: 14px 20px; border-right: 1px solid #e5e5e5; }
    .summary-item:last-child { border-right: none; }
    .summary-item .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
    .summary-item .value { font-size: 24px; font-weight: 700; color: #111; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #111; color: #fff; }
    th { text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; }
    td { padding: 10px 14px; border-bottom: 1px solid #e5e5e5; }
    tbody tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 36px; font-size: 11px; color: #bbb; text-align: center; border-top: 1px solid #e5e5e5; padding-top: 16px; }
    @media print {
      body { padding: 16px; }
      .footer { position: fixed; bottom: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <h1>${activityTitle}</h1>
  <p class="subtitle">Guest Manifest &nbsp;·&nbsp; Generated ${generatedDate} &nbsp;·&nbsp; ${safeAgencyName}</p>
  <div class="summary">
    <div class="summary-item"><div class="label">Trip Date</div><div class="value">${escapeHtml(group.date)}</div></div>
    <div class="summary-item"><div class="label">Total Guests</div><div class="value">${group.totalGuests}</div></div>
    <div class="summary-item"><div class="label">Bookings</div><div class="value">${group.bookings.length}</div></div>
    <div class="summary-item"><div class="label">Total Revenue</div><div class="value">$${group.totalRevenue.toLocaleString()}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Booking Ref</th>
        <th>Guest Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th style="text-align:center">Guests</th>
        <th>Special Requests / Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Yatra Nepal &nbsp;·&nbsp; Guest Manifest &nbsp;·&nbsp; Confidential — Do not distribute</div>
</body>
</html>`;
}
