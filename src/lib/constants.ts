import fallbackActivity from "@/assets/fallback-activity.jpg";

// Self-hosted (docs/IMAGE_CREDITS.md) instead of hotlinked from a
// third-party CDN, which has to stay reachable for a fallback image shown
// whenever a listing has none of its own — exactly the wrong place for an
// extra external dependency.
export const FALLBACK_IMAGE_URL = fallbackActivity;
