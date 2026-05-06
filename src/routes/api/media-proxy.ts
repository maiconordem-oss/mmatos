import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/media-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const msgId = url.searchParams.get("msg");

        if (!msgId) return new Response("Missing msg param", { status: 400 });

        // Buscar mensagem + instância
        const { data: msg } = await supabaseAdmin
          .from("messages")
          .select("media_url, media_mime, external_id, conversation_id")
          .eq("id", msgId)
          .single();

        if (!msg?.media_url) return new Response("Media not found", { status: 404 });

        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("instance_id")
          .eq("id", msg.conversation_id)
          .single();

        let apiKey = "";
        let apiUrl = "";
        let instanceName = "";

        if (conv?.instance_id) {
          const { data: inst } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("api_key, api_url, instance_name")
            .eq("id", conv.instance_id)
            .single();
          apiKey       = inst?.api_key ?? "";
          apiUrl       = inst?.api_url?.replace(/\/$/, "") ?? "";
          instanceName = inst?.instance_name ?? "";
        }

        try {
          let buffer: ArrayBuffer | null = null;
          let contentType = msg.media_mime || "application/octet-stream";

          // ESTRATÉGIA 1: Evolution API — endpoint de download de mídia
          // A Evolution baixa do CDN do WhatsApp com as credenciais dela
          if (apiUrl && apiKey && instanceName && msg.external_id) {
            const evoRes = await fetch(
              `${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: apiKey },
                body: JSON.stringify({ message: { key: { id: msg.external_id } }, convertToMp4: false }),
              }
            ).catch(() => null);

            if (evoRes?.ok) {
              const evoData = await evoRes.json().catch(() => null);
              const base64 = evoData?.base64 || evoData?.data;
              if (base64) {
                const bin = atob(base64.replace(/^data:[^;]+;base64,/, ""));
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                buffer = bytes.buffer;
                contentType = evoData?.mimetype || contentType;
              }
            }
          }

          // ESTRATÉGIA 2: tentar a URL direta (pode funcionar se ainda não expirou)
          if (!buffer) {
            const directRes = await fetch(msg.media_url, {
              headers: apiKey ? { apikey: apiKey } : {},
            }).catch(() => null);

            if (directRes?.ok) {
              buffer      = await directRes.arrayBuffer();
              contentType = directRes.headers.get("content-type") || contentType;
            }
          }

          if (!buffer) {
            return new Response("Could not fetch media from Evolution or CDN", { status: 502 });
          }

          return new Response(buffer, {
            status: 200,
            headers: {
              "Content-Type":  contentType,
              "Cache-Control": "private, max-age=3600",
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
