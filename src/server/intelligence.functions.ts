/**
 * Onda 2/3 — Inteligência, segurança e debug do agente IA.
 * - Sentimento auto (chamado pelo webhook)
 * - Rate limit / loop / palavras proibidas
 * - Debug logs por conversa
 * - Forbidden words CRUD
 * - Toggle IA com motivo
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Palavras-chave críticas (acionam alerta independente de sentimento da IA)
export const CRITICAL_KEYWORDS = [
  "processar", "processo contra", "reclamar", "procon", "denunciar",
  "denuncia", "justiça", "advogado contra", "oab", "ministério público",
  "ministerio publico", "indenização", "indenizacao", "danos morais",
];

// Máximo de respostas seguidas da IA sem intervenção humana
export const MAX_AI_CONSECUTIVE = 6;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ──────────────────────────────────────────────────────────────
// SENTIMENT — chamado pelo webhook (admin client, sem auth)
// ──────────────────────────────────────────────────────────────

export async function classifyAndPersistSentiment(
  conversationId: string,
  userId: string,
  text: string,
): Promise<{ sentiment: string; critical: boolean } | null> {
  if (!text || text.trim().length < 2) return null;

  // Checagem rápida de palavras-chave críticas (sem IA)
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const critical = CRITICAL_KEYWORDS.some((k) => lower.includes(k));

  let sentiment = "neutro";

  if (critical || text.trim().length < 8) {
    await supabaseAdmin
      .from("conversations")
      .update({
        sentiment: critical ? "urgente" : sentiment,
        priority_flag: critical ? "alta" : null,
        ...(critical ? { needs_human: true, ai_paused: true } : {}),
      })
      .eq("id", conversationId);
    return { sentiment: critical ? "urgente" : sentiment, critical };
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Classifique o sentimento desta mensagem de cliente. Responda APENAS uma palavra: positivo, neutro, negativo ou urgente.",
          },
          { role: "user", content: text.slice(0, 600) },
        ],
        max_tokens: 6,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const raw = (j.choices?.[0]?.message?.content ?? "neutro").toLowerCase().trim();
      if (["positivo", "neutro", "negativo", "urgente"].includes(raw)) sentiment = raw;
    }
  } catch (e) {
    console.error("sentiment classify error:", e);
  }

  const priorityFlag = critical || sentiment === "urgente" || sentiment === "negativo" ? "alta" : null;
  const needsHuman = critical;

  await supabaseAdmin
    .from("conversations")
    .update({
      sentiment,
      priority_flag: priorityFlag,
      ...(needsHuman ? { needs_human: true, ai_paused: true } : {}),
    })
    .eq("id", conversationId);

  return { sentiment, critical };
}

// ──────────────────────────────────────────────────────────────
// HORÁRIO COMERCIAL — chamado pelo webhook
// ──────────────────────────────────────────────────────────────

export async function checkBusinessHours(userId: string): Promise<{
  insideHours: boolean;
  awayMessage: string | null;
}> {
  const { data: bh } = await supabaseAdmin
    .from("business_hours")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!bh || !bh.enabled) return { insideHours: true, awayMessage: null };

  // Hora no fuso BR (UTC-3, sem DST atualmente)
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brMin = (utcMin - 180 + 1440) % 1440;
  const brHour = Math.floor(brMin / 60);
  const brDow = new Date(now.getTime() - 3 * 3600 * 1000).getUTCDay(); // 0=dom

  const inDay = (bh.work_days as number[]).includes(brDow);
  const inHour = brHour >= bh.start_hour && brHour < bh.end_hour;
  const inside = inDay && inHour;

  return {
    insideHours: inside,
    awayMessage: inside ? null : bh.absent_message ?? "Fora do horário comercial. Retornaremos em breve.",
  };
}

// ──────────────────────────────────────────────────────────────
// SEGURANÇA — rate limit + palavras proibidas
// ──────────────────────────────────────────────────────────────

export async function checkSafety(
  userId: string,
  conversationId: string,
  inboundText: string,
): Promise<{ block: boolean; reason: string | null }> {
  // 1) Rate limit / loop
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("ai_consecutive_count, ai_paused, needs_human")
    .eq("id", conversationId)
    .maybeSingle();

  if (conv?.ai_paused) return { block: true, reason: "ia_pausada" };

  if ((conv?.ai_consecutive_count ?? 0) >= MAX_AI_CONSECUTIVE) {
    await supabaseAdmin
      .from("conversations")
      .update({ ai_paused: true, needs_human: true })
      .eq("id", conversationId);
    return { block: true, reason: "rate_limit_loop" };
  }

  // 2) Pedido explícito de humano
  const lower = (inboundText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const wantsHuman = /\b(falar com humano|atendente|pessoa real|quero falar com|advogado de verdade)\b/.test(lower);
  if (wantsHuman) {
    await supabaseAdmin
      .from("conversations")
      .update({ ai_paused: true, needs_human: true })
      .eq("id", conversationId);
    return { block: true, reason: "pedido_humano" };
  }

  // 3) Palavras proibidas configuráveis
  const { data: words } = await supabaseAdmin
    .from("forbidden_words")
    .select("word")
    .eq("user_id", userId);
  if (words && words.length) {
    const hit = (words as any[]).find((w) => {
      const word = String(w.word ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (!word) return false;
      return new RegExp(`(^|\\W)${escapeRegExp(word)}($|\\W)`, "i").test(lower);
    });
    if (hit) {
      await supabaseAdmin
        .from("conversations")
        .update({ ai_paused: true, needs_human: true })
        .eq("id", conversationId);
      return { block: true, reason: `palavra_proibida:${hit.word}` };
    }
  }

  return { block: false, reason: null };
}

export async function logAIDebug(params: {
  userId: string;
  conversationId: string;
  kind?: string;
  model?: string;
  prompt?: any;
  response?: string | null;
  latencyMs?: number;
  error?: string;
  variant?: string | null;
}) {
  try {
    await supabaseAdmin.from("ai_debug_logs").insert({
      user_id: params.userId,
      conversation_id: params.conversationId,
      kind: params.kind ?? "reply",
      model: params.model ?? null,
      prompt: params.prompt ?? null,
      response: params.response ?? null,
      latency_ms: params.latencyMs ?? null,
      error: params.error ?? null,
      variant: params.variant ?? null,
    });
  } catch (e) {
    console.error("logAIDebug error:", e);
  }
}

export async function incrementAICounter(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("ai_consecutive_count")
    .eq("id", conversationId)
    .maybeSingle();
  await supabaseAdmin
    .from("conversations")
    .update({ ai_consecutive_count: ((data?.ai_consecutive_count ?? 0) + 1) })
    .eq("id", conversationId);
}

export async function resetAICounter(conversationId: string) {
  await supabaseAdmin
    .from("conversations")
    .update({ ai_consecutive_count: 0 })
    .eq("id", conversationId);
}

// ──────────────────────────────────────────────────────────────
// SERVER FNs (UI)
// ──────────────────────────────────────────────────────────────

export const toggleAIPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      paused: z.boolean(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("conversations")
      .update({
        ai_paused: data.paused,
        ...(data.paused ? {} : { needs_human: false, ai_consecutive_count: 0 }),
      })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      followUp: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await supabase
      .from("conversations")
      .update({
        needs_human: false,
        follow_up_required: data.followUp ?? false,
      })
      .eq("id", data.conversationId);
    return { ok: true };
  });

export const listAIDebugLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows } = await supabase
      .from("ai_debug_logs")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { items: rows ?? [] };
  });

// Forbidden words CRUD
export const listForbiddenWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional() }).parse)
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data } = await supabase.from("forbidden_words").select("*").order("created_at");
    return { items: data ?? [] };
  });

export const addForbiddenWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      word: z.string().min(2).max(80),
      severity: z.enum(["low", "high"]).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("forbidden_words")
      .insert({ user_id: userId, word: data.word.trim().toLowerCase(), severity: data.severity ?? "high" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { word: row };
  });

export const deleteForbiddenWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    await supabase.from("forbidden_words").delete().eq("id", data.id);
    return { ok: true };
  });

// TODO: extração de texto de imagem/PDF via Gemini multimodal.
// Para evitar custo alto agora, deixamos um stub. Quando ativar,
// chamar este helper a partir do webhook (processInboundMedia) e
// salvar o texto em messages.transcription para entrar no contexto da IA.
export async function extractTextFromMediaStub(_mediaUrl: string, _mime: string): Promise<string | null> {
  return null;
}
