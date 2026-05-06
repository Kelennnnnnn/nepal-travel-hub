import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

const FALLBACK = "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop";

interface ImageGalleryProps {
  images: string[];
  title: string;
}

// ── Lightbox ─────────────────────────────────────────────────

function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <span className="text-white/70 text-sm">{index + 1} / {images.length}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setZoomed((z) => !z)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main image */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden px-12">
        <img
          src={images[index]}
          alt=""
          className={cn(
            "max-h-full max-w-full transition-transform duration-300 select-none",
            zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
          )}
          onClick={() => setZoomed((z) => !z)}
          draggable={false}
        />
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex-shrink-0 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-none justify-center">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => { setIndex(i); setZoomed(false); }}
                className={cn(
                  "w-14 h-10 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                  i === index ? "border-white opacity-100" : "border-transparent opacity-50 hover:opacity-75"
                )}
              >
                <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gallery layouts ───────────────────────────────────────────

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const imgs = images.length > 0 ? images : [FALLBACK];
  const open = (i: number) => setLightboxIndex(i);

  // ── 1 image ─────────────────────────────────────────────────
  if (imgs.length === 1) {
    return (
      <>
        <div
          className="relative h-[45vh] md:h-[55vh] overflow-hidden cursor-pointer group"
          onClick={() => open(0)}
        >
          <img
            src={imgs[0]}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
        {lightboxIndex !== null && (
          <Lightbox images={imgs} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </>
    );
  }

  // ── 2–4 images: Airbnb mosaic ────────────────────────────────
  if (imgs.length >= 2 && imgs.length <= 4) {
    const rest = imgs.slice(1, 4);
    return (
      <>
        <div className="grid grid-cols-2 gap-1 h-[45vh] md:h-[55vh]">
          {/* Left — main image */}
          <div
            className="relative overflow-hidden cursor-pointer group"
            onClick={() => open(0)}
          >
            <img src={imgs[0]} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>
          {/* Right — stacked */}
          <div className={cn("grid gap-1", rest.length >= 2 ? "grid-rows-2" : "grid-rows-1")}>
            {rest.map((src, i) => (
              <div
                key={i}
                className="relative overflow-hidden cursor-pointer group"
                onClick={() => open(i + 1)}
              >
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                {/* "+X more" badge on last visible tile if more images exist */}
                {i === rest.length - 1 && imgs.length > 4 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-xl font-semibold">+{imgs.length - 4} more</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {lightboxIndex !== null && (
          <Lightbox images={imgs} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </>
    );
  }

  // ── 5+ images: carousel ──────────────────────────────────────
  const prev = () => setCarouselIndex((i) => (i - 1 + imgs.length) % imgs.length);
  const next = () => setCarouselIndex((i) => (i + 1) % imgs.length);

  return (
    <>
      <div className="relative h-[45vh] md:h-[55vh] bg-black overflow-hidden group">
        {/* Crossfade images */}
        {imgs.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            onClick={() => open(i)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover cursor-pointer transition-opacity duration-500",
              i === carouselIndex ? "opacity-100" : "opacity-0"
            )}
          />
        ))}

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

        {/* Prev / Next */}
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Counter */}
        <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
          {carouselIndex + 1} / {imgs.length}
        </div>

        {/* Mobile dot indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
          {imgs.slice(0, 7).map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCarouselIndex(i); }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                i === carouselIndex ? "bg-white scale-125" : "bg-white/50"
              )}
            />
          ))}
        </div>

        {/* Desktop thumbnail strip */}
        <div className="absolute bottom-0 left-0 right-0 hidden md:flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-none">
          {imgs.map((src, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCarouselIndex(i); }}
              className={cn(
                "w-16 h-11 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                i === carouselIndex ? "border-white opacity-100" : "border-transparent opacity-60 hover:opacity-90"
              )}
            >
              <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox images={imgs} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}
