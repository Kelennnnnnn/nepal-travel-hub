// Vercel Routing Middleware — runs at the edge, before any static file or
// SPA rewrite is served. The SPA itself only sets <head> tags client-side
// via react-helmet-async, so link-preview bots (which don't run JS) and
// crawlers always saw the same generic index.html title/description/image
// for every listing and agency page. This intercepts ONLY requests from
// known crawler/preview-bot user agents on the paths that matter for
// sharing/SEO, fetches the minimal public data via seo_listing()/
// seo_agency() (Prompt 26), and returns index.html with the right
// <title>/meta/OG/JSON-LD injected into <head>. Every other visitor
// (i.e. every real human) falls through untouched and gets the normal SPA.
//
// Config lives in `config.matcher` below — Vercel only invokes this
// function for the paths listed there, not on every request.

const BOT_USER_AGENT_RE =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Viber|Googlebot|Bingbot/i;

export const config = {
  matcher: [
    "/",
    "/activities/:path*",
    "/agencies/:path*",
    "/about",
    "/contact",
    "/faq",
    "/terms",
    "/privacy",
    "/cancellation",
    "/cookies",
    "/agency",
  ],
};

interface SeoListing {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string | null;
  location: string;
  category: string;
  base_price: number;
  currency: string;
  duration_label: string;
  rating: number;
  review_count: number;
  agency_name: string;
  updated_at: string;
}

interface SeoAgency {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  city: string;
  district: string;
  website: string | null;
  listing_count: number;
}

interface PageMeta {
  title: string;
  description: string;
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

const SITE_NAME = "Into Nepal";
const DEFAULT_IMAGE = "/api/og";

// Static marketing pages this middleware also covers — their title/
// description don't depend on any DB row, just a fixed mapping.
const STATIC_PAGE_META: Record<string, PageMeta> = {
  "/": {
    title: `${SITE_NAME} — Book Treks, Tours & Adventures in Nepal`,
    description: "Discover and book trekking, tours, and adventures across Nepal with verified local agencies.",
  },
  "/about": {
    title: `About Us | ${SITE_NAME}`,
    description: "Learn about Into Nepal — our mission to connect travelers with authentic Nepal experiences through verified local agencies.",
  },
  "/contact": {
    title: `Contact Us | ${SITE_NAME}`,
    description: "Get in touch with the Into Nepal team. We're here to help with your Nepal travel questions.",
  },
  "/faq": {
    title: `Frequently Asked Questions | ${SITE_NAME}`,
    description: "Find answers to common questions about booking Nepal travel experiences, cancellations, payments and more.",
  },
  "/terms": {
    title: `Terms of Service | ${SITE_NAME}`,
    description: "Review the terms for using Into Nepal to discover, book, and manage Nepal travel experiences.",
  },
  "/privacy": {
    title: `Privacy Policy | ${SITE_NAME}`,
    description: "Read Into Nepal's privacy policy and learn how traveler, booking, payment, and communication data is handled.",
  },
  "/cancellation": {
    title: `Cancellation Policy | ${SITE_NAME}`,
    description: "Review Into Nepal's cancellation and refund policy for Nepal travel bookings.",
  },
  "/cookies": {
    title: `Cookie Policy | ${SITE_NAME}`,
    description: "Learn how Into Nepal uses cookies and similar technologies to operate and improve the marketplace.",
  },
  "/agency": {
    title: `Partner With Us | ${SITE_NAME}`,
    description: "Join Into Nepal as a verified travel agency partner and reach travelers looking for authentic Nepal experiences.",
  },
};

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as T | null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildListingMeta(seo: SeoListing, canonicalUrl: string): PageMeta {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["TouristTrip", "Product"],
    name: seo.title,
    description: seo.description,
    image: seo.image ?? undefined,
    url: canonicalUrl,
    provider: { "@type": "Organization", name: seo.agency_name },
    offers: {
      "@type": "Offer",
      price: seo.base_price,
      priceCurrency: seo.currency,
      availability: "https://schema.org/InStock",
      url: canonicalUrl,
    },
  };
  if (seo.review_count >= 1) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: seo.rating,
      reviewCount: seo.review_count,
    };
  }
  return {
    title: `${seo.title} | ${SITE_NAME}`,
    description: seo.description.slice(0, 300) || `${seo.duration_label} in ${seo.location}, led by ${seo.agency_name}.`,
    // Always the generated composite (title + wordmark over the listing's
    // own first photo, api/og.tsx) rather than the raw photo URL directly —
    // the raw photo alone has no title text, which is the whole point of a
    // link-preview image.
    image: `/api/og?slug=${encodeURIComponent(seo.slug)}`,
    type: "article",
    jsonLd,
  };
}

function buildAgencyMeta(seo: SeoAgency, canonicalUrl: string): PageMeta {
  const description = seo.description.slice(0, 300) ||
    `${seo.display_name} — a verified Nepal travel agency in ${[seo.city, seo.district].filter(Boolean).join(", ")}, listing ${seo.listing_count} activities on ${SITE_NAME}.`;
  return {
    title: `${seo.display_name} | ${SITE_NAME}`,
    description,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": ["Organization", "TravelAgency"],
      name: seo.display_name,
      description,
      url: canonicalUrl,
      address: {
        "@type": "PostalAddress",
        addressLocality: seo.city,
        addressRegion: seo.district,
        addressCountry: "NP",
      },
    },
  };
}

function renderHead(meta: PageMeta, canonicalUrl: string): string {
  const image = meta.image ? new URL(meta.image, canonicalUrl).toString() : new URL(DEFAULT_IMAGE, canonicalUrl).toString();
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.type ?? "website"}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];
  if (meta.jsonLd) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`);
  }
  return tags.join("\n    ");
}

async function renderBotResponse(request: Request, meta: PageMeta): Promise<Response> {
  const canonicalUrl = new URL(request.url).toString();
  const shellRes = await fetch(new URL("/index.html", request.url));
  const shell = await shellRes.text();
  const injected = renderHead(meta, canonicalUrl);
  // Replace the existing static <title>/description/og:*/twitter:* block
  // rather than appending — a bot that reads the FIRST matching tag would
  // otherwise still see index.html's generic placeholders ahead of ours.
  const html = shell.replace(
    /<title>.*?<\/title>[\s\S]*?(?=<link rel="preconnect")/,
    `${injected}\n    `,
  );
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Cached at the edge for 10 minutes — a bot re-crawling a listing
      // shortly after a price/title edit sees stale data for at most that
      // long, same trade-off any CDN cache makes.
      "cache-control": "public, max-age=600, s-maxage=600",
      "x-robots-tag": "all",
    },
  });
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get("user-agent") || "";
  if (!BOT_USER_AGENT_RE.test(userAgent)) return undefined; // humans get the normal SPA

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  const staticMeta = STATIC_PAGE_META[path];
  if (staticMeta) return renderBotResponse(request, staticMeta);

  const listingMatch = path.match(/^\/activities\/([^/]+)$/);
  if (listingMatch) {
    const seo = await callRpc<SeoListing>("seo_listing", { p_slug: listingMatch[1] });
    if (!seo) return notFound();
    return renderBotResponse(request, buildListingMeta(seo, url.toString()));
  }

  const agencyMatch = path.match(/^\/agencies\/([^/]+)$/);
  if (agencyMatch) {
    const seo = await callRpc<SeoAgency>("seo_agency", { p_slug: agencyMatch[1] });
    if (!seo) return notFound();
    return renderBotResponse(request, buildAgencyMeta(seo, url.toString()));
  }

  // In the matcher but not a pattern we recognize (e.g. /activities with
  // no slug) — let it fall through to the normal SPA/404 handling.
  return undefined;
}
