import { createFileRoute } from "@tanstack/react-router";
import { LeadMagnetLanding, leadMagnetLandings } from "@/components/LeadMagnetLanding";
import { leadMagnetHead } from "@/lib/lead-magnet-head";

const config = leadMagnetLandings["bpc-loas"];

export const Route = createFileRoute("/bpc")({
  head: () => leadMagnetHead(config, "/bpc"),
  component: () => <LeadMagnetLanding config={config} />,
});
