import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeBRPhone, phoneVariants } from "@/lib/phone";

export const Route = createFileRoute("/api/public/instagram-lead")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = cleanSlug(url.searchParams.get("slug") ?? "");
        if (!slug) return Response.json({ error: "missing slug" }, { status: 400 });

        const { data: magnet } = await (supabaseAdmin as any)
          .from("instagram_lead_magnets")
          .select("id,title,slug,keyword,description,button_label,success_message,is_active")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (!magnet) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json({ magnet });
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const slug = cleanSlug(String(body.slug ?? ""));
        const rawPhone = String(body.phone ?? "");
        const phone = normalizeBRPhone(rawPhone) || rawPhone.replace(/\D/g, "");
        const name = String(body.name ?? "").trim().slice(0, 120) || null;
        const manychatRef = String(body.ref ?? body.manychat_ref ?? "").trim().slice(0, 160) || null;

        if (!slug) return Response.json({ error: "Link invalido." }, { status: 400 });
        if (phone.length < 10) return Response.json({ error: "Informe um WhatsApp valido." }, { status: 400 });

        const { data: magnet } = await (supabaseAdmin as any)
          .from("instagram_lead_magnets")
          .select("*, whatsapp_instances(*)")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (!magnet) return Response.json({ error: "Pagina indisponivel." }, { status: 404 });

        const inst = magnet.whatsapp_instances;
        const submissionBase = {
          magnet_id: magnet.id,
          user_id: magnet.user_id,
          instance_id: magnet.instance_id,
          name,
          phone,
          keyword: magnet.keyword,
          manychat_ref: manychatRef,
          status: "pending",
          followup_scheduled_at: scheduleLandingFollowup(magnet.followup_enabled, magnet.followup_hours),
          followup_status: magnet.followup_enabled && Number(magnet.followup_hours) > 0 ? "pending" : "disabled",
        };

        const { data: submission } = await (supabaseAdmin as any)
          .from("instagram_lead_submissions")
          .insert(submissionBase)
          .select("id")
          .single();

        try {
          if (!inst?.api_url || !inst?.api_key || !inst?.instance_name) {
            throw new Error("Configure uma instancia de WhatsApp conectada para esta isca.");
          }

          const clientId = await upsertClient(magnet.user_id, phone, name);
          const conversationId = await upsertConversation(magnet.user_id, magnet.instance_id, phone, name, clientId);
          const messageId = await sendLeadMagnetFile({
            apiUrl: inst.api_url,
            apiKey: inst.api_key,
            instanceName: inst.instance_name,
            phone,
            mediaType: magnet.file_type,
            mediaUrl: magnet.file_url,
            fileName: magnet.file_name,
            caption: interpolate(magnet.delivery_message, { nome: name ?? "", telefone: phone, palavra: magnet.keyword ?? "" }),
          });

          await (supabaseAdmin as any).from("messages").insert({
            user_id: magnet.user_id,
            conversation_id: conversationId,
            direction: "outbound",
            content: magnet.delivery_message,
            media_url: magnet.file_url,
            media_type: magnet.file_type,
            external_id: messageId,
            status: messageId ? "sent" : "pending",
          });

          await (supabaseAdmin as any).from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: "Material enviado pelo Instagram",
          }).eq("id", conversationId);

          if (submission?.id) {
            await (supabaseAdmin as any)
              .from("instagram_lead_submissions")
              .update({
                status: "sent",
                conversation_id: conversationId,
                delivery_sent_at: new Date().toISOString(),
                delivery_message_id: messageId,
              })
              .eq("id", submission.id);
          }

          return Response.json({ ok: true, message: magnet.success_message });
        } catch (e: any) {
          if (submission?.id) {
            await (supabaseAdmin as any)
              .from("instagram_lead_submissions")
              .update({ status: "failed", error_message: e?.message ?? "Falha ao enviar" })
              .eq("id", submission.id);
          }
          return Response.json({ error: e?.message ?? "Falha ao enviar o material." }, { status: 500 });
        }
      },
    },
  },
});

function cleanSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function interpolate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(nome|telefone|palavra)\s*\}\}/gi, (_, key) => vars[String(key).toLowerCase()] ?? "");
}

function scheduleLandingFollowup(enabled: boolean, hours: number | null) {
  const delayHours = Number(hours ?? 0);
  if (!enabled || delayHours <= 0) return null;
  const target = new Date(Date.now() + delayHours * 60 * 60 * 1000);
  return nextBusinessTime(target).toISOString();
}

function nextBusinessTime(date: Date) {
  const scheduled = new Date(date);

  for (let guard = 0; guard < 10; guard += 1) {
    const brt = new Date(scheduled.getTime() - 3 * 60 * 60 * 1000);
    const day = brt.getUTCDay();
    const hour = brt.getUTCHours();
    const isBusinessDay = day >= 1 && day <= 6;

    if (!isBusinessDay) {
      scheduled.setUTCDate(scheduled.getUTCDate() + (day === 0 ? 1 : 2));
      setBrtHour(scheduled, 8);
      continue;
    }

    if (hour < 8) {
      setBrtHour(scheduled, 8);
      return scheduled;
    }

    if (hour >= 18) {
      scheduled.setUTCDate(scheduled.getUTCDate() + 1);
      setBrtHour(scheduled, 8);
      continue;
    }

    return scheduled;
  }

  return scheduled;
}

function setBrtHour(date: Date, hour: number) {
  date.setUTCHours(hour + 3, 0, 0, 0);
}

async function upsertClient(userId: string, phone: string, name: string | null) {
  const variants = phoneVariants(phone);
  const { data: existing } = await (supabaseAdmin as any)
    .from("clients")
    .select("id,full_name")
    .eq("user_id", userId)
    .in("whatsapp", variants.length ? variants : [phone])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (name && !existing.full_name) {
      await (supabaseAdmin as any).from("clients").update({ full_name: name }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created } = await (supabaseAdmin as any)
    .from("clients")
    .insert({
      user_id: userId,
      full_name: name || `Lead Instagram ${phone}`,
      phone,
      whatsapp: phone,
      notes: "Lead capturado pela landing do Instagram.",
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

async function upsertConversation(userId: string, instanceId: string | null, phone: string, name: string | null, clientId: string | null) {
  const variants = phoneVariants(phone);
  const { data: existing } = await (supabaseAdmin as any)
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .in("phone", variants.length ? variants : [phone])
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await (supabaseAdmin as any).from("conversations").update({
      phone,
      contact_name: name,
      client_id: clientId,
      instance_id: instanceId,
      status: "open",
    }).eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await (supabaseAdmin as any)
    .from("conversations")
    .insert({
      user_id: userId,
      client_id: clientId,
      instance_id: instanceId,
      phone,
      contact_name: name,
      status: "open",
      last_message_at: new Date().toISOString(),
      last_message_preview: "Lead capturado pelo Instagram",
    })
    .select("id")
    .single();

  return created?.id;
}

async function sendLeadMagnetFile(opts: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  phone: string;
  mediaType: string;
  mediaUrl: string;
  fileName: string | null;
  caption: string;
}) {
  const res = await fetch(`${opts.apiUrl.replace(/\/$/, "")}/message/sendMedia/${opts.instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: opts.apiKey },
    body: JSON.stringify({
      number: normalizeBRPhone(opts.phone) || opts.phone.replace(/\D/g, ""),
      mediatype: opts.mediaType || "document",
      media: opts.mediaUrl,
      fileName: opts.fileName || undefined,
      caption: opts.caption,
    }),
  });

  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!res.ok) throw new Error(`Evolution API: ${typeof data === "string" ? data : JSON.stringify(data)}`);

  return data?.key?.id || data?.message?.key?.id || data?.data?.key?.id || data?.id || null;
}
