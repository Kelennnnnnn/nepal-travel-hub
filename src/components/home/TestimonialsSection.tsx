import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    headline: "Life-changing experience",
    quote: "The cultural homestay arranged through Into Nepal was beyond our wildest expectations. We felt like family.",
    author: "Sarah J.",
    location: "United Kingdom",
    rating: 5,
  },
  {
    headline: "Seamless booking",
    quote: "Found the perfect local guide for the Annapurna Circuit. The platform made comparing options so easy and transparent.",
    author: "Mark R.",
    location: "Australia",
    rating: 5,
  },
  {
    headline: "Authentic and respectful",
    quote: "Loved the focus on verified local partners. Knowing my money was going directly into the community made the trek even better.",
    author: "Elena L.",
    location: "Spain",
    rating: 5,
  },
];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function TestimonialsSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-2">Traveler Reviews</h2>
          <p className="text-muted-foreground">Real stories from adventurers who discovered Nepal with us.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.author}
              className="bg-card p-6 rounded-xl border border-border hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[0_4px_12px_rgba(23,34,46,.08)] transition-all duration-200"
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
              <h3 className="font-bold mb-2">{testimonial.headline}</h3>
              <p className="text-foreground/80 mb-6">"{testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                  {initialsOf(testimonial.author)}
                </div>
                <div>
                  <div className="font-medium text-sm">{testimonial.author}</div>
                  <div className="text-xs text-muted-foreground">{testimonial.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
