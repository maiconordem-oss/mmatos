import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";
import { leadMagnetHead } from "@/lib/lead-magnet-head";

const config = leadMagnetLandings["guia-aposentadoria"];

export const Route = createFileRoute("/guia-aposentadoria")({
  head: () => leadMagnetHead(config, "/guia-aposentadoria"),
  component: () => <LeadMagnetLanding config={config} />,
});
