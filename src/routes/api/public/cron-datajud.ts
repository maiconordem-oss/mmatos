import { createFileRoute } from "@tanstack/react-router";
import { atualizarTodosProcessos } from "@/server/datajud.functions";
import { requireCronSecret } from "@/server/security.server";

export const Route = createFileRoute("/api/public/cron-datajud")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        requireCronSecret(request);
        try {
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
          const token = serviceKey.slice(0, 32);
          const r = await atualizarTodosProcessos({ data: { token } });
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
