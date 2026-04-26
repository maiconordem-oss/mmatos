import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/workflows/$id")({ beforeLoad: () => { throw redirect({ to: "/funis" }); } });
