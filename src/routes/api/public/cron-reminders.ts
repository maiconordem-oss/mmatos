/**
 * Cron endpoint: envia lembretes de consulta D-1 (23-25h antes) e D-0 (2h antes).
 * Chamado por pg_cron a cada 30 minutos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/server/security.server";
import { sendEvolutionText } from "@/server/whatsapp.functions";

export const Route = createFileRoute("/api/public/cron-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        requireCronSecret(request);
        return runReminders();
      },
      POST: async ({ request }) => {
        requireCronSecret(request);
        return runReminders();
      },
    },
  },
});

async function sendReminderMessage(
  userId: string,
  conversationId: string,
  phone: string,
  instanceId: string | null,
  text: string,
) {
  const now = new Date().toISOString();

  const inst = instanceId
    ? await supabaseAdmin
        .from("whatsapp_instances")
        .select("api_url, api_key, instance_name, status")
        .eq("id", instanceId)
        .eq("status", "connected")
        .maybeSingle()
        .then((r) => r.data)
    : await supabaseAdmin
        .from("whatsapp_instances")
        .select("api_url, api_key, instance_name, status")
        .eq("user_id", userId)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle()
        .then((r) => r.data);

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .insert({ user_id: userId, conversation_id: conversationId, direction: "outbound", content: text, status: "pending" })
    .select("id")
    .single();

  await supabaseAdmin.from("conversations").update({
    last_message_at: now,
    last_message_preview: text.slice(0, 80),
  }).eq("id", conversationId);

  if (inst?.api_url && phone) {
    try {
      const externalId = await sendEvolutionText(inst.api_url, inst.api_key, inst.instance_name, phone, text);
      if (msg?.id) await supabaseAdmin.from("messages").update({ status: "sent", external_id: externalId }).eq("id", msg.id);
    } catch {
      if (msg?.id) await supabaseAdmin.from("messages").update({ status: "failed" }).eq("id", msg.id);
    }
  }
}

async function runReminders() {
  const now = new Date();
  let sent = 0;
  let failed = 0;

  // ── D-1: entre 23h e 25h antes da consulta
  const d1Start = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const d1End   = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const { data: d1Appts } = await supabaseAdmin
    .from("appointments")
    .select("id, user_id, conversation_id, start_at, title")
    .eq("reminder_d1_sent", false)
    .eq("attended", false)
    .neq("status", "cancelado")
    .gte("start_at", d1Start)
    .lte("start_at", d1End);

  for (const appt of d1Appts ?? []) {
    try {
      if (!appt.conversation_id) continue;
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id, phone, instance_id")
        .eq("id", appt.conversation_id)
        .maybeSingle();
      if (!conv?.phone) continue;

      const apptDate = new Date(appt.start_at);
      const dateStr = apptDate.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });
      const text = `🗓️ Lembrete: sua consulta está marcada para amanhã, *${dateStr}*. Por favor, confirme sua presença respondendo esta mensagem!`;

      await sendReminderMessage(appt.user_id, appt.conversation_id, conv.phone, conv.instance_id, text);
      await supabaseAdmin.from("appointments").update({ reminder_d1_sent: true }).eq("id", appt.id);
      sent++;
    } catch {
      failed++;
    }
  }

  // ── D-0: entre 1h50m e 2h10m antes da consulta
  const d0Start = new Date(now.getTime() + 110 * 60 * 1000).toISOString();
  const d0End   = new Date(now.getTime() + 130 * 60 * 1000).toISOString();

  const { data: d0Appts } = await supabaseAdmin
    .from("appointments")
    .select("id, user_id, conversation_id, start_at, title")
    .eq("reminder_d0_sent", false)
    .eq("attended", false)
    .neq("status", "cancelado")
    .gte("start_at", d0Start)
    .lte("start_at", d0End);

  for (const appt of d0Appts ?? []) {
    try {
      if (!appt.conversation_id) continue;
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id, phone, instance_id")
        .eq("id", appt.conversation_id)
        .maybeSingle();
      if (!conv?.phone) continue;

      const apptDate = new Date(appt.start_at);
      const timeStr = apptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const text = `⏰ Lembrete: sua consulta começa em *2 horas* (às ${timeStr})! Qualquer imprevisto, é só me avisar.`;

      await sendReminderMessage(appt.user_id, appt.conversation_id, conv.phone, conv.instance_id, text);
      await supabaseAdmin.from("appointments").update({ reminder_d0_sent: true }).eq("id", appt.id);
      sent++;
    } catch {
      failed++;
    }
  }

  return Response.json({ ok: true, sent, failed });
}
