import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";
import { leadMagnetHead } from "@/lib/lead-magnet-head";

const config = leadMagnetLandings["guia-recurso"];

export const Route = createFileRoute("/guia-recurso")({
  head: () => leadMagnetHead(config, "/guia-recurso"),
  component: () => <LeadMagnetLanding config={config} />,
});
