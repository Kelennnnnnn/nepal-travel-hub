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
import { buildVoucherHTML } from "@/lib/voucherTemplate";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";

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

const FALLBACK_IMG = FALLBACK_IMAGE_URL;

const money = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

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
