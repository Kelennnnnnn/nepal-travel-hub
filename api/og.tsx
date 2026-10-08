// Generates a 1200×630 PNG social-share image per listing (or a generic
// branded default with no ?slug) — Prompt 26 item 4. Replaces the static
// /og-image.svg, which most link-preview platforms (WhatsApp, Facebook,
// etc.) don't render at all since it's an SVG, not a raster image.
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

interface SeoListing {
  title: string;
  image: string | null;
  location: string;
  duration_label: string;
}

async function fetchSeoListing(slug: string): Promise<SeoListing | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/seo_listing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as SeoListing | null;
  } catch {
    return null;
  }
}

export default async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const seo = slug ? await fetchSeoListing(slug) : null;

  const title = seo?.title ?? "Discover Nepal with Verified Local Agencies";
  const subtitle = seo ? [seo.duration_label, seo.location].filter(Boolean).join(" · ") : "Treks, Tours & Adventures";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          position: "relative",
          backgroundColor: "#17222E",
          backgroundImage: seo?.image ? `url(${seo.image})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(10,16,22,0.92) 0%, rgba(10,16,22,0.35) 55%, rgba(10,16,22,0.1) 100%)",
            display: "flex",
          }}
        />
        <div style={{ position: "relative", padding: "64px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#F2A65A", letterSpacing: "0.04em" }}>INTO NEPAL</div>
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.15, maxWidth: "1000px", display: "flex" }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 28, color: "#D8DEE4", display: "flex" }}>{subtitle}</div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
