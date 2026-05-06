import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ImageGallery } from "@/components/gallery/ImageGallery";
import {
  MapPin, Clock, Users, Star, Check, X as XIcon,
  ShieldCheck, Eye, AlertTriangle,
} from "lucide-react";
import type { ListingFormData } from "@/lib/validations";

interface ItineraryDay { day: number; title: string; description: string; }

interface ListingPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Partial<ListingFormData>;
  itinerary: ItineraryDay[];
  agencyName: string;
}

export function ListingPreviewDialog({
  open,
  onOpenChange,
  data,
  itinerary,
  agencyName,
}: ListingPreviewDialogProps) {
  const price = Number(data.price) || 0;
  const images = data.images ?? [];
  const includes = data.includes ?? [];
  const excludes = data.excludes ?? [];

  const initials = agencyName
    ? agencyName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "A";

  const isEmpty = !data.title && images.length === 0 && !data.description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden flex flex-col h-[92vh]">
        {/* Sticky banner */}
        <div className="flex-shrink-0 flex items-center gap-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-5 py-2.5 pr-12">
          <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Traveler Preview — this is how your listing appears to customers
          </p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Fill in some details first to see the preview.</p>
            </div>
          ) : (
            <>
              {/* Gallery */}
              <ImageGallery images={images} title={data.title ?? "Activity Preview"} />

              {/* Content */}
              <div className="px-6 py-8 max-w-5xl mx-auto">
                <div className="grid lg:grid-cols-3 gap-8">

                  {/* ── Left: main content ───────────────────────────── */}
                  <div className="lg:col-span-2 space-y-8">

                    {/* Title & meta */}
                    <div>
                      <h1 className="text-3xl font-bold mb-3 text-foreground">
                        {data.title || <span className="text-muted-foreground italic">Untitled Activity</span>}
                      </h1>
                      {data.category && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 mb-4">
                          {data.category}
                        </Badge>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                        {data.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            <span>{data.location}</span>
                          </div>
                        )}
                        {data.duration && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            <span>{data.duration}</span>
                          </div>
                        )}
                        {data.max_participants && (
                          <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4" />
                            <span>Max {data.max_participants} people</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Star className="h-4 w-4 fill-secondary text-secondary" />
                          <span className="font-medium text-foreground">New</span>
                          <span className="text-sm">(No reviews yet)</span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {data.description && (
                      <div>
                        <h2 className="text-xl font-semibold mb-3">About This Activity</h2>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                          {data.description}
                        </p>
                        {data.difficulty && (
                          <p className="text-muted-foreground leading-relaxed mt-4">
                            <span className="font-medium text-foreground">Difficulty:</span>{" "}
                            {data.difficulty}
                          </p>
                        )}
                      </div>
                    )}

                    {/* What's Included */}
                    {includes.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4">What's Included</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {includes.map((item) => (
                            <div key={item} className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Check className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Not Included */}
                    {excludes.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4">Not Included</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {excludes.map((item) => (
                            <div key={item} className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                <XIcon className="h-4 w-4 text-destructive" />
                              </div>
                              <span className="text-sm">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Itinerary */}
                    {itinerary.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4">Itinerary</h2>
                        <div className="space-y-4">
                          {itinerary.map((item, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium flex-shrink-0">
                                  {item.day}
                                </div>
                                {i < itinerary.length - 1 && (
                                  <div className="w-px flex-1 bg-border mt-1" />
                                )}
                              </div>
                              <div className="flex-1 pb-4">
                                <h3 className="font-medium">
                                  {item.title || <span className="text-muted-foreground italic">Untitled day</span>}
                                </h3>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Agency card */}
                    <Card>
                      <CardContent className="p-5">
                        <h2 className="text-lg font-semibold mb-4">Operated by</h2>
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-2xl font-bold text-primary">{initials}</span>
                          </div>
                          <div>
                            <h3 className="font-semibold">{agencyName || "Your Agency"}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                              <ShieldCheck className="h-4 w-4 text-primary" />
                              <span>Verified Partner</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Right: booking card (static) ─────────────────── */}
                  <div className="lg:col-span-1">
                    <Card className="border-2">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold text-foreground">
                            ${price.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground">/ person</span>
                        </div>

                        <div className="space-y-1.5 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            Free cancellation available
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            Instant confirmation
                          </div>
                        </div>

                        {/* Fake date selector */}
                        <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Select Date
                          </div>
                          <div className="h-8 bg-muted/40 rounded-md" />
                        </div>

                        {/* Fake guests */}
                        <div className="flex items-center justify-between py-1">
                          <span className="text-sm font-medium">Guests</span>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full border bg-muted/30" />
                            <span className="font-medium w-4 text-center">1</span>
                            <div className="w-7 h-7 rounded-full border bg-muted/30" />
                          </div>
                        </div>

                        {/* Disabled book button */}
                        <div className="rounded-lg bg-primary/10 text-primary text-center py-3 text-sm font-medium cursor-not-allowed select-none">
                          Book Now
                        </div>

                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-center">
                          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Preview Mode</p>
                          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                            Booking is available to travelers on the live listing
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
