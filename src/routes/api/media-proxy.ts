import { createFileRoute } from "@tanstack/react-router";
import { createServiceClient, requireUserFromRequest } from "@/server/security.server";

const WHATSAPP_BUCKET = "whatsapp-media";

function storagePathFromUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("whatsapp-media://")) {
    return value.slice("whatsapp-media://".length).replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(value);
    const publicPrefix = `/storage/v1/object/public/${WHATSAPP_BUCKET}/`;
    const signedPrefix = `/storage/v1/object/sign/${WHATSAPP_BUCKET}/`;
    if (parsed.pathname.startsWith(publicPrefix)) {
      return decodeURIComponent(parsed.pathname.slice(publicPrefix.length));
    }
    if (parsed.pathname.startsWith(signedPrefix)) {
      return decodeURIComponent(parsed.pathname.slice(signedPrefix.length));
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchEvolutionMedia(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  externalId: string;
  fallbackMime?: string | null;
  convertToMp4?: boolean;
}) {
  const evoRes = await fetch(`${params.apiUrl}/chat/getBase64FromMediaMessage/${params.instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: params.apiKey },
    body: JSON.stringify({ message: { key: { id: params.externalId } }, convertToMp4: !!params.convertToMp4 }),
  }).catch(() => null);

  if (!evoRes?.ok) return null;

  const evoData = await evoRes.json().catch(() => null);
  const rawBase64 = evoData?.base64 || evoData?.data;
  if (!rawBase64) return null;

  const value = String(rawBase64);
  const dataMime = value.match(/^data:([^;]+);base64,/)?.[1];
  const clean = value.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const contentType = evoData?.mimetype || dataMime || (params.convertToMp4 ? "audio/mp4" : params.fallbackMime) || "application/octet-stream";
  return new Response(bytes.buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}

export const Route = createFileRoute("/api/media-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const msgId = url.searchParams.get("msg");
        const docId = url.searchParams.get("doc");
        const token = url.searchParams.get("token");
        const wantsPlayable = url.searchParams.get("playable") === "1";

        if (!msgId && !docId) return new Response("Missing msg or doc param", { status: 400 });
        const authRequest = token
          ? new Request(request.url, { headers: { Authorization: `Bearer ${token}` } })
          : request;
        const { userId } = await requireUserFromRequest(authRequest);

        const admin = createServiceClient();
        if (docId) {
          const { data: doc } = await admin
            .from("client_documents")
            .select("file_url, user_id")
            .eq("id", docId)
            .single();

          if (!doc?.file_url) return new Response("Document not found", { status: 404 });
          if (doc.user_id !== userId) return new Response("Forbidden", { status: 403 });

          const storagePath = storagePathFromUrl(doc.file_url);
          if (storagePath) {
            const { data, error } = await admin.storage
              .from(WHATSAPP_BUCKET)
              .createSignedUrl(storagePath, 300);
            if (error || !data?.signedUrl) return new Response("Media unavailable", { status: 404 });
            return Response.redirect(data.signedUrl, 302);
          }

          return Response.redirect(doc.file_url, 302);
        }

        const { data: msg } = await admin
          .from("messages")
          .select("media_url, media_type, media_mime, external_id, conversation_id, user_id")
          .eq("id", msgId)
          .single();

        if (!msg?.media_url) return new Response("Media not found", { status: 404 });
        if (msg.user_id !== userId) return new Response("Forbidden", { status: 403 });

        const { data: conv } = await admin
          .from("conversations").select("instance_id").eq("id", msg.conversation_id).single();

        let apiKey = "", apiUrl = "", instanceName = "";
        if (conv?.instance_id) {
          const { data: inst } = await admin
            .from("whatsapp_instances").select("api_key, api_url, instance_name").eq("id", conv.instance_id).single();
          apiKey = inst?.api_key ?? "";
          apiUrl = inst?.api_url?.replace(/\/$/, "") ?? "";
          instanceName = inst?.instance_name ?? "";
        }

        if (wantsPlayable && msg.media_type === "audio" && apiUrl && apiKey && instanceName && msg.external_id) {
          const playable = await fetchEvolutionMedia({
            apiUrl,
            apiKey,
            instanceName,
            externalId: msg.external_id,
            fallbackMime: msg.media_mime,
            convertToMp4: true,
          });
          if (playable) return playable;
        }

        const storagePath = storagePathFromUrl(msg.media_url as string);
        if (storagePath) {
          const { data, error } = await admin.storage
            .from(WHATSAPP_BUCKET)
            .createSignedUrl(storagePath, 300);
          if (error || !data?.signedUrl) return new Response("Media unavailable", { status: 404 });
          return Response.redirect(data.signedUrl, 302);
        }

        if (msg.media_url.startsWith("http://") || msg.media_url.startsWith("https://")) {
          return Response.redirect(msg.media_url, 302);
        }

        // Buscar instância
        try {
          // Tentar Evolution API getBase64
          if (apiUrl && apiKey && instanceName && msg.external_id) {
            const evoRes = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: apiKey },
              body: JSON.stringify({ message: { key: { id: msg.external_id } }, convertToMp4: false }),
            }).catch(() => null);

            if (evoRes?.ok) {
              const evoData = await evoRes.json().catch(() => null);
              const base64 = evoData?.base64 || evoData?.data;
              if (base64) {
                const clean = base64.replace(/^data:[^;]+;base64,/, "");
                const bin   = atob(clean);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const contentType = evoData?.mimetype || msg.media_mime || "application/octet-stream";
                return new Response(bytes.buffer, {
                  status: 200,
                  headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
                });
              }
            }
          }

          return new Response("Media expired or unavailable", { status: 404 });
        } catch (e: any) {
          return new Response(`Proxy error: ${e.message}`, { status: 500 });
        }
      },
    },
  },
});

