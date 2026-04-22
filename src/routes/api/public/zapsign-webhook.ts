import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Webhook do ZapSign — atualiza status do contrato.
 * Configure no painel do ZapSign:
 *   URL: https://<seu-projeto>.lovable.app/api/public/zapsign-webhook
 */
export const Route = createFileRoute("/api/public/zapsign-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload: any = await request.json();
          const event: string = payload.event_type ?? payload.event ?? "";
          const docId: string | undefined = payload.open_id?.toString() ?? payload.token ?? payload.doc_token;

          if (!docId) return new Response("missing doc id", { status: 400 });

          const updates: any = {};
          if (event.includes("signed") || payload.status === "signed") {
            updates.status = "assinado";
            updates.signed_at = new Date().toISOString();
            if (payload.signed_file) updates.signed_file_url = payload.signed_file;
          } else if (event.includes("viewed") || payload.status === "viewed") {
            updates.status = "visualizado";
            updates.viewed_at = new Date().toISOString();
          } else if (event.includes("refused") || payload.status === "refused") {
            updates.status = "recusado";
          }

          if (Object.keys(updates).length > 0) {
            await supabaseAdmin
              .from("contracts")
              .update(updates)
              .eq("zapsign_document_id", docId);
          }

          return Response.json({ ok: true });
        } catch (e: any) {
          console.error("ZapSign webhook error:", e);
          return new Response(e.message, { status: 500 });
        }
      },
    },
  },
});
