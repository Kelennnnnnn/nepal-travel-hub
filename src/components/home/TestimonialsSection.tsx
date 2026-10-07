import { useQuery } from "@tanstack/react-query";
import { Star, BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface TestimonialReview {
  id: string;
  rating: number;
  comment: string;
  traveler_name: string | null;
  listings: { title: string; location: string } | null;
}

// Below this comment length, a review reads more like a one-line rating
// than a testimonial worth featuring on the home page.
const MIN_COMMENT_LENGTH = 80;
const MAX_SHOWN = 6;
// Below this many qualifying reviews, the section would look sparse/fake
// next to a marketing claim of a "verified community" — hide it entirely
// rather than pad it with weak reviews.
const MIN_TO_SHOW = 3;

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

async function fetchTestimonials(): Promise<TestimonialReview[]> {
  // reviews_public_select (supabase/migrations/20260917000009_review_
  // integrity.sql) already restricts this to non-hidden reviews on
  // published listings — no extra status filtering needed here.
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, traveler_name, listings(title, location)")
    .gte("rating", 4)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return (data as unknown as TestimonialReview[])
    .filter((r) => (r.comment?.length ?? 0) >= MIN_COMMENT_LENGTH)
    .slice(0, MAX_SHOWN);
}

export function TestimonialsSection() {
  const { data: reviews } = useQuery({
    queryKey: ["home-testimonials"],
    queryFn: fetchTestimonials,
    staleTime: 10 * 60 * 1000,
  });

  if (!reviews || reviews.length < MIN_TO_SHOW) return null;

  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Verified Expedition Community
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-2">Stories From The Trail</h2>
          <p className="text-muted-foreground">Real reviews from independent travelers who booked local guides through Into Nepal.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {reviews.map((review) => {
            const author = review.traveler_name?.trim() || "Verified traveler";
            return (
              <div
                key={review.id}
                className="bg-card p-6 rounded-xl border border-border hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[0_4px_12px_rgba(23,34,46,.08)] transition-all duration-200"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-foreground/80 mb-6">&quot;{review.comment}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                    {initialsOf(author)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">{author}</span>
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    </div>
                    {review.listings && (
                      <div className="text-xs text-muted-foreground truncate">{review.listings.title}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
