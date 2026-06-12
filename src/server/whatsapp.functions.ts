import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeBRPhone, onlyDigits, phoneVariants } from "@/lib/phone";

/**
 * Normaliza qualquer telefone para o formato canônico BR (13 dígitos) antes de enviar para a Evolution.
 * Para números fora do BR (que não conseguimos detectar como BR), devolve apenas os dígitos.
 */
export function normalizePhoneForEvolution(phone: string | null | undefined): string {
  const n = normalizeBRPhone(phone);
  return n || onlyDigits(phone);
}


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
function _publicWebhookUrl(instanceId: string, secret: string, publicBaseUrl?: string | null) {
  // Tenta env vars; se ausentes, cai no domínio publicado padrão do projeto.
  let base = publicBaseUrl || process.env.SITE_URL || process.env.VITE_SITE_URL || process.env.PUBLIC_URL || "";
  if (!base) {
    const projectId = process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID || "";
    // Fallback hardcoded ao domínio publicado conhecido do projeto
    base = "https://mmatos.lovable.app";
  }
  return `${base.replace(/\/$/, "")}/api/public/whatsapp-webhook?id=${instanceId}&secret=${secret}`;
}
function _extractMessageId(result: any): string | null {
  return result?.key?.id
    || result?.message?.key?.id
    || result?.data?.key?.id
    || result?.id
    || null;
}
async function _getEvoCreds(supabase: any, userId: string) {
  const { data } = await supabase.from("user_settings").select("evolution_api_url, evolution_api_key").eq("user_id", userId).maybeSingle();
  const url = data?.evolution_api_url;
  const key = data?.evolution_api_key;
  return { url: url ?? null, key: key ?? null };
}
const evo = _evo;
const publicWebhookUrl = _publicWebhookUrl;
const getEvoCreds = _getEvoCreds;

export const upsertInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(),
    id:            z.string().uuid().optional(),
    instance_name: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/),
    api_url:       z.string().url().optional(),
    api_key:       z.string().optional(),
    funnel_id:     z.string().uuid().nullable().optional(),
    is_office:     z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const payload: any = {
      user_id:       userId,
      instance_name: data.instance_name,
      funnel_id:     data.funnel_id ?? null,
      is_office:     data.is_office ?? false,
    };

    // Salvar api_url e api_key se fornecidos
    if (data.api_url)  payload.api_url  = data.api_url;
    if (data.api_key)  payload.api_key  = data.api_key;

    // Se não fornecidos, usar as credenciais globais do usuário
    if (!payload.api_url || !payload.api_key) {
      const creds = await getEvoCreds(supabase, userId);
      if (!payload.api_url && creds?.url)  payload.api_url  = creds.url;
      if (!payload.api_key && creds?.key)  payload.api_key  = creds.key;
    }

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
  .inputValidator(z.object({
    __token: z.string().optional(),
    id: z.string().uuid(),
    public_base_url: z.string().url().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst, error } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (error || !inst) throw new Error("Instância não encontrada");

    // Usar api_url da própria instância, ou fallback para global
    const creds = await getEvoCreds(supabase, userId);
    const url = inst.api_url || creds.url;
    const key = inst.api_key || creds.key;
    if (!url || !key) throw new Error("Configure a URL e API Key da Evolution API na instância ou em Configurações.");

    const webhookUrl = publicWebhookUrl(inst.id, inst.webhook_secret, data.public_base_url);
    const events = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

    // Try create instance (idempotent — Evolution returns 409 if exists)
    try {
      await evo(url, key, "/instance/create", "POST", {
        instanceName: inst.instance_name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, events },
      });
    } catch (e) { /* ignore exists */ }

    // Sempre garante webhook configurado (idempotente, sobrescreve config antiga)
    try {
      await evo(url, key, `/webhook/set/${inst.instance_name}`, "POST", {
        webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events },
      });
    } catch {
      try {
        await evo(url, key, `/webhook/set/${inst.instance_name}`, "POST", {
          url: webhookUrl, enabled: true, webhook_by_events: false, events,
        });
      } catch { /* não-fatal */ }
    }

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
    const creds = await getEvoCreds(supabase, userId);
    const url = inst.api_url || creds.url;
    const key = inst.api_key || creds.key;
    if (!url || !key) throw new Error("Configure a URL e API Key da Evolution API na instância ou em Configurações.");
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
      const creds = await getEvoCreds(supabase, userId);
      const url = inst.api_url || creds.url;
      const key = inst.api_key || creds.key;
      if (!url || !key) throw new Error("Credenciais da Evolution API ausentes.");
      try { await evo(url, key, `/instance/logout/${inst.instance_name}`, "DELETE"); } catch {}
    } catch {}
    await supabase.from("whatsapp_instances").update({ status: "disconnected", qr_code: null }).eq("id", inst.id);
    return { ok: true };
  });

export const setWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    id: z.string().uuid(),
    public_base_url: z.string().url().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", data.id).single();
    if (!inst) throw new Error("Instância não encontrada");
    const creds = await getEvoCreds(supabase, userId);
    const url = inst.api_url || creds.url;
    const key = inst.api_key || creds.key;
    if (!url || !key) throw new Error("Configure a URL e API Key da Evolution API na instância ou em Configurações.");
    const webhookUrl = publicWebhookUrl(inst.id, inst.webhook_secret, data.public_base_url);

    // Evolution API v2: POST /webhook/set/{instance}
    const events = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
    let ok = false;
    let lastErr: any = null;
    // Tentar v2 primeiro
    try {
      await evo(url, key, `/webhook/set/${inst.instance_name}`, "POST", {
        webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events },
      });
      ok = true;
    } catch (e) { lastErr = e; }
    if (!ok) {
      // Fallback v1: payload plano
      try {
        await evo(url, key, `/webhook/set/${inst.instance_name}`, "POST", {
          url: webhookUrl, enabled: true, webhook_by_events: false, events,
        });
        ok = true;
      } catch (e) { lastErr = e; }
    }
    if (!ok) throw new Error(`Falha ao configurar webhook: ${lastErr?.message ?? "desconhecido"}`);
    return { ok: true, webhookUrl };
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
    const creds = await getEvoCreds(supabase, userId);
    const url = inst.api_url || creds.url;
    const key = inst.api_key || creds.key;
    if (!url || !key) throw new Error("Configure a URL e API Key da Evolution API na instância ou em Configurações.");
    const result = await evo(url, key, `/message/sendText/${inst.instance_name}`, "POST", {
      number: data.phone.replace(/\D/g, ""),
      text: data.text,
    });
    return { result, messageId: _extractMessageId(result) };
  });

// ---------- Shared Evolution helpers (usable in server routes) ----------

export async function sendEvolutionText(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  text: string,
): Promise<string | null> {
  const result = await _evo(apiUrl, apiKey, `/message/sendText/${instanceName}`, "POST", {
    number: phone.replace(/\D/g, ""),
    text,
  });
  return _extractMessageId(result);
}

export async function syncInstanceWebhookEvents(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
): Promise<void> {
  const events = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
  try {
    await _evo(apiUrl, apiKey, `/webhook/set/${instanceName}`, "POST", {
      webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events },
    });
  } catch {
    try {
      await _evo(apiUrl, apiKey, `/webhook/set/${instanceName}`, "POST", {
        url: webhookUrl, enabled: true, webhook_by_events: false, events,
      });
    } catch { /* não-fatal */ }
  }
}

export { _publicWebhookUrl as buildInstanceWebhookUrl };

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
