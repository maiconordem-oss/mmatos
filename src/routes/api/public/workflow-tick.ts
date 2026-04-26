import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleFunnelMessage } from "@/server/funnel-executor.server";

export const Route = createFileRoute("/api/public/workflow-tick")({
  server: {
    handlers: {
      GET: async () => {
        const now = new Date().toISOString();

        // Buscar follow-ups vencidos
        const { data: followups } = await supabaseAdmin
          .from("funnel_followups")
          .select("*, funnels(followup_msg, name, persona_prompt)")
          .eq("sent", false)
          .lte("scheduled_at", now)
          .limit(20);

        for (const f of (followups ?? [])) {
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
            await supabaseAdmin.from("messages").insert({
              user_id:         f.user_id,
              conversation_id: f.conversation_id,
              direction:       "outbound",
              content:         followupMsg,
              status:          "pending",
            });
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

            if (conv?.phone && inst?.api_url && inst?.api_key) {
              await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", apikey: inst.api_key },
                body:    JSON.stringify({ number: conv.phone, text: followupMsg }),
              }).catch(() => {});
            }

            // Marcar como enviado
            await supabaseAdmin.from("funnel_followups").update({ sent: true }).eq("id", f.id);
          } catch (e) {
            console.error("followup error:", f.id, e);
          }
        }

        return Response.json({ ok: true, processed: (followups ?? []).length });
      },
    },
  },
});
