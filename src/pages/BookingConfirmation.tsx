import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2, Calendar, Users, MapPin, Loader2, AlertCircle,
  Clock, Download, Home, List, ShieldCheck, Check, Mountain,
  Mail, Phone, Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BookingDetails {
  id: string;
  booking_ref: string;
  listing_id: string;
  agency_id: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  commission_amount: number;
  net_payout: number;
  status: string;
  payment_status: string;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  created_at: string;
  listing?: {
    title: string;
    location: string;
    duration: string;
    difficulty: string;
    description: string;
    images: string[];
    category: string;
    includes: string[];
    rating: number;
    review_count: number;
  };
}

const FALLBACK_IMG = "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1200&h=800&fit=crop";

const money = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// ── PDF voucher HTML ────────────────────────────────────────

function buildVoucherHTML(booking: BookingDetails, agencyName: string): string {
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

// ── Main page ───────────────────────────────────────────────

export default function BookingConfirmation() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("id") ?? "";
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [agencyName, setAgencyName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingId) { setError("No booking ID provided."); setIsLoading(false); return; }

    const fetchBooking = async () => {
      const { data, error: fetchError } = await supabase
        .from("bookings")
        .select(`
          id, booking_ref, listing_id, agency_id,
          trip_date, guests, price_per_person, total_amount,
          commission_amount, net_payout, status, payment_status,
          traveler_name, traveler_email, traveler_phone, created_at,
          listing:listings (
            title, location, duration, difficulty, description,
            images, category, includes, rating, review_count
          )
        `)
        .eq("id", bookingId)
        .single();

      if (fetchError || !data) { setError("Booking not found."); setIsLoading(false); return; }

      const listing = Array.isArray(data.listing) ? data.listing[0] : data.listing;
      const b = { ...data, listing } as BookingDetails;
      setBooking(b);
      setIsLoading(false);

      if (b.agency_id) {
        supabase
          .from("agency_applications")
          .select("company_name")
          .eq("user_id", b.agency_id)
          .maybeSingle()
          .then(({ data: a }) => { if (a?.company_name) setAgencyName(a.company_name); });
      }
    };

    fetchBooking();
  }, [bookingId]);

  // Trigger entrance animation
  useEffect(() => {
    if (!isLoading && booking) {
      const t = setTimeout(() => setShown(true), 80);
      return () => clearTimeout(t);
    }
  }, [isLoading, booking]);

  const handleDownloadPDF = () => {
    if (!booking) return;
    const html = buildVoucherHTML(booking, agencyName);
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { toast.error("Pop-up blocked — please allow pop-ups for this site."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  // ── Loading ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading your booking…</p>
        </div>
      </Layout>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (error || !booking) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-2xl font-bold">Booking Not Found</h1>
          <p className="text-muted-foreground">{error || "We couldn't find this booking."}</p>
          <Link to="/activities"><Button>Browse Activities</Button></Link>
        </div>
      </Layout>
    );
  }

  const img = booking.listing?.images?.[0] ?? FALLBACK_IMG;
  const tripDate = new Date(booking.trip_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const bookedOn = new Date(booking.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const serviceFee = booking.total_amount - booking.price_per_person * booking.guests;
  const includes = booking.listing?.includes ?? [];

  return (
    <Layout>
      <div className="pt-20 md:pt-24 bg-background min-h-screen pb-20">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">

          {/* ── Celebration header ─────────────────────────── */}
          <div
            className={cn(
              "text-center mb-10 transition-all duration-700",
              shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            {/* Pulsing ring + icon */}
            <div className="relative inline-flex items-center justify-center mb-6">
              <div className="absolute h-28 w-28 rounded-full bg-green-400/20 animate-ping" />
              <div className="absolute h-24 w-24 rounded-full bg-green-400/15" />
              <div className="relative h-20 w-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2">
              You're all set!
            </h1>
            <p className="text-muted-foreground text-[15px] max-w-md mx-auto">
              Your booking is confirmed. A confirmation has been sent to{" "}
              <span className="font-semibold text-foreground">{booking.traveler_email}</span>
            </p>
          </div>

          {/* ── Main voucher card ──────────────────────────── */}
          <div
            className={cn(
              "bg-card rounded-2xl border border-border/30 shadow-xl shadow-foreground/5 overflow-hidden transition-all duration-700 delay-100",
              shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {/* Hero image */}
            <div className="relative h-52 md:h-64 overflow-hidden" ref={heroRef}>
              <img src={img} alt={booking.listing?.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Booking ref chip */}
              <div className="absolute top-4 right-4 bg-white/15 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2 text-center">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Booking Ref</p>
                <p className="text-white font-mono font-bold text-lg tracking-wider leading-tight">{booking.booking_ref}</p>
              </div>

              {/* Status badge */}
              <div className="absolute top-4 left-4">
                <span className="flex items-center gap-1.5 bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full">
                  <span className="h-1.5 w-1.5 bg-white rounded-full" />
                  Confirmed
                </span>
              </div>

              {/* Activity title overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                {booking.listing?.category && (
                  <Badge className="bg-primary/80 backdrop-blur-sm text-primary-foreground mb-2 text-[10px] uppercase tracking-widest">
                    {booking.listing.category}
                  </Badge>
                )}
                <h2 className="text-white text-xl md:text-2xl font-bold leading-tight">
                  {booking.listing?.title ?? "Activity"}
                </h2>
                {agencyName && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-white/80 text-xs font-medium">{agencyName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────── */}
            <div className="p-6 md:p-8 space-y-7">

              {/* Trip detail chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: Calendar, label: "Trip Date",  value: tripDate, wide: true },
                  { icon: Users,    label: "Travelers",  value: `${booking.guests} ${booking.guests === 1 ? "person" : "people"}` },
                  { icon: MapPin,   label: "Location",   value: booking.listing?.location ?? "Nepal" },
                  { icon: Clock,    label: "Duration",   value: booking.listing?.duration ?? "—" },
                ].map(({ icon: Icon, label, value, wide }) => (
                  <div key={label} className={cn("p-4 bg-muted/40 rounded-xl", wide && "col-span-2 sm:col-span-2")}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                    </div>
                    <p className="font-semibold text-sm text-foreground leading-snug">{value}</p>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-border/30" />

              {/* Traveler + Price — 2 columns */}
              <div className="grid md:grid-cols-2 gap-6">

                {/* Traveler info */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Traveler Information</p>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mountain className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Full Name</p>
                        <p className="font-semibold text-sm">{booking.traveler_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Email</p>
                        <p className="font-semibold text-sm">{booking.traveler_email}</p>
                      </div>
                    </div>
                    {booking.traveler_phone && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Phone className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Phone</p>
                          <p className="font-semibold text-sm">{booking.traveler_phone}</p>
                        </div>
                      </div>
                    )}
                    <div className="pt-1 text-[11px] text-muted-foreground">
                      Booked on {bookedOn}
                    </div>
                  </div>
                </div>

                {/* Price breakdown */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Payment Summary</p>
                  <div className="bg-muted/40 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {money.format(booking.price_per_person)} × {booking.guests} traveler{booking.guests !== 1 ? "s" : ""}
                      </span>
                      <span className="font-medium">{money.format(booking.price_per_person * booking.guests)}</span>
                    </div>
                    {serviceFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Service fee</span>
                        <span className="font-medium">{money.format(serviceFee)}</span>
                      </div>
                    )}
                    <div className="pt-2.5 border-t border-border/40 flex justify-between items-baseline">
                      <span className="font-bold text-base">Total Paid</span>
                      <span className="text-2xl font-extrabold text-primary">{money.format(booking.total_amount)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">Payment received & secured</span>
                    </div>
                  </div>
                  {booking.listing?.rating != null && Number(booking.listing.rating) > 0 && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-foreground">{Number(booking.listing.rating).toFixed(1)}</span>
                      <span>({booking.listing.review_count} reviews)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* What's included */}
              {includes.length > 0 && (
                <>
                  <div className="border-t border-border/30" />
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">What's Included</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {includes.map((item, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-sm">
                          <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <Check className="h-3 w-3 text-green-600" />
                          </div>
                          <span className="text-foreground/80">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Present at check-in */}
              <div className="border-2 border-dashed border-primary/30 rounded-xl p-4 text-center bg-primary/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Present this at check-in</p>
                <p className="font-mono font-bold text-2xl tracking-widest text-foreground">{booking.booking_ref}</p>
                <p className="text-xs text-muted-foreground mt-1">Show this page or your PDF voucher to your guide</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button
                  size="lg"
                  className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                  onClick={handleDownloadPDF}
                >
                  <Download className="h-4 w-4" />
                  Download Voucher PDF
                </Button>
                <Link to="/my-bookings" className="flex-1">
                  <Button variant="outline" size="lg" className="w-full gap-2">
                    <List className="h-4 w-4" />
                    My Bookings
                  </Button>
                </Link>
                <Link to="/" className="flex-1">
                  <Button variant="outline" size="lg" className="w-full gap-2">
                    <Home className="h-4 w-4" />
                    Home
                  </Button>
                </Link>
              </div>

            </div>
          </div>

          {/* ── What happens next ──────────────────────────── */}
          <div
            className={cn(
              "mt-8 grid sm:grid-cols-3 gap-4 text-center transition-all duration-700 delay-200",
              shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            {[
              { step: "1", title: "Check your email", desc: "A confirmation with your voucher details has been sent." },
              { step: "2", title: "Save your voucher", desc: "Download your PDF to have it ready offline on trip day." },
              { step: "3", title: "Enjoy your adventure", desc: "Show your booking ref to the guide and you're all set!" },
            ].map(({ step, title, desc }) => (
              <div key={step} className="p-5 bg-card rounded-2xl border border-border/20">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mx-auto mb-3">
                  {step}
                </div>
                <p className="font-bold text-sm mb-1">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </Layout>
  );
}
