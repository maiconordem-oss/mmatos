import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/agentes")({ beforeLoad: () => { throw redirect({ to: "/funis" }); } });
