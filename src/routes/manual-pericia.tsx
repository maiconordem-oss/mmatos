import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";
import { leadMagnetHead } from "@/lib/lead-magnet-head";

const config = leadMagnetLandings["manual-pericia"];

export const Route = createFileRoute("/manual-pericia")({
  head: () => leadMagnetHead(config, "/manual-pericia"),
  component: () => <LeadMagnetLanding config={config} />,
});
