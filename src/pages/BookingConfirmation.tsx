import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  Calendar,
  Users,
  MapPin,
  Loader2,
  AlertCircle,
  Receipt,
  ArrowRight,
} from "lucide-react";

interface BookingDetails {
  id: string;
  booking_ref: string;
  listing_id: string;
  trip_date: string;
  guests: number;
  price_per_person: number;
  total_amount: number;
  status: string;
  payment_status: string;
  traveler_name: string;
  traveler_email: string;
  created_at: string;
  listing?: {
    title: string;
    location: string;
    duration: string;
    images: string[];
    category: string;
  };
}

export default function BookingConfirmation() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("id") || "";
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!bookingId) {
      setError("No booking ID provided.");
      setIsLoading(false);
      return;
    }

    const fetchBooking = async () => {
      const { data, error: fetchError } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_ref,
          listing_id,
          trip_date,
          guests,
          price_per_person,
          total_amount,
          status,
          payment_status,
          traveler_name,
          traveler_email,
          created_at,
          listing:listings (
            title,
            location,
            duration,
            images,
            category
          )
        `)
        .eq("id", bookingId)
        .single();

      if (fetchError || !data) {
        setError("Booking not found.");
        setIsLoading(false);
        return;
      }

      // Supabase returns the join as an object (single) or array
      const listing = Array.isArray(data.listing) ? data.listing[0] : data.listing;
      setBooking({ ...data, listing } as BookingDetails);
      setIsLoading(false);
    };

    fetchBooking();
  }, [bookingId]);

  // Loading
  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your booking…</p>
        </div>
      </Layout>
    );
  }

  // Error
  if (error || !booking) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Booking Not Found</h1>
          <p className="text-muted-foreground mb-6">{error || "We couldn't find this booking."}</p>
          <Link to="/activities">
            <Button>Browse Activities</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const listingImage = booking.listing?.images?.[0] || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop";
  const formattedDate = new Date(booking.trip_date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Layout>
      <div className="pt-24 md:pt-32 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-fade-in">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Booking Confirmed!</h1>
            <p className="text-muted-foreground">
              Your adventure has been booked. A confirmation email has been sent to{" "}
              <span className="font-medium text-foreground">{booking.traveler_email}</span>
            </p>
          </div>

          {/* Booking Details Card */}
          <Card variant="elevated" className="overflow-hidden">
            {/* Listing Image Banner */}
            <div className="relative h-40 md:h-48">
              <img
                src={listingImage}
                alt={booking.listing?.title || "Activity"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <Badge className="bg-primary text-primary-foreground mb-2">
                  {booking.listing?.category || "Activity"}
                </Badge>
                <h2 className="text-xl font-bold text-white">
                  {booking.listing?.title || "Activity"}
                </h2>
              </div>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* Booking Reference */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                <div>
                  <p className="text-sm text-muted-foreground">Booking Reference</p>
                  <p className="text-xl font-bold font-mono tracking-wider">{booking.booking_ref}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    booking.status === "confirmed"
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-100 text-amber-700"
                  }
                >
                  {booking.status === "confirmed" ? "Confirmed" : booking.status}
                </Badge>
              </div>

              {/* Trip Details */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Trip Date</p>
                    <p className="font-medium">{formattedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Guests</p>
                    <p className="font-medium">{booking.guests} person{booking.guests > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{booking.listing?.location || "Nepal"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="font-medium text-lg">${Number(booking.total_amount).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Traveler Info */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">Booked by</p>
                <p className="font-medium">{booking.traveler_name}</p>
                <p className="text-sm text-muted-foreground">{booking.traveler_email}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link to="/activities" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Browse More Activities
                  </Button>
                </Link>
                <Link to="/" className="flex-1">
                  <Button className="w-full gap-2">
                    Back to Home
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
