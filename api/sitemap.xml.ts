// Generates /sitemap.xml from published listings, approved agencies,
// active category/destination filter links, and the static marketing
// pages — Prompt 26 item 5. There was previously no sitemap at all.
export const config = { runtime: "edge" };

const SITE_URL = "https://intonepal.com";

const STATIC_PATHS = [
  "/", "/activities", "/about", "/contact", "/faq", "/terms", "/privacy",
  "/cancellation", "/cookies", "/agency",
];

interface SitemapEntry {
  path: string;
  lastmod: string;
}

async function fetchEntries(): Promise<SitemapEntry[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/sitemap_entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    return (await res.json()) as SitemapEntry[];
  } catch {
    return [];
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : "";
  return `  <url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
}

export default async function handler(): Promise<Response> {
  const dbEntries = await fetchEntries();
  const now = new Date().toISOString();

  const urls = [
    ...STATIC_PATHS.map((p) => urlEntry(`${SITE_URL}${p}`, now)),
    ...dbEntries.map((e) => urlEntry(`${SITE_URL}${e.path}`, e.lastmod)),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
