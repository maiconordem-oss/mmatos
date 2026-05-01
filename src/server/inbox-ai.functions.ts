import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FAST_MODEL = "google/gemini-3-flash-preview";

async function callAI(messages: any[], opts: { tools?: any[]; toolName?: string; model?: string; temperature?: number } = {}) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const body: any = {
    model: opts.model ?? FAST_MODEL,
    messages,
    temperature: opts.temperature ?? 0.5,
  };
  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolName) body.tool_choice = { type: "function", function: { name: opts.toolName } };
  }

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Limite de requisições. Aguarde alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione em Workspace > Usage.");
  if (!res.ok) throw new Error(`IA [${res.status}]: ${await res.text()}`);
  return res.json();
}

async function fetchHistory(supabase: any, conversationId: string, limit = 20) {
  const { data } = await supabase
    .from("messages")
    .select("direction, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).reverse();
}

function transcript(msgs: any[]) {
  return msgs
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${(m.content ?? "").trim()}`)
    .filter((l) => l.length > 9)
    .join("\n");
}

// ── 1. Respostas inteligentes ───────────────────────────────
export const suggestReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      tone: z.enum(["formal", "casual", "amigavel", "persuasivo"]).default("amigavel"),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const msgs = await fetchHistory(supabase, data.conversationId, 15);
    if (msgs.length === 0) return { suggestions: [] };

    const toneMap = {
      formal: "formal e profissional",
      casual: "casual e descontraído",
      amigavel: "cordial, amigável e empático",
      persuasivo: "persuasivo, mas respeitoso",
    };

    const ai = await callAI(
      [
        {
          role: "system",
          content: `Você ajuda um atendente humano a responder no WhatsApp. Sugira 3 respostas curtas (até 25 palavras cada) em tom ${toneMap[data.tone]}, em português do Brasil. Naturais, sem formalismos exagerados, sem emoji excessivo.`,
        },
        { role: "user", content: `Conversa:\n${transcript(msgs)}\n\nSugira 3 respostas que o atendente poderia enviar agora.` },
      ],
      {
        tools: [
          {
            type: "function",
            function: {
              name: "reply_suggestions",
              description: "Sugestões de resposta ao cliente",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: { type: "string" },
                  },
                },
                required: ["suggestions"],
              },
            },
          },
        ],
        toolName: "reply_suggestions",
        temperature: 0.8,
      }
    );

    const args = JSON.parse(ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    return { suggestions: (args.suggestions ?? []) as string[] };
  });

// ── 2. Reescrita de mensagem ─────────────────────────────────
export const rewriteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      text: z.string().min(1).max(2000),
      style: z.enum(["curta", "clara", "profissional", "persuasiva"]),
    }).parse
  )
  .handler(async ({ data }) => {
    const styleMap = {
      curta: "mais curta e direta, mantendo o sentido",
      clara: "mais clara e fácil de entender",
      profissional: "mais profissional e formal",
      persuasiva: "mais persuasiva, sem ser invasiva",
    };
    const ai = await callAI(
      [
        { role: "system", content: `Reescreva a mensagem do usuário em português do Brasil ${styleMap[data.style]}. Retorne APENAS o texto reescrito, sem aspas, sem explicações.` },
        { role: "user", content: data.text },
      ],
      { temperature: 0.6 }
    );
    const out = (ai.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    return { rewritten: out };
  });

// ── 3. Resumo de conversa ────────────────────────────────────
export const summarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const msgs = await fetchHistory(supabase, data.conversationId, 80);
    if (msgs.length === 0) return { summary: "Sem mensagens para resumir." };

    const ai = await callAI(
      [
        {
          role: "system",
          content:
            "Resuma a conversa em português do Brasil. Estruture em 3 seções curtas:\n• **Pontos principais** (3-5 bullets)\n• **Decisões tomadas**\n• **Pendências / próximos passos**\nUse markdown.",
        },
        { role: "user", content: transcript(msgs) },
      ],
      { temperature: 0.3 }
    );
    return { summary: (ai.choices?.[0]?.message?.content ?? "").trim() };
  });

// ── 4. Extração de tarefas ───────────────────────────────────
export const extractTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const msgs = await fetchHistory(supabase, data.conversationId, 60);
    if (msgs.length === 0) return { tasks: [] };

    const ai = await callAI(
      [
        { role: "system", content: "Extraia tarefas acionáveis da conversa abaixo. Apenas tarefas reais, não suposições." },
        { role: "user", content: transcript(msgs) },
      ],
      {
        tools: [
          {
            type: "function",
            function: {
              name: "extract_tasks",
              parameters: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tarefa: { type: "string" },
                        responsavel: { type: "string", description: "Cliente, Atendente, ou nome próprio" },
                        prazo: { type: "string", description: "Prazo informado ou 'sem prazo'" },
                      },
                      required: ["tarefa", "responsavel", "prazo"],
                    },
                  },
                },
                required: ["tasks"],
              },
            },
          },
        ],
        toolName: "extract_tasks",
        temperature: 0.2,
      }
    );
    const args = JSON.parse(ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    return { tasks: (args.tasks ?? []) as Array<{ tarefa: string; responsavel: string; prazo: string }> };
  });

// ── 5. Tradução ──────────────────────────────────────────────
export const translateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      text: z.string().min(1).max(4000),
      targetLang: z.string().min(2).max(40).default("Português (Brasil)"),
    }).parse
  )
  .handler(async ({ data }) => {
    const ai = await callAI(
      [
        {
          role: "system",
          content: `Detecte o idioma do texto e traduza para ${data.targetLang}. Retorne APENAS o texto traduzido, nada mais. Se já estiver em ${data.targetLang}, retorne o original.`,
        },
        { role: "user", content: data.text },
      ],
      { temperature: 0.2 }
    );
    return { translated: (ai.choices?.[0]?.message?.content ?? "").trim() };
  });

// ── 6. Análise de sentimento ─────────────────────────────────
export const analyzeSentiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const msgs = await fetchHistory(supabase, data.conversationId, 30);
    const inbound = msgs.filter((m) => m.direction === "inbound");
    if (inbound.length === 0) return { sentiment: "neutro", urgency: "baixa", reason: "Sem mensagens do cliente." };

    const ai = await callAI(
      [
        { role: "system", content: "Classifique o sentimento e urgência do cliente com base nas mensagens dele." },
        { role: "user", content: inbound.map((m) => m.content ?? "").join("\n") },
      ],
      {
        tools: [
          {
            type: "function",
            function: {
              name: "classify",
              parameters: {
                type: "object",
                properties: {
                  sentiment: { type: "string", enum: ["positivo", "neutro", "negativo"] },
                  urgency: { type: "string", enum: ["baixa", "media", "alta"] },
                  reason: { type: "string", description: "Motivo curto (até 20 palavras) em pt-BR" },
                },
                required: ["sentiment", "urgency", "reason"],
              },
            },
          },
        ],
        toolName: "classify",
        temperature: 0.1,
      }
    );
    const args = JSON.parse(ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    return {
      sentiment: args.sentiment ?? "neutro",
      urgency: args.urgency ?? "baixa",
      reason: args.reason ?? "",
    };
  });

// ── 7. Busca semântica simples (sem embeddings; usa LLM) ─────
export const semanticSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      query: z.string().min(2).max(500),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, direction, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (!msgs || msgs.length === 0) return { matches: [] };

    const indexed = (msgs as any[])
      .map((m, i) => `[${i}] (${m.direction === "inbound" ? "Cliente" : "Atendente"}, ${new Date(m.created_at).toLocaleDateString("pt-BR")}) ${m.content ?? ""}`)
      .join("\n");

    const ai = await callAI(
      [
        {
          role: "system",
          content: 'Encontre na lista as mensagens que respondem à pergunta do usuário. Retorne os índices das até 5 mensagens mais relevantes, em ordem de relevância. Se nada for relevante, retorne lista vazia.',
        },
        { role: "user", content: `Pergunta: ${data.query}\n\nMensagens:\n${indexed}` },
      ],
      {
        tools: [
          {
            type: "function",
            function: {
              name: "matches",
              parameters: {
                type: "object",
                properties: { indices: { type: "array", items: { type: "integer" }, maxItems: 5 } },
                required: ["indices"],
              },
            },
          },
        ],
        toolName: "matches",
        temperature: 0.1,
      }
    );
    const args = JSON.parse(ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    const indices: number[] = args.indices ?? [];
    const matches = indices
      .map((i) => msgs[i])
      .filter(Boolean)
      .map((m: any) => ({ id: m.id, direction: m.direction, content: m.content, created_at: m.created_at }));
    return { matches };
  });
