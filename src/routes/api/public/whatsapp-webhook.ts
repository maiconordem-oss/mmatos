import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleFunnelMessage } from "@/server/funnel-executor.server";

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url    = new URL(request.url);
        const id     = url.searchParams.get("id");
        const secret = url.searchParams.get("secret");
        if (!id || !secret) return new Response("missing params", { status: 400 });

        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances").select("*").eq("id", id).single();

        if (!inst || inst.webhook_secret !== secret)
          return new Response("invalid", { status: 401 });

        const body  = await request.json().catch(() => ({}));
        const event = body?.event || body?.type;
        const data  = body?.data || body;

        // ── Connection update ──────────────────────────────────
        if (event === "connection.update" || event === "CONNECTION_UPDATE") {
          const state  = data?.state;
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          await supabaseAdmin.from("whatsapp_instances").update({
            status,
            phone_number:  data?.wuid?.split("@")[0] || inst.phone_number,
            qr_code:       status === "connected" ? null : inst.qr_code,
            last_event_at: new Date().toISOString(),
          }).eq("id", inst.id);
        }

        // ── QR Code ────────────────────────────────────────────
        if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
          const qr = data?.qrcode?.base64 || data?.base64;
          if (qr) {
            await supabaseAdmin.from("whatsapp_instances").update({
              status: "qr", qr_code: qr, last_event_at: new Date().toISOString(),
            }).eq("id", inst.id);
          }
        }

        // ── Mensagem recebida ──────────────────────────────────
        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
          const msg      = Array.isArray(data?.messages) ? data.messages[0] : data;
          const fromMe   = msg?.key?.fromMe;
          const remoteJid: string = msg?.key?.remoteJid || "";
          const phone    = remoteJid.split("@")[0];
          if (!phone || fromMe) return Response.json({ ok: true });

          const msgContent = msg?.message ?? {};

          // ── Extrair texto ──────────────────────────────────
          const text =
            msgContent.conversation ||
            msgContent.extendedTextMessage?.text ||
            msgContent.ephemeralMessage?.message?.extendedTextMessage?.text ||
            msg?.text || "";

          // ── Detectar mídia ─────────────────────────────────
          // audio: audioMessage | pttMessage (push-to-talk)
          const audioMsg    = msgContent.audioMessage    || msgContent.pttMessage;
          // imagem
          const imageMsg    = msgContent.imageMessage;
          // documento (PDF, etc)
          const documentMsg = msgContent.documentMessage || msgContent.documentWithCaptionMessage?.message?.documentMessage;
          // vídeo
          const videoMsg    = msgContent.videoMessage;

          const hasMedia = !!(audioMsg || imageMsg || documentMsg || videoMsg);
          const hasText  = !!text.trim();

          if (!hasText && !hasMedia) return Response.json({ ok: true });

          // ── Encontrar ou criar conversa ────────────────────
          let { data: conv } = await supabaseAdmin
            .from("conversations").select("*")
            .eq("user_id", inst.user_id).eq("phone", phone).maybeSingle();

          const preview = hasText ? text.slice(0, 80)
            : audioMsg   ? "🎤 Áudio"
            : imageMsg   ? "📷 Imagem"
            : documentMsg? "📄 Documento"
            : videoMsg   ? "🎥 Vídeo"
            : "Mídia recebida";

          if (!conv) {
            const { data: created } = await supabaseAdmin.from("conversations").insert({
              user_id: inst.user_id, phone, status: "open",
              contact_name: null,
              last_message_at:      new Date().toISOString(),
              last_message_preview: preview,
            }).select().single();
            conv = created;
          } else {
            await supabaseAdmin.from("conversations").update({
              last_message_at:      new Date().toISOString(),
              last_message_preview: preview,
              unread_count: (conv.unread_count || 0) + 1,
            }).eq("id", conv.id);
          }

          if (!conv) return Response.json({ ok: true });

          // ── Salvar mensagem ────────────────────────────────
          const mediaType = audioMsg ? "audio" : imageMsg ? "image" : documentMsg ? "document" : videoMsg ? "video" : null;
          const mediaUrl  = audioMsg?.url    || imageMsg?.url    || documentMsg?.url    || videoMsg?.url    || null;
          const mediaMime = audioMsg?.mimetype || imageMsg?.mimetype || documentMsg?.mimetype || videoMsg?.mimetype || null;
          const mediaId   = audioMsg?.mediaKey || imageMsg?.mediaKey || documentMsg?.mediaKey || videoMsg?.mediaKey || null;

          await supabaseAdmin.from("messages").insert({
            user_id:         inst.user_id,
            conversation_id: conv.id,
            direction:       "inbound",
            content:         hasText ? text : preview,
            media_url:       mediaUrl,
            media_type:      mediaType,
            media_mime:      mediaMime,
            external_id:     msg?.key?.id || null,
            status:          "sent",
          });

          // ── Processar mídia recebida ───────────────────────
          if (hasMedia) {
            await processInboundMedia({
              admin:          supabaseAdmin,
              userId:         inst.user_id,
              convId:         conv.id,
              mediaType:      mediaType!,
              mediaUrl,
              mediaMime,
              mediaId,
              caption:        imageMsg?.caption || documentMsg?.caption || videoMsg?.caption || "",
              fileName:       documentMsg?.fileName || null,
              instApiUrl:     inst.api_url,
              instApiKey:     inst.api_key,
              instName:       inst.instance_name,
              msgId:          msg?.key?.id || null,
              transcription:  audioTranscription,
            });
          }

          // ── Transcrever áudio via IA ───────────────────────
          let audioTranscription: string | null = null;
          if (audioMsg) {
            const audioUrl = audioMsg.url ?? null;
            if (audioUrl) {
              audioTranscription = await transcribeAudio(audioUrl, audioMsg.mimetype ?? "audio/ogg");
              // Atualizar mensagem salva com transcrição
              if (audioTranscription) {
                await supabaseAdmin.from("messages")
                  .update({ content: `🎤 Áudio: "${audioTranscription}"` })
                  .eq("external_id", msg?.key?.id || "")
                  .eq("conversation_id", conv.id);
              }
            }
          }

          // ── Executor do funil ──────────────────────────────
          const messageForAI = hasText
            ? text
            : audioMsg
              ? audioTranscription
                ? `[Cliente enviou áudio. Transcrição: "${audioTranscription}". Responda com base no conteúdo do áudio, mas como se fosse uma mensagem de texto normal — sem mencionar que é áudio.]`
                : "[O cliente enviou um áudio mas não consegui transcrever. Peça para digitar: 'Pode digitar aqui pra eu registrar certinho?']"
              : imageMsg
                ? `[O cliente enviou uma imagem${imageMsg?.caption ? `: "${imageMsg.caption}"` : ""}. Confirme o recebimento e continue o fluxo.]`
                : `[O cliente enviou um documento${documentMsg?.fileName ? ` (${documentMsg.fileName})` : ""}. Confirme o recebimento e continue o fluxo.]`;

          try {
            await handleFunnelMessage(supabaseAdmin, inst.user_id, conv.id, messageForAI);
          } catch (e) {
            console.error("funnel executor error:", e);
          }
        }

        return Response.json({ ok: true });
      },

      GET: async () => Response.json({ ok: true }),
    },
  },
});

// ── Transcrever áudio via Gemini ─────────────────────────────
async function transcribeAudio(audioUrl: string, mimetype: string): Promise<string | null> {
  try {
    const apiKey = process.env.LOVABLE_API_KEY ?? "lovable-internal";

    // Baixar o áudio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return null;
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    // Chamar Gemini com áudio em base64
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: base64Audio, format: mimetype.includes("mp4") ? "mp4" : "wav" },
              },
              {
                type: "text",
                text: "Transcreva exatamente o que foi dito neste áudio em português. Retorne apenas a transcrição, sem nenhum texto adicional.",
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const transcription = data.choices?.[0]?.message?.content?.trim() ?? null;
    return transcription || null;
  } catch (e) {
    console.error("transcribeAudio error:", e);
    return null;
  }
}

// ── Processar mídia: salvar como documento do cliente ────────
async function processInboundMedia(opts: {
  admin: any; userId: string; convId: string;
  mediaType: string; mediaUrl: string | null; mediaMime: string | null;
  mediaId: string | null; caption: string; fileName: string | null;
  instApiUrl: string; instApiKey: string; instName: string;
  msgId: string | null; transcription?: string | null;
}) {
  const { admin, userId, convId, mediaType, mediaUrl, mediaMime, caption, fileName, msgId, transcription } = opts;

  try {
    // Buscar client_id da conversa
    const { data: conv } = await admin.from("conversations").select("client_id").eq("id", convId).single();
    const clientId = conv?.client_id ?? null;

    // Detectar tipo de documento pelo contexto
    const captionLower = (caption + " " + (fileName ?? "")).toLowerCase();
    const docType =
      captionLower.includes("rg") || captionLower.includes("identidade") ? "rg"
      : captionLower.includes("cpf")                                     ? "cpf"
      : captionLower.includes("certidão") || captionLower.includes("nascimento") ? "certidao_nascimento"
      : captionLower.includes("comprovante") || captionLower.includes("residência") ? "comprovante_residencia"
      : captionLower.includes("protocolo") || captionLower.includes("negativa") ? "protocolo"
      : captionLower.includes("receita") || captionLower.includes("prescrição") ? "prescricao"
      : captionLower.includes("pdf")  ? "documento"
      : mediaType === "audio"         ? "audio"
      : mediaType === "image"         ? "imagem"
      : "outro";

    const label =
      docType === "rg"                   ? "RG / CNH"
      : docType === "cpf"                ? "CPF"
      : docType === "certidao_nascimento"? "Certidão de Nascimento"
      : docType === "comprovante_residencia" ? "Comprovante de Residência"
      : docType === "protocolo"          ? "Protocolo / Negativa"
      : docType === "prescricao"         ? "Prescrição Médica"
      : docType === "audio"              ? "Áudio do cliente"
      : fileName                         ? fileName
      : caption                          ? caption
      : `${mediaType} recebido`;

    // Salvar documento vinculado ao cliente
    if (mediaUrl || msgId) {
      await admin.from("client_documents").insert({
        user_id:           userId,
        client_id:         clientId,
        conversation_id:   convId,
        doc_type:          docType,
        label,
        file_url:          mediaUrl ?? `whatsapp-media://${msgId}`,
        media_type:        mediaType,
        whatsapp_media_id: msgId,
        transcription:     transcription ?? null,
        notes:             caption || (transcription ? `Transcrição: ${transcription}` : null),
      });
    }
  } catch (e) {
    console.error("processInboundMedia error:", e);
  }
}
