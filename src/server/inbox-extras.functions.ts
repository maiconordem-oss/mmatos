/**
 * Funções de produtividade do Inbox + inteligência da IA.
 * - Mensagens agendadas, notas internas
 * - Copiloto (sugestões), resumo, memória do cliente, sentimento
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function callAI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools?: any[],
) {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_KEY não configurada");
  const body: any = { model, messages };
  if (tools) {
    body.tools = tools;
    body.tool_choice = { type: "function", function: { name: tools[0].function.name } };
  }
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Limite de requisições excedido. Aguarde alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Workspace > Usage.");
  if (!res.ok) throw new Error(`Erro IA [${res.status}]: ${await res.text()}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// MENSAGENS AGENDADAS
// ─────────────────────────────────────────────────────────────────

export const scheduleMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      content: z.string().min(1).max(4000),
      scheduledAt: z.string(), // ISO
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("scheduled_messages")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        content: data.content,
        scheduled_at: data.scheduledAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { scheduled: row };
  });

export const listScheduledMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid().optional() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true });
    if (data.conversationId) q = q.eq("conversation_id", data.conversationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const cancelScheduledMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("scheduled_messages")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────
// NOTAS INTERNAS
// ─────────────────────────────────────────────────────────────────

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid(),
      content: z.string().min(1).max(4000),
      authorName: z.string().max(120).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("internal_notes")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        content: data.content,
        author_name: data.authorName ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { note: row };
  });

export const listInternalNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("internal_notes")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const deleteInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase.from("internal_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────
// COPILOTO — Sugestões de resposta (não envia, só sugere)
// ─────────────────────────────────────────────────────────────────

export const copilotSuggest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("ai_agent_settings")
      .select("ai_model, qualifier_prompt")
      .eq("user_id", userId)
      .maybeSingle();
    const model = settings?.ai_model ?? "gemini-2.0-flash";

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, transcription")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = (msgs ?? []).reverse().map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.transcription ? `[áudio transcrito] ${m.transcription}` : (m.content ?? ""),
    }));

    // Contexto de KB e memória
    const { data: conv } = await supabase
      .from("conversations")
      .select("client_id")
      .eq("id", data.conversationId)
      .maybeSingle();

    let kbContext = "";
    const lastUserMsg = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
    if (lastUserMsg) {
      const { data: kb } = await supabase
        .from("kb_documents")
        .select("title, content")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(30);
      if (kb && kb.length) {
        const relevant = (kb as any[])
          .map((d) => ({ d, score: scoreRelevance(lastUserMsg, `${d.title} ${d.content}`) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map((x) => `- ${x.d.title}: ${x.d.content}`)
          .join("\n");
        if (relevant) kbContext = `\n\nBase de conhecimento do escritório:\n${relevant}`;
      }
    }

    let memoryContext = "";
    if (conv?.client_id) {
      const { data: mem } = await supabase
        .from("client_memory")
        .select("summary, facts")
        .eq("client_id", conv.client_id)
        .maybeSingle();
      if (mem?.summary) memoryContext = `\n\nO que sabemos deste cliente:\n${mem.summary}`;
    }

    const sys =
      "Você é um copiloto de atendimento jurídico. Gere 3 sugestões de resposta curtas, profissionais e cordiais para a última mensagem do cliente. Tons diferentes: formal, próximo, objetivo. NÃO envie, apenas sugira." +
      kbContext +
      memoryContext;

    const aiRes = await callAI(
      model,
      [{ role: "system", content: sys }, ...history],
      [
        {
          type: "function",
          function: {
            name: "suggest_replies",
            description: "Retorna 3 sugestões de resposta",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      tone: { type: "string", enum: ["formal", "proximo", "objetivo"] },
                      text: { type: "string" },
                    },
                    required: ["tone", "text"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        },
      ],
    );

    const args = JSON.parse(aiRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    return { suggestions: args.suggestions ?? [] };
  });

// ─────────────────────────────────────────────────────────────────
// RESUMO + Próximo passo
// ─────────────────────────────────────────────────────────────────

export const summarizeAndSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("ai_agent_settings")
      .select("ai_model")
      .eq("user_id", userId)
      .maybeSingle();
    const model = settings?.ai_model ?? "gemini-2.5-flash";

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, transcription")
      .eq("conversation_id", data.conversationId)
      .order("created_at");

    const transcript = (msgs ?? [])
      .map((m: any) => {
        const text = m.transcription ? `[áudio] ${m.transcription}` : (m.content ?? "");
        return `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${text}`;
      })
      .join("\n");

    const aiRes = await callAI(
      model,
      [
        { role: "system", content: "Resuma a conversa jurídica abaixo de forma objetiva." },
        { role: "user", content: transcript || "(sem mensagens)" },
      ],
      [
        {
          type: "function",
          function: {
            name: "save_summary",
            description: "Salva resumo da conversa",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Resumo em 3-5 bullets curtos do que o cliente quer e fatos importantes" },
                next_step: { type: "string", description: "Próxima ação recomendada para o advogado" },
                legal_area: { type: "string", description: "Área jurídica identificada (trabalhista, civil, criminal, familia, tributario, empresarial, previdenciario, consumidor, outro)" },
              },
              required: ["summary", "next_step", "legal_area"],
            },
          },
        },
      ],
    );
    const args = JSON.parse(aiRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");

    const { data: row, error } = await supabase
      .from("conversation_summaries")
      .upsert(
        {
          user_id: userId,
          conversation_id: data.conversationId,
          summary: args.summary,
          next_step: args.next_step,
          legal_area: args.legal_area,
          message_count: msgs?.length ?? 0,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { summary: row };
  });

export const getConversationSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row } = await supabase
      .from("conversation_summaries")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    return { summary: row };
  });

// ─────────────────────────────────────────────────────────────────
// MEMÓRIA DO CLIENTE — extrair fatos e atualizar
// ─────────────────────────────────────────────────────────────────

export const updateClientMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: conv } = await supabase
      .from("conversations")
      .select("client_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv?.client_id) return { memory: null, reason: "sem cliente vinculado" };

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, transcription")
      .eq("conversation_id", data.conversationId)
      .order("created_at");

    const transcript = (msgs ?? [])
      .map((m: any) => {
        const text = m.transcription ?? m.content ?? "";
        return `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${text}`;
      })
      .join("\n");

    const { data: settings } = await supabase
      .from("ai_agent_settings").select("ai_model").eq("user_id", userId).maybeSingle();
    const model = settings?.ai_model ?? "gemini-2.5-flash";

    const { data: existing } = await supabase
      .from("client_memory")
      .select("facts, summary")
      .eq("client_id", conv.client_id)
      .maybeSingle();

    const sys = "Extraia fatos persistentes deste cliente que o escritório deve lembrar em conversas futuras (preferências, área jurídica de interesse, datas relevantes, processos, restrições, contexto pessoal/profissional, valores discutidos). Não inclua dados sensíveis desnecessários.";

    const aiRes = await callAI(
      model,
      [
        { role: "system", content: sys },
        { role: "user", content: `Memória atual: ${existing?.summary ?? "(vazia)"}\n\nConversa:\n${transcript}` },
      ],
      [
        {
          type: "function",
          function: {
            name: "save_memory",
            description: "Salva fatos persistentes",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Resumo em 2-4 frases sobre o cliente, no presente." },
                facts: {
                  type: "object",
                  properties: {
                    interests: { type: "array", items: { type: "string" } },
                    pain_points: { type: "array", items: { type: "string" } },
                    preferences: { type: "array", items: { type: "string" } },
                    important_dates: { type: "array", items: { type: "string" } },
                  },
                },
              },
              required: ["summary", "facts"],
            },
          },
        },
      ],
    );
    const args = JSON.parse(aiRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");

    const { data: row, error } = await supabase
      .from("client_memory")
      .upsert(
        {
          user_id: userId,
          client_id: conv.client_id,
          conversation_id: data.conversationId,
          summary: args.summary,
          facts: args.facts ?? {},
        },
        { onConflict: "user_id,client_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { memory: row };
  });

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

function scoreRelevance(query: string, text: string): number {
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const terms = q.split(/\s+/).filter((w) => w.length > 3);
  let s = 0;
  for (const term of terms) if (t.includes(term)) s += 1;
  return s;
}
