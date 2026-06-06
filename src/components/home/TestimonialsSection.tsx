import { Star, MapPin } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "The Everest Base Camp trek was life-changing. The agency was professional and the experience was beyond expectations.",
    author: "Sarah M.",
    location: "United States",
    rating: 5,
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
  },
  {
    quote: "NepalTrails made it so easy to find and book authentic experiences. We felt safe and well taken care of throughout.",
    author: "James L.",
    location: "Australia",
    rating: 5,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
  },
  {
    quote: "As a solo traveler, I appreciated the verified agencies and clear pricing. The paragliding in Pokhara was incredible!",
    author: "Emma K.",
    location: "Germany",
    rating: 5,
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Travelers Love Us</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Real stories from adventurers who discovered Nepal with us
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.author}
              className="bg-card p-6 rounded-xl border border-border hover:shadow-md transition-shadow"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-secondary text-secondary" />
                ))}
              </div>
              <p className="text-foreground mb-6 italic">"{testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                <img
                  src={testimonial.image}
                  alt={testimonial.author}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <div className="font-medium">{testimonial.author}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {testimonial.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
