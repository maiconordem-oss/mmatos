/**
 * Cron endpoint: reativação contextual de leads com prazo próximo (3 dias antes).
 * Chamado por pg_cron todo dia às 9h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/server/security.server";
import { sendEvolutionText } from "@/server/whatsapp.functions";

export const Route = createFileRoute("/api/public/cron-reactivation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        requireCronSecret(request);
        return runReactivation();
      },
      POST: async ({ request }) => {
        requireCronSecret(request);
        return runReactivation();
      },
    },
  },
});

async function runReactivation() {
  const now = new Date();
  const nowTs = now.toISOString();
  let sent = 0;
  let failed = 0;

  // Prazo mencionado está entre 2 e 4 dias à frente (janela de 3 dias antes)
  const windowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("id, user_id, phone, instance_id, deadline_context")
    .not("deadline_mentioned_at", "is", null)
    .neq("ticket_status", "resolved")
    .gte("deadline_mentioned_at", windowStart)
    .lte("deadline_mentioned_at", windowEnd)
    .limit(50);

  for (const conv of convs ?? []) {
    try {
      const contextSnippet = conv.deadline_context
        ? `sobre "${conv.deadline_context}"`
        : "sobre um prazo importante";

      const text = `Olá! Vi que você mencionou ${contextSnippet}. O prazo está se aproximando — ainda posso ajudar a tempo. Quer dar andamento ao seu caso?`;

      const inst = conv.instance_id
        ? await supabaseAdmin
            .from("whatsapp_instances")
            .select("api_url, api_key, instance_name")
            .eq("id", conv.instance_id)
            .eq("status", "connected")
            .maybeSingle()
            .then((r) => r.data)
        : await supabaseAdmin
            .from("whatsapp_instances")
            .select("api_url, api_key, instance_name")
            .eq("user_id", conv.user_id)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle()
            .then((r) => r.data);

      const { data: msg } = await supabaseAdmin
        .from("messages")
        .insert({ user_id: conv.user_id, conversation_id: conv.id, direction: "outbound", content: text, status: "pending" })
        .select("id")
        .single();

      await supabaseAdmin.from("conversations").update({
        last_message_at: nowTs,
        last_message_preview: text.slice(0, 80),
      }).eq("id", conv.id);

      if (inst?.api_url && conv.phone) {
        try {
          const externalId = await sendEvolutionText(inst.api_url, inst.api_key ?? "", inst.instance_name, conv.phone as string, text);
          if (msg?.id) await supabaseAdmin.from("messages").update({ status: "sent", external_id: externalId }).eq("id", msg.id);
        } catch {
          if (msg?.id) await supabaseAdmin.from("messages").update({ status: "failed" }).eq("id", msg.id);
        }
      }

      sent++;
    } catch {
      failed++;
    }
  }

  return Response.json({ ok: true, sent, failed });
}
