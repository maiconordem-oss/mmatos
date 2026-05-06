import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/media-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const msgId = url.searchParams.get("msg");

        if (!msgId) {
          return new Response("Missing msg param", { status: 400 });
        }

        // Buscar mensagem e instância
        const { data: msg } = await supabaseAdmin
          .from("messages")
          .select("media_url, media_mime, conversation_id")
          .eq("id", msgId)
          .single();

        if (!msg?.media_url) {
          return new Response("Media not found", { status: 404 });
        }

        // Buscar instância para pegar api_key
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("instance_id")
          .eq("id", msg.conversation_id)
          .single();

        let apiKey = "";
        if (conv?.instance_id) {
          const { data: inst } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("api_key")
            .eq("id", conv.instance_id)
            .single();
          apiKey = inst?.api_key ?? "";
        }

        // Buscar mídia com autenticação
        try {
          const mediaRes = await fetch(msg.media_url, {
            headers: apiKey ? { apikey: apiKey } : {},
          });

          if (!mediaRes.ok) {
            return new Response(`Evolution error: ${mediaRes.status}`, { status: 502 });
          }

          const contentType = msg.media_mime || mediaRes.headers.get("content-type") || "application/octet-stream";
          const buffer = await mediaRes.arrayBuffer();

          return new Response(buffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, max-age=86400",
              "Content-Length": buffer.byteLength.toString(),
            },
          });
        } catch (e: any) {
          return new Response(`Proxy error: ${e.message}`, { status: 500 });
        }
      },
    },
  },
});
