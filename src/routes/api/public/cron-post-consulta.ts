/**
 * Cron endpoint: envia follow-ups pós-consulta D+1, D+3, D+7.
 * Chamado por pg_cron todo dia às 8h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/server/security.server";
import { sendEvolutionText } from "@/server/whatsapp.functions";

export const Route = createFileRoute("/api/public/cron-post-consulta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        requireCronSecret(request);
        return runPostConsulta();
      },
      POST: async ({ request }) => {
        requireCronSecret(request);
        return runPostConsulta();
      },
    },
  },
});

const DEFAULT_MESSAGES = {
  d1: "Olá! Espero que nossa consulta tenha sido útil ontem. Conseguiu pensar melhor sobre o caso? Estou à disposição para qualquer dúvida!",
  d3: "Oi! Passaram alguns dias desde nossa conversa. Conseguiu reunir a documentação que conversamos? Posso ajudar com os próximos passos.",
  d7: "Olá! Quero retomar nosso contato. Sei que decisões jurídicas pedem reflexão — mas quero garantir que você tenha todo o suporte necessário. Ainda posso ajudar?",
};

async function runPostConsulta() {
  const now = new Date();
  const nowTs = now.toISOString();
  let sent = 0;
  let failed = 0;

  // D+1: consulta_at <= 23h atrás E stage ainda NULL
  const d1Cutoff = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
  // D+3: consulta_at <= 71h atrás E stage = 'd1_sent'
  const d3Cutoff = new Date(now.getTime() - 71 * 60 * 60 * 1000).toISOString();
  // D+7: consulta_at <= 167h atrás E stage = 'd3_sent'
  const d7Cutoff = new Date(now.getTime() - 167 * 60 * 60 * 1000).toISOString();

  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("id, user_id, phone, instance_id, consulta_at, post_consulta_stage")
    .not("consulta_at", "is", null)
    .neq("ticket_status", "resolved")
    .or(
      `and(post_consulta_stage.is.null,consulta_at.lte.${d1Cutoff}),` +
      `and(post_consulta_stage.eq.d1_sent,consulta_at.lte.${d3Cutoff}),` +
      `and(post_consulta_stage.eq.d3_sent,consulta_at.lte.${d7Cutoff})`
    )
    .limit(50);

  for (const conv of convs ?? []) {
    try {
      const stage = conv.post_consulta_stage;
      let nextStage: string;
      let defaultMsg: string;

      if (!stage) {
        nextStage = "d1_sent";
        defaultMsg = DEFAULT_MESSAGES.d1;
      } else if (stage === "d1_sent") {
        nextStage = "d3_sent";
        defaultMsg = DEFAULT_MESSAGES.d3;
      } else {
        nextStage = "d7_sent";
        defaultMsg = DEFAULT_MESSAGES.d7;
      }

      // Busca mensagem do funil se disponível
      let text = defaultMsg;
      // Look up funnel via funnel_states
      const { data: fs } = await supabaseAdmin
        .from("funnel_states")
        .select("funnel_id")
        .eq("conversation_id", conv.id)
        .maybeSingle();
      if (fs?.funnel_id) {
        const { data: funnel } = await supabaseAdmin
          .from("funnels")
          .select("post_consulta_d1_msg, post_consulta_d3_msg, post_consulta_d7_msg")
          .eq("id", fs.funnel_id)
          .maybeSingle();
        if (funnel) {
          const msgMap: Record<string, string | null> = {
            d1_sent: funnel.post_consulta_d1_msg,
            d3_sent: funnel.post_consulta_d3_msg,
            d7_sent: funnel.post_consulta_d7_msg,
          };
          text = msgMap[nextStage] || defaultMsg;
        }
      }

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
        post_consulta_stage: nextStage,
      }).eq("id", conv.id);

      if (inst?.api_url && conv.phone) {
        try {
          const externalId = await sendEvolutionText(inst.api_url, inst.api_key, inst.instance_name, conv.phone, text);
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
