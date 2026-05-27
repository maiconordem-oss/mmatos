import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";

const config = leadMagnetLandings["guia-recurso"];

export const Route = createFileRoute("/guia-recurso")({
  head: () => ({
    meta: [
      { title: config.metaTitle },
      { name: "description", content: config.title },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;600;700&display=swap" },
    ],
  }),
  component: () => <LeadMagnetLanding config={config} />,
});
