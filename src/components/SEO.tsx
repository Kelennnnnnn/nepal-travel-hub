import { Helmet } from "react-helmet-async";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface SEOProps {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
}

const DEFAULT_DESC = "Discover authentic Nepal travel experiences — trekking, rafting, cultural tours and more with verified local agencies.";
const DEFAULT_IMAGE = "https://intonepal.com/og-image.jpg";

export function SEO({ title, description, image, url, type = "website" }: SEOProps) {
  const { platformName } = usePlatformSettings();
  const fullTitle = `${title} | ${platformName}`;
  const desc = description ?? DEFAULT_DESC;
  const img = image ?? DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />

      {/* Open Graph */}
      <meta property="og:site_name" content={platformName} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:type" content={type} />
      {url && <meta property="og:url" content={url} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
