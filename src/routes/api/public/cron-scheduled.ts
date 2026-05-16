/**
 * Cron endpoint: dispara mensagens agendadas cujo horário chegou.
 * Chamado por pg_cron a cada minuto.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/cron-scheduled")({
  server: {
    handlers: {
      GET: async () => runTick(),
      POST: async () => runTick(),
    },
  },
});

async function runTick() {
  const now = new Date().toISOString();
  const { data: pending } = await supabaseAdmin
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .limit(50);

  let sent = 0;
  let failed = 0;

  for (const job of pending ?? []) {
    try {
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id, phone, user_id")
        .eq("id", job.conversation_id)
        .maybeSingle();
      if (!conv) {
        await supabaseAdmin
          .from("scheduled_messages")
          .update({ status: "failed", error: "conversation not found" })
          .eq("id", job.id);
        failed++;
        continue;
      }

      const { data: inst } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("api_url, api_key, instance_name, status")
        .eq("user_id", job.user_id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      // Insere no histórico
      await supabaseAdmin.from("messages").insert({
        user_id: job.user_id,
        conversation_id: job.conversation_id,
        direction: "outbound",
        content: job.content,
        status: "sent",
      });
      await supabaseAdmin
        .from("conversations")
        .update({
          last_message_at: now,
          last_message_preview: job.content.slice(0, 80),
        })
        .eq("id", job.conversation_id);

      // Envia via WhatsApp
      if (inst?.api_url && inst?.api_key && conv.phone) {
        await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: inst.api_key },
          body: JSON.stringify({ number: conv.phone, text: job.content }),
        }).catch(() => {});
      }

      await supabaseAdmin
        .from("scheduled_messages")
        .update({ status: "sent", sent_at: now })
        .eq("id", job.id);
      sent++;
    } catch (e: any) {
      await supabaseAdmin
        .from("scheduled_messages")
        .update({ status: "failed", error: e.message ?? "unknown" })
        .eq("id", job.id);
      failed++;
    }
  }

  return Response.json({ ok: true, sent, failed, total: (pending ?? []).length });
}
