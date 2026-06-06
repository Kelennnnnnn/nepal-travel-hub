// Booking voucher HTML generator — kept out of BookingConfirmation.tsx to limit component size.

export interface VoucherBooking {
  booking_ref: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  created_at: string;
  listing?: {
    title: string;
    location: string;
    duration: string;
    difficulty: string;
    category: string;
    includes: string[];
  } | null;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function buildVoucherHTML(booking: VoucherBooking, agencyName: string): string {
  const tripDate = new Date(booking.trip_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const bookedOn = new Date(booking.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const serviceFee = booking.total_amount - booking.price_per_person * booking.guests;
  const includesRows = (booking.listing?.includes ?? [])
    .map(i => `<li style="margin:3px 0">✓ ${i}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Booking Voucher – ${booking.booking_ref}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 12mm 14mm; }
    body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; font-size: 13px; color: #1a1208; background: #fff; }

    /* ── Header ── */
    .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #c2450b; margin-bottom: 20px; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand-icon { width: 36px; height: 36px; background: #c2450b; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 18px; }
    .brand-name { font-size: 20px; font-weight: 800; color: #1a1208; }
    .brand-name span { color: #c2450b; }
    .voucher-label { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888; }

    /* ── Status bar ── */
    .status-bar { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; flex-shrink: 0; }
    .status-text { font-size: 13px; font-weight: 700; color: #15803d; }
    .ref { margin-left: auto; font-family: monospace; font-size: 15px; font-weight: 800; letter-spacing: 1px; color: #1a1208; background: #fff; border: 1px dashed #ccc; border-radius: 6px; padding: 3px 10px; }

    /* ── Activity title ── */
    .activity-title { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .activity-meta { display: flex; flex-wrap: wrap; gap: 10px; color: #666; font-size: 12px; margin-bottom: 20px; }
    .meta-pill { display: flex; align-items: center; gap: 4px; background: #f5f0eb; border-radius: 99px; padding: 3px 10px; }

    /* ── Two-column ── */
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .section { border: 1px solid #e5e0da; border-radius: 10px; padding: 14px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #aaa; margin-bottom: 10px; }
    .detail-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .detail-row + .detail-row { border-top: 1px solid #f0ebe5; }
    .detail-label { color: #777; }
    .detail-value { font-weight: 600; text-align: right; max-width: 55%; }

    /* ── Price table ── */
    .price-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .price-table td { padding: 5px 0; }
    .price-table tr + tr td { border-top: 1px solid #f0ebe5; }
    .price-table .total td { border-top: 2px solid #ddd; font-weight: 800; font-size: 15px; padding-top: 8px; }
    .price-table .label { color: #777; }

    /* ── Includes ── */
    .includes ul { list-style: none; columns: 2; font-size: 12px; color: #444; }
    .includes ul li { padding: 2px 0; color: #15803d; }

    /* ── Footer ── */
    .footer { margin-top: 20px; padding-top: 14px; border-top: 1px dashed #ccc; display: flex; justify-content: space-between; font-size: 11px; color: #999; }
    .footer strong { color: #444; }

    /* ── Check-in box ── */
    .checkin-box { border: 2px dashed #c2450b; border-radius: 10px; padding: 14px 18px; text-align: center; margin-bottom: 20px; }
    .checkin-title { font-weight: 700; color: #c2450b; font-size: 13px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .checkin-sub { font-size: 11px; color: #888; }
    .big-ref { font-size: 28px; font-weight: 900; font-family: monospace; letter-spacing: 3px; color: #1a1208; margin: 6px 0; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-icon">Y</div>
      <div class="brand-name">Yatra<span>Nepal</span></div>
    </div>
    <div class="voucher-label">Booking Voucher</div>
  </div>

  <!-- Status bar -->
  <div class="status-bar">
    <div class="status-dot"></div>
    <div class="status-text">Booking Confirmed &amp; Payment Received</div>
    <div class="ref">${booking.booking_ref}</div>
  </div>

  <!-- Activity -->
  <div class="activity-title">${booking.listing?.title ?? "Activity"}</div>
  <div class="activity-meta">
    <span class="meta-pill">📍 ${booking.listing?.location ?? "Nepal"}</span>
    <span class="meta-pill">⏱ ${booking.listing?.duration ?? "—"}</span>
    <span class="meta-pill">🏔 ${booking.listing?.difficulty ?? "—"}</span>
    <span class="meta-pill">🏷 ${booking.listing?.category ?? "—"}</span>
    ${agencyName ? `<span class="meta-pill">🏢 ${agencyName}</span>` : ""}
  </div>

  <!-- Check-in box -->
  <div class="checkin-box">
    <div class="checkin-title">Present this voucher at check-in</div>
    <div class="big-ref">${booking.booking_ref}</div>
    <div class="checkin-sub">Show this document to your guide on the day of your trip</div>
  </div>

  <!-- Two-column: Trip details + Traveler info -->
  <div class="cols">
    <div class="section">
      <div class="section-title">Trip Details</div>
      <div class="detail-row"><span class="detail-label">Trip Date</span><span class="detail-value">${tripDate}</span></div>
      <div class="detail-row"><span class="detail-label">Guests</span><span class="detail-value">${booking.guests} traveler${booking.guests !== 1 ? "s" : ""}</span></div>
      <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${booking.listing?.location ?? "Nepal"}</span></div>
      <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${booking.listing?.duration ?? "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Difficulty</span><span class="detail-value">${booking.listing?.difficulty ?? "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value" style="color:#15803d">Confirmed ✓</span></div>
    </div>
    <div class="section">
      <div class="section-title">Traveler Information</div>
      <div class="detail-row"><span class="detail-label">Full Name</span><span class="detail-value">${booking.traveler_name}</span></div>
      <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${booking.traveler_email}</span></div>
      ${booking.traveler_phone ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${booking.traveler_phone}</span></div>` : ""}
      <div class="detail-row"><span class="detail-label">Booked On</span><span class="detail-value">${bookedOn}</span></div>
      <div class="detail-row"><span class="detail-label">Operated by</span><span class="detail-value">${agencyName || "Verified Agency"}</span></div>
    </div>
  </div>

  <!-- Price breakdown + Includes -->
  <div class="cols">
    <div class="section">
      <div class="section-title">Payment Summary</div>
      <table class="price-table">
        <tr>
          <td class="label">${money.format(booking.price_per_person)} × ${booking.guests} traveler${booking.guests !== 1 ? "s" : ""}</td>
          <td style="text-align:right">${money.format(booking.price_per_person * booking.guests)}</td>
        </tr>
        ${serviceFee > 0 ? `<tr><td class="label">Service Fee</td><td style="text-align:right">${money.format(serviceFee)}</td></tr>` : ""}
        <tr class="total">
          <td>Total Paid</td>
          <td style="text-align:right;color:#c2450b">${money.format(booking.total_amount)}</td>
        </tr>
      </table>
    </div>
    ${includesRows ? `
    <div class="section includes">
      <div class="section-title">What's Included</div>
      <ul>${includesRows}</ul>
    </div>` : `<div class="section"><div class="section-title">Important Notes</div><p style="font-size:12px;color:#666;line-height:1.6">Please arrive 15 minutes before your scheduled departure. Bring appropriate clothing for weather conditions. Contact your agency if you have any questions before the trip.</p></div>`}
  </div>

  <!-- Footer -->
  <div class="footer">
    <div><strong>Yatra Nepal</strong> · Connecting travelers with authentic Himalayan experiences</div>
    <div>Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
  </div>

</body>
</html>`;
}
