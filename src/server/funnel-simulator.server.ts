import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { handleFunnelMessage } from "@/server/funnel-executor.server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const simulateFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token:   z.string().optional(),
    funnel_id: z.string().uuid(),
    message:   z.string().default("oi"),
  }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { funnel_id, message } = data;
    const admin = getAdmin();
    const simPhone = `SIM_${userId.slice(0, 8)}`;

    let { data: conv } = await admin
      .from("conversations").select("*")
      .eq("user_id", userId).eq("phone", simPhone).maybeSingle();

    if (!conv) {
      const { data: created } = await admin.from("conversations").insert({
        user_id: userId, phone: simPhone,
        contact_name: "🧪 Simulação", status: "open",
        last_message_at: new Date().toISOString(),
        last_message_preview: message,
      }).select().single();
      conv = created;
    }
    if (!conv) throw new Error("Falha ao criar conversa de simulação");

    await admin.from("messages").insert({
      user_id: userId, conversation_id: conv.id,
      direction: "inbound", content: message, status: "sent",
    });
    await admin.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message, unread_count: 1,
    }).eq("id", conv.id);

    await handleFunnelMessage(admin as any, userId, conv.id, message, funnel_id);
    return { conversation_id: conv.id, ok: true };
  });

export const resetSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token:   z.string().optional(),
    funnel_id: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const admin = getAdmin();
    const { data: convs } = await admin.from("conversations").select("id")
      .eq("user_id", userId).like("phone", "SIM_%");
    if (convs?.length) {
      const ids = convs.map((c: any) => c.id);
      await admin.from("funnel_states").delete().in("conversation_id", ids);
      await admin.from("messages").delete().in("conversation_id", ids);
      await admin.from("conversations").delete().in("id", ids);
    }
    return { ok: true };
  });
