import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onInboundMessage } from "@/server/workflow-executor.server";

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const secret = url.searchParams.get("secret");
        if (!id || !secret) return new Response("missing params", { status: 400 });

        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("*")
          .eq("id", id)
          .single();

        if (!inst || inst.webhook_secret !== secret) {
          return new Response("invalid", { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const event = body?.event || body?.type;
        const data = body?.data || body;

        // Connection update
        if (event === "connection.update" || event === "CONNECTION_UPDATE") {
          const state = data?.state;
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          await supabaseAdmin.from("whatsapp_instances").update({
            status,
            phone_number: data?.wuid?.split("@")[0] || inst.phone_number,
            qr_code: status === "connected" ? null : inst.qr_code,
            last_event_at: new Date().toISOString(),
          }).eq("id", inst.id);
        }

        // QR code update
        if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
          const qr = data?.qrcode?.base64 || data?.base64;
          if (qr) {
            await supabaseAdmin.from("whatsapp_instances").update({
              status: "qr", qr_code: qr, last_event_at: new Date().toISOString(),
            }).eq("id", inst.id);
          }
        }

        // Inbound message
        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
          const msg = Array.isArray(data?.messages) ? data.messages[0] : data;
          const fromMe = msg?.key?.fromMe;
          const remoteJid: string = msg?.key?.remoteJid || "";
          const phone = remoteJid.split("@")[0];
          const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || msg?.text || "";

          if (phone && text && !fromMe) {
            // Find or create conversation
            let { data: conv } = await supabaseAdmin
              .from("conversations").select("*")
              .eq("user_id", inst.user_id).eq("phone", phone).maybeSingle();

            if (!conv) {
              const { data: created } = await supabaseAdmin.from("conversations").insert({
                user_id: inst.user_id, phone, status: "open",
                last_message_at: new Date().toISOString(),
                last_message_preview: text.slice(0, 80),
              }).select().single();
              conv = created;
            } else {
              await supabaseAdmin.from("conversations").update({
                last_message_at: new Date().toISOString(),
                last_message_preview: text.slice(0, 80),
                unread_count: (conv.unread_count || 0) + 1,
              }).eq("id", conv.id);
            }

            if (conv) {
              await supabaseAdmin.from("messages").insert({
                user_id: inst.user_id,
                conversation_id: conv.id,
                direction: "inbound",
                content: text,
                external_id: msg?.key?.id || null,
                status: "sent",
              });

              // Trigger workflow engine (auto-start on first contact, resume if paused)
              try {
                await onInboundMessage(supabaseAdmin, inst.user_id, conv.id, text);
              } catch (e) {
                console.error("workflow executor error:", e);
              }
            }
          }
        }

        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true }),
    },
  },
});
