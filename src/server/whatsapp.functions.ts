import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Inline helpers (defined inside each handler to avoid serverfn-split issues)
async function _evo(url: string, key: string, path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: any) {
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
function _publicWebhookUrl(instanceId: string, secret: string) {
  // Tenta env vars; se ausentes, cai no domínio publicado padrão do projeto.
  let base = process.env.SITE_URL || process.env.VITE_SITE_URL || process.env.PUBLIC_URL || "";
  if (!base) {
    const projectId = process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID || "";
    // Fallback hardcoded ao domínio publicado conhecido do projeto
    base = "https://mmatos.lovable.app";
  }
  return `${base.replace(/\/$/, "")}/api/public/whatsapp-webhook?id=${instanceId}&secret=${secret}`;
}
async function _getEvoCreds(supabase: any, userId: string) {
  const { data } = await supabase.from("user_settings").select("evolution_api_url, evolution_api_key").eq("user_id", userId).maybeSingle();
  const url = data?.evolution_api_url; const key = data?.evolution_api_key;
  if (!url || !key) throw new Error("Configure a Evolution API em Configurações antes de conectar uma instância.");
  return { url, key };
}
const evo = _evo;
const publicWebhookUrl = _publicWebhookUrl;
const getEvoCreds = _getEvoCreds;

export const upsertInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(),
    id: z.string().uuid().optional(),
    instance_name: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/),
    funnel_id: z.string().uuid().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    // garante que credenciais existem
    await getEvoCreds(supabase, userId);

    const payload: any = {
      user_id:      userId,
      instance_name: data.instance_name,
      funnel_id:    data.funnel_id ?? null,
    };

    let row: any;
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("whatsapp_instances").update(payload).eq("id", data.id).eq("user_id", userId).select().single();
      if (error) throw new Error(error.message);
      row = updated;
    } else {
      const { data: created, error } = await supabase
        .from("whatsapp_instances").insert(payload).select().single();
      if (error) throw new Error(error.message);
      row = created;
    }
    return { instance: row };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst, error } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (error || !inst) throw new Error("Instância não encontrada");

    const { url, key } = await getEvoCreds(supabase, userId);

    // Try create instance (idempotent — Evolution returns 409 if exists)
    try {
      await evo(url, key, "/instance/create", "POST", {
        instanceName: inst.instance_name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: publicWebhookUrl(inst.id, inst.webhook_secret),
        webhook_by_events: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      });
    } catch (e) { /* ignore exists */ }

    // Fetch QR
    const qr = await evo(url, key, `/instance/connect/${inst.instance_name}`);
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
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (!inst) throw new Error("Instância não encontrada");
    const { url, key } = await getEvoCreds(supabase, userId);
    const state = await evo(url, key, `/instance/connectionState/${inst.instance_name}`);
    const s = state?.instance?.state || state?.state;
    const status = s === "open" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
    await supabase.from("whatsapp_instances").update({ status, last_event_at: new Date().toISOString() }).eq("id", inst.id);
    return { status, raw: state };
  });

export const disconnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (!inst) throw new Error("Não encontrada");
    try {
      const { url, key } = await getEvoCreds(supabase, userId);
      try { await evo(url, key, `/instance/logout/${inst.instance_name}`, "DELETE"); } catch {}
    } catch {}
    await supabase.from("whatsapp_instances").update({ status: "disconnected", qr_code: null }).eq("id", inst.id);
    return { ok: true };
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(),
    instanceId: z.string().uuid(),
    phone: z.string().min(8),
    text: z.string().min(1).max(4000),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.instanceId).single();
    if (!inst) throw new Error("Instância não encontrada");
    const { url, key } = await getEvoCreds(supabase, userId);
    const result = await evo(url, key, `/message/sendText/${inst.instance_name}`, "POST", {
      number: data.phone.replace(/\D/g, ""),
      text: data.text,
    });
    return { result };
  });

// ---------- Settings ----------

export const getUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional() }).parse)
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("user_settings")
      .select("evolution_api_url, evolution_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      evolution_api_url: data?.evolution_api_url ?? "",
      evolution_api_key: data?.evolution_api_key ?? "",
    };
  });

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    evolution_api_url: z.string().url(),
    evolution_api_key: z.string().min(1),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: userId,
        evolution_api_url: data.evolution_api_url,
        evolution_api_key: data.evolution_api_key,
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
