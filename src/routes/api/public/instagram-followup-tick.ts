import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/server/security.server";
import { sendEvolutionText } from "@/server/whatsapp.functions";

export const Route = createFileRoute("/api/public/instagram-followup-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        requireCronSecret(request);

        if (!isBusinessTime(new Date())) {
          return Response.json({ ok: true, skipped: "outside_business_hours" });
        }

        const now = new Date().toISOString();
        const { data: due, error } = await (supabaseAdmin as any)
          .from("instagram_lead_submissions")
          .select("id, magnet_id, user_id, instance_id, name, phone, keyword, conversation_id, followup_scheduled_at")
          .eq("status", "sent")
          .eq("followup_status", "pending")
          .lte("followup_scheduled_at", now)
          .order("followup_scheduled_at", { ascending: true })
          .limit(25);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let sent = 0;
        let failed = 0;

        for (const lead of due ?? []) {
          const claimed = await claimLead(lead.id);
          if (!claimed) continue;

          try {
            const { data: magnet } = await (supabaseAdmin as any)
              .from("instagram_lead_magnets")
              .select("title, slug, followup_message, whatsapp_instances(*)")
              .eq("id", lead.magnet_id)
              .maybeSingle();

            const inst = magnet?.whatsapp_instances;
            if (!magnet?.followup_message?.trim()) throw new Error("Mensagem de follow-up nao configurada.");
            if (!inst?.api_url || !inst?.api_key || !inst?.instance_name) {
              throw new Error("Instancia de WhatsApp nao configurada.");
            }

            const text = interpolate(magnet.followup_message, {
              nome: lead.name ?? "",
              telefone: lead.phone,
              palavra: lead.keyword ?? "",
              landing: magnet.title ?? magnet.slug ?? "",
            });
            const messageId = await sendEvolutionText(inst.api_url, inst.api_key, inst.instance_name, lead.phone, text);

            if (lead.conversation_id) {
              await (supabaseAdmin as any).from("messages").insert({
                user_id: lead.user_id,
                conversation_id: lead.conversation_id,
                direction: "outbound",
                content: text,
                external_id: messageId,
                status: messageId ? "sent" : "pending",
              });

              await (supabaseAdmin as any).from("conversations").update({
                last_message_at: new Date().toISOString(),
                last_message_preview: text.slice(0, 180),
              }).eq("id", lead.conversation_id);
            }

            await (supabaseAdmin as any)
              .from("instagram_lead_submissions")
              .update({
                followup_status: "sent",
                followup_sent_at: new Date().toISOString(),
                followup_error: null,
              })
              .eq("id", lead.id);

            sent += 1;
          } catch (e: any) {
            await (supabaseAdmin as any)
              .from("instagram_lead_submissions")
              .update({
                followup_status: "failed",
                followup_error: e?.message ?? "Falha ao enviar follow-up",
              })
              .eq("id", lead.id);
            failed += 1;
          }
        }

        return Response.json({ ok: true, checked: due?.length ?? 0, sent, failed });
      },
    },
  },
});

async function claimLead(id: string) {
  const { data } = await (supabaseAdmin as any)
    .from("instagram_lead_submissions")
    .update({ followup_status: "processing" })
    .eq("id", id)
    .eq("followup_status", "pending")
    .select("id")
    .maybeSingle();
  return Boolean(data?.id);
}

function interpolate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(nome|telefone|palavra|landing)\s*\}\}/gi, (_, key) => vars[String(key).toLowerCase()] ?? "");
}

function isBusinessTime(date: Date) {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const day = brt.getUTCDay();
  const hour = brt.getUTCHours();
  return day >= 1 && day <= 6 && hour >= 8 && hour < 18;
}
