import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";
import { leadMagnetHead } from "@/lib/lead-magnet-head";

const config = leadMagnetLandings["guia-auxilio"];

export const Route = createFileRoute("/guia-auxilio")({
  head: () => leadMagnetHead(config, "/guia-auxilio"),
  component: () => <LeadMagnetLanding config={config} />,
});
