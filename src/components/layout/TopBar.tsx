import { useSiteContent } from "@/hooks/useSiteContent";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const DEFAULT_ANNOUNCEMENTS = ["100% Locally-Led Adventures", "Verified Local Agencies Only"];

export function TopBar() {
  const announcements = useSiteContent("topbar_announcements", DEFAULT_ANNOUNCEMENTS);
  const { support_hours: supportHours } = usePlatformSettings();
  const items = supportHours ? [...announcements, `Support: ${supportHours}`] : announcements;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-8 bg-primary text-primary-foreground/90">
      <div className="container mx-auto px-4 h-full flex items-center justify-center">
        <p className="text-[11px] md:text-xs font-medium tracking-wide truncate">
          {items.join("  •  ")}
        </p>
      </div>
    </div>
  );
}
