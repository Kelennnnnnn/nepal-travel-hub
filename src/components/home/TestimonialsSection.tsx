import { Star, BadgeCheck } from "lucide-react";

const TESTIMONIALS = [
  {
    headline: "Beyond all expectations",
    quote: "The direct connection to our tour guide Dawa made all the difference. We avoided the crowded main route and stayed in family teahouses with warm Sherpa hospitality that felt genuine.",
    author: "Sarah Jenkins",
    location: "Everest Region Trekker",
    rating: 5,
  },
  {
    headline: "Safety and logistics were on point",
    quote: "Our guide monitored our pulse oximeter readings every morning during acclimatization days. When altitude sickness started to affect a member of our group, they arranged extra rest without hesitation.",
    author: "Marcus & Elena Lind",
    location: "Annapurna Circuit",
    rating: 5,
  },
  {
    headline: "Proud to support local operators",
    quote: "Knowing that 100% of my money stayed in Kathmandu with our guide's family made the whole journey through the mountains feel worthwhile beyond the views.",
    author: "David Tan",
    location: "Langtang Region",
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
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Verified Expedition Community
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-2">Stories From The Trail</h2>
          <p className="text-muted-foreground">Real reviews from independent travelers who booked local guides through Into Nepal.</p>
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
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                  {initialsOf(testimonial.author)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm truncate">{testimonial.author}</span>
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{testimonial.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
