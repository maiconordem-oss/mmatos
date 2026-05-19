import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleFunnelMessage } from "@/server/funnel-executor.server";
import { normalizeBRPhone, phoneVariants } from "@/lib/phone";
import { classifyAndPersistSentiment, checkBusinessHours } from "@/server/intelligence.functions";
import { sendEvolutionText, syncInstanceWebhookEvents, buildInstanceWebhookUrl } from "@/server/whatsapp.functions";

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
          // Re-registra eventos do webhook para garantir MESSAGES_UPDATE nas instâncias existentes
          if (status === "connected") {
            const { data: userCreds } = await supabaseAdmin
              .from("user_settings").select("evolution_api_url, evolution_api_key")
              .eq("user_id", inst.user_id).maybeSingle();
            const url = inst.api_url || userCreds?.evolution_api_url || null;
            const key = inst.api_key || userCreds?.evolution_api_key || null;
            if (url && key) {
              const webhookUrl = buildInstanceWebhookUrl(inst.id, inst.webhook_secret);
              syncInstanceWebhookEvents(url, key, inst.instance_name, webhookUrl).catch(() => {});
            }
          }
        }

        // ── Status de leitura ──────────────────────────────────
        if (event === "MESSAGES_UPDATE" || event === "messages.update") {
          const updates = Array.isArray(body.data) ? body.data : [body.data];
          for (const upd of updates) {
            const msgId  = upd?.key?.id;
            const status = upd?.update?.status;
            if (!msgId || !status) continue;
            const updateData: any = {};
            if (status === "DELIVERY_ACK" || status === "DELIVERED") {
              updateData.delivered_at = new Date().toISOString();
              updateData.status = "delivered";
            }
            if (status === "READ" || status === "PLAYED") { updateData.read_at = new Date().toISOString(); updateData.status = "read"; }
            if (Object.keys(updateData).length) {
              await supabaseAdmin.from("messages").update(updateData).eq("external_id", msgId);
            }
          }
          return Response.json({ ok: true, event: "read_status" });
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
          const rawPhone = remoteJid.split("@")[0].replace(/^\+/, "").trim();
          const phone    = normalizeBRPhone(rawPhone) || rawPhone;
          const pushName = msg?.pushName || msg?.key?.participant || null;
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

          // ── Encontrar ou criar conversa (busca por todas variantes do número) ──
          const variants = phoneVariants(phone);
          let { data: conv } = await supabaseAdmin
            .from("conversations").select("*")
            .eq("user_id", inst.user_id)
            .in("phone", variants.length ? variants : [phone])
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          // Se achou mas o phone está em formato antigo, atualiza para o canônico
          if (conv && conv.phone !== phone) {
            await supabaseAdmin.from("conversations")
              .update({ phone }).eq("id", conv.id);
            conv.phone = phone;
          }

          const preview = hasText ? text.slice(0, 80)
            : audioMsg   ? "🎤 Áudio"
            : imageMsg   ? "📷 Imagem"
            : documentMsg? "📄 Documento"
            : videoMsg   ? "🎥 Vídeo"
            : "Mídia recebida";

          if (!conv) {
            // Buscar foto do contato via Evolution API
            let photoUrl: string | null = null;
            try {
              const base = inst.api_url?.replace(/\/$/, "") ?? "";
              const headers = { "Content-Type": "application/json", apikey: inst.api_key ?? "" };
              // Evolution v2 — tentar dois endpoints
              for (const endpoint of [
                `${base}/chat/fetchProfilePictureUrl/${inst.instance_name}`,
                `${base}/misc/profilePicture/${inst.instance_name}`,
              ]) {
                const photoRes = await fetch(endpoint, {
                  method: "POST", headers,
                  body: JSON.stringify({ number: phone }),
                });
                if (photoRes.ok) {
                  const photoData = await photoRes.json();
                  photoUrl = photoData?.profilePictureUrl ?? photoData?.picture ?? photoData?.url ?? null;
                  if (photoUrl) break;
                }
              }
            } catch (e) { console.log("fetchPhoto error:", e); }

            const { data: created } = await supabaseAdmin.from("conversations").insert({
              user_id: inst.user_id, phone, status: "open",
              contact_name: pushName || null, instance_id: inst.id,
              photo_url: photoUrl,
              last_message_at:      new Date().toISOString(),
              last_message_preview: preview,
            }).select().single();
            conv = created;
          } else {
            await supabaseAdmin.from("conversations").update({
              last_message_at:      new Date().toISOString(),
              last_message_preview: preview,
              unread_count: (conv.unread_count || 0) + 1,
              instance_id: conv.instance_id ?? inst.id,
              // Atualizar nome se ainda não tem
              ...(pushName && !conv.contact_name ? { contact_name: pushName } : {}),
              // Se conversa estava resolvida, volta para pendente
              ...(conv.ticket_status === "resolved" ? {
                ticket_status: "pending",
                resolved_at:   null,
                assigned_to:   null,
              } : {}),
            }).eq("id", conv.id);
          }

          if (!conv) return Response.json({ ok: true });

          // ── Salvar mensagem ────────────────────────────────
          const mediaType = audioMsg ? "audio" : imageMsg ? "image" : documentMsg ? "document" : videoMsg ? "video" : null;
          const mediaUrl  = audioMsg?.url    || imageMsg?.url    || documentMsg?.url    || videoMsg?.url    || null;
          const mediaMime = audioMsg?.mimetype || imageMsg?.mimetype || documentMsg?.mimetype || videoMsg?.mimetype || null;
          const mediaId   = audioMsg?.mediaKey || imageMsg?.mediaKey || documentMsg?.mediaKey || videoMsg?.mediaKey || null;
          let audioTranscription: string | null = null;

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

          // ── Transcrever áudio via IA ───────────────────────
          if (audioMsg) {
            const audioUrl = audioMsg.url ?? null;
            if (audioUrl) {
              audioTranscription = await transcribeAudio(
                audioUrl,
                audioMsg.mimetype ?? "audio/ogg",
                inst.api_url ?? "",
                inst.api_key ?? "",
                inst.instance_name ?? "",
                audioMsg.mediaKey ?? null
              );
              if (audioTranscription) {
                await supabaseAdmin.from("messages")
                  .update({ content: `🎤 "${audioTranscription}"` })
                  .eq("external_id", msg?.key?.id ?? "")
                  .eq("conversation_id", conv.id);
              }
            }
          }

          // ── Processar mídia recebida ───────────────────────
          if (hasMedia) {
            // Baixar mídia e salvar permanentemente no Supabase Storage
          const msgKeyId = msg?.key?.id || null;
          let permanentUrl = mediaUrl;
          if (hasMedia && msgKeyId && inst.api_url && inst.api_key) {
            const stored = await downloadAndStoreMedia(
              supabaseAdmin, inst.user_id, msgKeyId,
              inst.api_url, inst.api_key, inst.instance_name, mediaMime
            );
            if (stored) {
              permanentUrl = stored;
              // Atualizar a mensagem com a URL permanente
              await supabaseAdmin.from("messages")
                .update({ media_url: stored })
                .eq("external_id", msgKeyId)
                .eq("conversation_id", conv.id);
            }
          }

          await processInboundMedia({
              admin:          supabaseAdmin,
              userId:         inst.user_id,
              convId:         conv.id,
              mediaType:      mediaType!,
              mediaUrl:       permanentUrl,
              mediaMime,
              mediaId,
              caption:        imageMsg?.caption || documentMsg?.caption || videoMsg?.caption || "",
              fileName:       documentMsg?.fileName || null,
              instApiUrl:     inst.api_url ?? "",
              instApiKey:     inst.api_key ?? "",
              instName:       inst.instance_name,
              msgId:          msgKeyId,
              transcription:  audioTranscription,
            });
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

          // ── Sentimento automático (fire-and-forget) ────────
          const sentimentText = hasText ? text : (audioTranscription ?? "");
          if (sentimentText) {
            classifyAndPersistSentiment(conv.id, inst.user_id, sentimentText).catch(() => {});
          }

          // ── Horário comercial — fora do horário marca follow-up
          const bh = await checkBusinessHours(inst.user_id);
          if (!bh.insideHours) {
            await supabaseAdmin.from("conversations").update({
              follow_up_required: true,
              ai_paused: true,
            }).eq("id", conv.id);
            // Enviar mensagem de ausência (apenas 1x por conversa por fora-de-horário)
            try {
              const { data: lastOut } = await supabaseAdmin
                .from("messages")
                .select("content, created_at")
                .eq("conversation_id", conv.id)
                .eq("direction", "outbound")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const already = lastOut?.content && bh.awayMessage && lastOut.content.includes(bh.awayMessage.slice(0, 30));
              if (!already && bh.awayMessage) {
                const { data: msgRow } = await supabaseAdmin.from("messages").insert({
                  user_id: inst.user_id,
                  conversation_id: conv.id,
                  direction: "outbound",
                  content: bh.awayMessage,
                  status: "pending",
                }).select("id").single();
                // Envia de fato via Evolution API
                const { data: userCreds } = await supabaseAdmin
                  .from("user_settings").select("evolution_api_url, evolution_api_key")
                  .eq("user_id", inst.user_id).maybeSingle();
                const evoUrl = inst.api_url || userCreds?.evolution_api_url || null;
                const evoKey = inst.api_key || userCreds?.evolution_api_key || null;
                if (evoUrl && evoKey && msgRow?.id) {
                  const msgId = await sendEvolutionText(evoUrl, evoKey, inst.instance_name, phone, bh.awayMessage).catch(() => null);
                  await supabaseAdmin.from("messages").update({
                    status: msgId ? "sent" : "failed",
                    external_id: msgId ?? null,
                  }).eq("id", msgRow.id);
                }
              }
            } catch {}
            return Response.json({ ok: true, off_hours: true });
          }

          try {
            // Não processar se contato bloqueado
            if ((conv as any).blocked) {
              return Response.json({ ok: true, blocked: true });
            }
            // Não processar se IA pausada manualmente / por segurança
            if ((conv as any).ai_paused) {
              return Response.json({ ok: true, ai_paused: true });
            }

            if (!inst.is_office) {
              await handleFunnelMessage(supabaseAdmin, inst.user_id, conv.id, messageForAI, inst.funnel_id ?? null);
            }
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

// ── Transcrever áudio via Gemini API ─────────────────────────
async function transcribeAudio(
  audioUrl: string,
  mimetype: string,
  instApiUrl: string,
  instApiKey: string,
  instName: string,
  mediaKey: string | null
): Promise<string | null> {
  try {
    const geminiKey = process.env.GEMINI_API_KEY ?? process.env.LOVABLE_API_KEY ?? null;
    if (!geminiKey || geminiKey === "lovable-internal") {
      // Sem chave Gemini nativa — tentar baixar e converter via gateway
      return await transcribeViaGateway(audioUrl, mimetype, instApiUrl, instApiKey);
    }

    // Baixar áudio (Evolution API às vezes requer apikey)
    const audioRes = await fetch(audioUrl, {
      headers: instApiKey ? { apikey: instApiKey } : {},
    });
    if (!audioRes.ok) return null;

    const audioBuffer = await audioRes.arrayBuffer();
    const bytes       = new Uint8Array(audioBuffer);

    // Converter para base64 em chunks (evita stack overflow)
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      base64 += btoa(String.fromCharCode(...bytes.slice(i, i + chunkSize)));
    }

    // Detectar formato correto
    const fmt = mimetype.includes("ogg") ? "audio/ogg"
      : mimetype.includes("mp4") ? "audio/mp4"
      : mimetype.includes("mpeg") ? "audio/mpeg"
      : mimetype.includes("webm") ? "audio/webm"
      : "audio/ogg";

    // Gemini API nativa — suporta áudio em inlineData
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: fmt, data: base64 } },
              { text: "Transcreva exatamente o que foi dito neste áudio em português. Retorne apenas a transcrição, sem nenhum texto adicional." },
            ],
          }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini transcription error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (e) {
    console.error("transcribeAudio error:", e);
    return null;
  }
}

// Fallback: tentar via gateway OpenAI-compatible
async function transcribeViaGateway(
  audioUrl: string,
  mimetype: string,
  instApiUrl: string,
  instApiKey: string
): Promise<string | null> {
  try {
    const apiKey  = process.env.LOVABLE_API_KEY ?? "lovable-internal";
    const audioRes = await fetch(audioUrl, {
      headers: instApiKey ? { apikey: instApiKey } : {},
    });
    if (!audioRes.ok) return null;

    const bytes = new Uint8Array(await audioRes.arrayBuffer());
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      base64 += btoa(String.fromCharCode(...bytes.slice(i, i + chunkSize)));
    }

    const fmt = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "mp4" : "wav";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "user",
          content: [
            { type: "input_audio", input_audio: { data: base64, format: fmt } },
            { type: "text", text: "Transcreva o áudio em português. Retorne apenas a transcrição." },
          ],
        }],
        max_tokens: 500,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

// ── Processar mídia: salvar como documento do cliente ────────

// ── Baixar mídia da Evolution e salvar no Supabase Storage ─────
async function downloadAndStoreMedia(
  admin: any,
  userId: string,
  msgId: string,
  instApiUrl: string,
  instApiKey: string,
  instName: string,
  mediaMime: string | null
): Promise<string | null> {
  if (!instApiUrl || !instApiKey || !instName || !msgId) return null;
  try {
    // Pegar base64 via Evolution API
    const res = await fetch(
      `${instApiUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instName}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instApiKey },
        body: JSON.stringify({ message: { key: { id: msgId } }, convertToMp4: false }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const base64 = data?.base64 || data?.data;
    if (!base64) return null;

    // Converter base64 para bytes
    const clean = base64.replace(/^data:[^;]+;base64,/, "");
    const bin   = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const mime = data?.mimetype || mediaMime || "application/octet-stream";
    const ext  = mime.split("/")[1]?.split(";")[0] || "bin";
    const path = `${userId}/media/${msgId}.${ext}`;

    // Upload para Supabase Storage
    const { data: up, error } = await admin.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: mime, upsert: true });

    if (error) {
      console.error("Storage upload error:", error.message);
      return null;
    }

    // URL pública (bucket público) ou signed URL (bucket privado)
    const { data: urlData } = admin.storage
      .from("whatsapp-media")
      .getPublicUrl(path);

    return urlData?.publicUrl ?? null;
  } catch (e: any) {
    console.error("downloadAndStoreMedia error:", e.message);
    return null;
  }
}

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
