# Image credits

Images downloaded from Unsplash and self-hosted under `src/assets/` instead of
hotlinked from `images.unsplash.com` (hotlinking depends on a third party's
CDN staying up and reachable, and was flagged in a frontend-accuracy review).
All are published under the [Unsplash License](https://unsplash.com/license),
which does not require attribution — but exact photographer credit should be
looked up at the source URL below before any attribution-sensitive use (e.g.
a dedicated "Photo credits" page), since it could not be resolved
automatically here (Unsplash's public photo-page slugs can't be derived from
the CDN image id without an API key).

| File | Used for | Source |
|---|---|---|
| `src/assets/fallback-activity.jpg` | Fallback image for a listing/activity with no photos (`src/lib/constants.ts`, `src/components/gallery/ImageGallery.tsx`) | https://images.unsplash.com/photo-1544735716-392fe2489ffa |
| `src/assets/community-impact-cover.jpg` | Home page "Responsible Mountaineering" section cover (`src/components/home/CommunityImpact.tsx`) | https://images.unsplash.com/photo-1585937421612-70a008356fbe |
| `src/assets/hero-nepal-2.jpg` | Home page hero carousel, slide 2 (`src/pages/Index.tsx`) | https://images.unsplash.com/photo-1486911278844-a81c5267e227 |
| `src/assets/hero-nepal-3.jpg` | Home page hero carousel, slide 3 (`src/pages/Index.tsx`) | https://images.unsplash.com/photo-1464822759023-fed622ff2c3b |
| `src/assets/hero-nepal.jpg` | Home page hero carousel, slide 1; also reused as the agency-landing hero background (`src/pages/AgencyLanding.tsx`) | Pre-existing local asset — not from this pass |
