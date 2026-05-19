import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/server/security.server";
import { sendEvolutionText } from "@/server/whatsapp.functions";

export const Route = createFileRoute("/api/public/workflow-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        requireCronSecret(request);
        const now = new Date().toISOString();

        // Buscar follow-ups vencidos
        const { data: followups } = await supabaseAdmin
          .from("funnel_followups")
          .select("*, funnels(followup_msg, name, persona_prompt)")
          .eq("sent", false)
          .lte("scheduled_at", now)
          .limit(20);

        for (const f of (followups ?? [])) {
          let messageId: string | null = null;
          try {
            // Buscar dados da conversa para personalizar
            const { data: stateData } = await supabaseAdmin
              .from("funnel_states")
              .select("dados, fase")
              .eq("conversation_id", f.conversation_id)
              .maybeSingle();

            const dados = (stateData?.dados ?? {}) as Record<string, any>;
            const fase  = stateData?.fase ?? "triagem";

            // Não reativar se já encerrou
            if (fase === "encerrado") {
              await supabaseAdmin.from("funnel_followups").update({ sent: true }).eq("id", f.id);
              continue;
            }

            // Mensagem de follow-up personalizada
            const nomeCliente = dados.nome ?? "você";
            const nomeCrianca = dados.nomeCrianca ? ` de ${dados.nomeCrianca}` : "";
            const funnelName  = (f.funnels as any)?.name ?? "";

            const followupMsg = (f.funnels as any)?.followup_msg
              ?? (nomeCrianca
                ? `Olá, ${nomeCliente}! Queria saber se você conseguiu dar continuidade ao caso${nomeCrianca}. Ainda posso ajudar — é só me responder aqui.`
                : `Olá! Tudo bem? Vi que ficamos de continuar nossa conversa. Ainda posso te ajudar — é só me responder aqui.`);

            // Enviar como mensagem do sistema (sem chamar IA)
            const { data: msg } = await supabaseAdmin.from("messages").insert({
              user_id:         f.user_id,
              conversation_id: f.conversation_id,
              direction:       "outbound",
              content:         followupMsg,
              status:          "pending",
            }).select("id").single();
            messageId = msg?.id ?? null;
            await supabaseAdmin.from("conversations").update({
              last_message_at:      now,
              last_message_preview: followupMsg.slice(0, 80),
            }).eq("id", f.conversation_id);

            // Enviar via WhatsApp
            const { data: conv } = await supabaseAdmin
              .from("conversations").select("phone").eq("id", f.conversation_id).single();
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("*").eq("user_id", f.user_id).eq("status", "connected").limit(1).maybeSingle();

            if (!conv?.phone || !inst?.api_url || !inst?.api_key) {
              throw new Error("no connected WhatsApp instance");
            }
            const externalId = await sendEvolutionText(inst.api_url, inst.api_key, inst.instance_name, conv.phone, followupMsg);
            if (msg?.id) {
              await supabaseAdmin.from("messages").update({
                status: "sent",
                external_id: externalId,
              }).eq("id", msg.id);
            }

            // Marcar como enviado
            await supabaseAdmin.from("funnel_followups").update({ sent: true }).eq("id", f.id);
          } catch (e) {
            if (messageId) {
              await supabaseAdmin.from("messages").update({ status: "failed" }).eq("id", messageId);
            }
            console.error("followup error:", f.id, e);
          }
        }

        return Response.json({ ok: true, processed: (followups ?? []).length });
      },
    },
  },
});
