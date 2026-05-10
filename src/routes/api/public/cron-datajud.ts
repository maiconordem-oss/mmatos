import { createFileRoute } from "@tanstack/react-router";
import { atualizarTodosProcessos } from "@/server/datajud.functions";

export const Route = createFileRoute("/api/public/cron-datajud")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const token = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 32);
          const r = await atualizarTodosProcessos({ data: { token } });
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
