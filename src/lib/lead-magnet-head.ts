import type { LeadMagnetLandingConfig } from "@/components/LeadMagnetLanding";

const SITE_URL = "https://mmatos.lovable.app";

export function leadMagnetHead(config: LeadMagnetLandingConfig, path: string) {
  const url = `${SITE_URL}${path}`;
  const image = `${SITE_URL}/og/${config.slug}.png${config.ogVersion ? `?v=${config.ogVersion}` : ""}`;
  const description = config.heroSub;

  return {
    meta: [
      { title: config.metaTitle },
      { name: "description", content: description },
      { name: "robots", content: "index,follow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Maicon Matos" },
      { property: "og:title", content: config.title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:secure_url", content: image },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: config.title },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: config.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Barlow+Condensed:wght@800&family=Bebas+Neue&family=Caveat+Brush&display=swap" },
    ],
  };
}

