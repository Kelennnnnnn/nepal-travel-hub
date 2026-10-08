import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface HeroSlide {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface HeroBannerProps {
  slides: HeroSlide[];
  intervalMs?: number;
}

export function HeroBanner({ slides, intervalMs = 6000 }: HeroBannerProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  return (
    <>
      {slides.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          width={slide.width}
          height={slide.height}
          // Slide 0 is the page's LCP element — fetched eagerly at high
          // priority. The others sit behind it (opacity: 0) and aren't
          // needed until the carousel rotates, so they're lazy.
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : "auto"}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out motion-reduce:transition-none",
            i === index ? "opacity-100 animate-hero-zoom" : "opacity-0"
          )}
        />
      ))}

      {slides.length > 1 && (
        <div className="absolute bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1} of ${slides.length}`}
              aria-current={i === index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
