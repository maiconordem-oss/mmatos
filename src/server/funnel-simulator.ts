import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleFunnelMessage } from "@/server/funnel-executor.server";

export const simulateFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token:   z.string().optional(),
    funnel_id: z.string().uuid(),
    message:   z.string().default("oi"),
    phone:     z.string().default("5500000000000"),
  }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { funnel_id, message, phone } = data;

    // 1. Criar (ou reusar) conversa de simulação
    const simPhone = `SIM_${phone}`;

    let { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("phone", simPhone)
      .maybeSingle();

    if (!conv) {
      const { data: created } = await supabaseAdmin
        .from("conversations")
        .insert({
          user_id:      userId,
          phone:        simPhone,
          contact_name: "🧪 Simulação",
          status:       "open",
          last_message_at:      new Date().toISOString(),
          last_message_preview: message,
        })
        .select()
        .single();
      conv = created;
    }

    if (!conv) throw new Error("Falha ao criar conversa de simulação");

    // 2. Salvar mensagem do "cliente simulado"
    await supabaseAdmin.from("messages").insert({
      user_id:         userId,
      conversation_id: conv.id,
      direction:       "inbound",
      content:         message,
      status:          "sent",
    });

    await supabaseAdmin.from("conversations").update({
      last_message_at:      new Date().toISOString(),
      last_message_preview: message,
      unread_count:         1,
    }).eq("id", conv.id);

    // 3. Rodar o executor com o funil específico
    await handleFunnelMessage(supabaseAdmin, userId, conv.id, message, funnel_id);

    return { conversation_id: conv.id, ok: true };
  });

export const resetSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token:   z.string().optional(),
    funnel_id: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Buscar todas as conversas de simulação
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .like("phone", "SIM_%");

    if (convs?.length) {
      const ids = convs.map(c => c.id);
      // Deletar estados e mensagens
      await supabaseAdmin.from("funnel_states").delete().in("conversation_id", ids);
      await supabaseAdmin.from("messages").delete().in("conversation_id", ids);
      await supabaseAdmin.from("conversations").delete().in("id", ids);
    }

    return { ok: true };
  });
