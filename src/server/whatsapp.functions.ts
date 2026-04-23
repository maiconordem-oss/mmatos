import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Evolution API helper
async function evo(url: string, key: string, path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: any) {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Evolution ${path} [${res.status}]: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

function publicWebhookUrl(instanceId: string, secret: string) {
  const base = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
  return `${base.replace(/\/$/, "")}/api/public/whatsapp-webhook?id=${instanceId}&secret=${secret}`;
}

export const upsertInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    instance_name: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/),
    api_url: z.string().url(),
    api_key: z.string().min(1),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("whatsapp_instances")
      .upsert({ user_id: userId, instance_name: data.instance_name, api_url: data.api_url, api_key: data.api_key }, { onConflict: "user_id,instance_name" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { instance: row };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst, error } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (error || !inst) throw new Error("Instância não encontrada");
    if (!inst.api_url || !inst.api_key) throw new Error("Configure URL e API key primeiro");

    // Try create instance (idempotent — Evolution returns 409 if exists)
    try {
      await evo(inst.api_url, inst.api_key, "/instance/create", "POST", {
        instanceName: inst.instance_name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: publicWebhookUrl(inst.id, inst.webhook_secret),
        webhook_by_events: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      });
    } catch (e) { /* ignore exists */ }

    // Fetch QR
    const qr = await evo(inst.api_url, inst.api_key, `/instance/connect/${inst.instance_name}`);
    const qrCode = qr?.base64 || qr?.qrcode?.base64 || qr?.code || null;

    await supabase.from("whatsapp_instances").update({
      status: qrCode ? "qr" : "connecting",
      qr_code: qrCode,
      last_event_at: new Date().toISOString(),
    }).eq("id", inst.id);

    return { qr: qrCode, raw: qr };
  });

export const refreshStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (!inst?.api_url || !inst?.api_key) throw new Error("Instância não configurada");
    const state = await evo(inst.api_url, inst.api_key, `/instance/connectionState/${inst.instance_name}`);
    const s = state?.instance?.state || state?.state;
    const status = s === "open" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
    await supabase.from("whatsapp_instances").update({ status, last_event_at: new Date().toISOString() }).eq("id", inst.id);
    return { status, raw: state };
  });

export const disconnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (!inst) throw new Error("Não encontrada");
    if (inst.api_url && inst.api_key) {
      try { await evo(inst.api_url, inst.api_key, `/instance/logout/${inst.instance_name}`, "DELETE"); } catch {}
    }
    await supabase.from("whatsapp_instances").update({ status: "disconnected", qr_code: null }).eq("id", inst.id);
    return { ok: true };
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    instanceId: z.string().uuid(),
    phone: z.string().min(8),
    text: z.string().min(1).max(4000),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.instanceId).single();
    if (!inst?.api_url || !inst?.api_key) throw new Error("Instância não configurada");
    const result = await evo(inst.api_url, inst.api_key, `/message/sendText/${inst.instance_name}`, "POST", {
      number: data.phone.replace(/\D/g, ""),
      text: data.text,
    });
    return { result };
  });
