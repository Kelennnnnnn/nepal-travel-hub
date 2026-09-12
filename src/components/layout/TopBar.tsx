const ANNOUNCEMENTS = [
  "100% Locally-Led Adventures",
  "Certified Community Impact",
  "24/7 Kathmandu Expedition Support",
];

export function TopBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-8 bg-brand-navy text-white/90">
      <div className="container mx-auto px-4 h-full flex items-center justify-center">
        <p className="text-[11px] md:text-xs font-medium tracking-wide truncate">
          {ANNOUNCEMENTS.join("  •  ")}
        </p>
      </div>
    </div>
  );
}
