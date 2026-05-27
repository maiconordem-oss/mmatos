/**
 * Agentes de IA (qualificador, extração, proposta) — migrados para AI SDK.
 *
 * Mantém a mesma assinatura (server fns chamadas pelo Inbox), mas:
 *  - Substitui fetch manual + parser frágil de JSON por generateText + tools tipadas (Zod).
 *  - Usa o gateway via createLovableAiGatewayProvider (header Lovable-API-Key).
 *  - Mantém safety, debug logs, memória do cliente e KB existentes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { createLovableAiGatewayProvider, describeAiError, DEFAULT_LOVABLE_MODEL } from "@/lib/ai-gateway.server";
import { checkSafety, logAIDebug, incrementAICounter } from "@/server/intelligence.functions";

function gatewayModel(modelId: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurada");
  return createLovableAiGatewayProvider(key)(modelId);
}

/** Agente Qualificador: responde ao lead via WhatsApp e tenta qualificar */
export const qualifierReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("ai_agent_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const qualifierPromptA = settings?.qualifier_prompt ??
      "Você é um assistente de um escritório de advocacia. Qualifique o lead descobrindo área jurídica, urgência e descrição do caso. Seja cordial e objetivo.";
    const qualifierPromptB = settings?.qualifier_prompt_b ?? null;
    const abEnabled = !!settings?.ab_enabled && !!qualifierPromptB;
    const abSplit = Math.min(100, Math.max(0, settings?.ab_split_pct ?? 50));
    const useB = abEnabled && Math.random() * 100 < abSplit;
    const qualifierPrompt = useB ? (qualifierPromptB as string) : qualifierPromptA;
    const variant: string | null = abEnabled ? (useB ? "B" : "A") : null;
    const modelId = settings?.ai_model ?? DEFAULT_LOVABLE_MODEL;

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, transcription")
      .eq("conversation_id", data.conversationId)
      .order("created_at")
      .limit(30);

    const history = (msgs ?? []).map((m: any) => ({
      role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: m.transcription ? `[áudio transcrito] ${m.transcription}` : (m.content ?? ""),
    }));

    // Base de conhecimento + memória do cliente
    const { data: conv } = await supabase
      .from("conversations").select("client_id").eq("id", data.conversationId).maybeSingle();

    let kbContext = "";
    const lastUser = [...history].reverse().find(h => h.role === "user")?.content ?? "";
    if (lastUser) {
      const { data: kb } = await supabase
        .from("kb_documents").select("title, content")
        .eq("user_id", userId).eq("active", true).limit(30);
      if (kb && kb.length) {
        const q = lastUser.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const terms = q.split(/\s+/).filter((w: string) => w.length > 3);
        const ranked = (kb as any[])
          .map(d => {
            const t = `${d.title} ${d.content}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const score = terms.reduce((s: number, term: string) => s + (t.includes(term) ? 1 : 0), 0);
            return { d, score };
          })
          .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
        if (ranked.length) {
          kbContext = "\n\nBase de conhecimento do escritório:\n" +
            ranked.map(x => `- ${x.d.title}: ${x.d.content}`).join("\n");
        }
      }
    }

    let memoryContext = "";
    if (conv?.client_id) {
      const { data: mem } = await supabase
        .from("client_memory").select("summary").eq("client_id", conv.client_id).maybeSingle();
      if (mem?.summary) memoryContext = `\n\nO que sabemos deste cliente:\n${mem.summary}`;
    }

    // Safety check antes de gerar resposta
    const safety = await checkSafety(userId, data.conversationId, lastUser);
    if (safety.block) {
      await logAIDebug({
        userId,
        conversationId: data.conversationId,
        kind: "blocked",
        model: modelId,
        prompt: { reason: safety.reason },
        response: null,
      });
      return { reply: null, blocked: true, reason: safety.reason };
    }

    const systemPrompt = qualifierPrompt + kbContext + memoryContext;
    const t0 = Date.now();
    let reply = "Desculpe, não consegui responder agora.";
    let errorMsg: string | null = null;

    try {
      const res = await generateText({
        model: gatewayModel(modelId),
        system: systemPrompt,
        messages: history,
      });
      reply = (res.text ?? "").trim() || reply;
    } catch (e) {
      errorMsg = describeAiError(e);
    }
    const latencyMs = Date.now() - t0;

    await logAIDebug({
      userId,
      conversationId: data.conversationId,
      kind: "reply",
      model: modelId,
      prompt: { system: systemPrompt, messages: history },
      response: reply,
      latencyMs,
      error: errorMsg ?? undefined,
      variant,
    });

    if (errorMsg) throw new Error(errorMsg);

    const replyLow = reply.toLowerCase();
    const lowConfidence = /\b(não sei|nao sei|não posso|consulte um advogado|encaminhar|equipe entrará|entrar.*contato)\b/.test(replyLow);

    await supabase.from("messages").insert({
      user_id: userId,
      conversation_id: data.conversationId,
      direction: "outbound",
      content: reply,
      status: "sent",
    });

    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: reply.slice(0, 80),
      ai_handled: true,
      ...(lowConfidence ? { needs_human: true } : {}),
    }).eq("id", data.conversationId);

    await incrementAICounter(data.conversationId);

    return { reply, lowConfidence };
  });

/** Extrai dados estruturados da conversa para qualificar o lead */
export const extractQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("ai_agent_settings").select("ai_model").eq("user_id", userId).maybeSingle();
    const modelId = settings?.ai_model ?? DEFAULT_LOVABLE_MODEL;

    const { data: msgs } = await supabase
      .from("messages").select("direction, content")
      .eq("conversation_id", data.conversationId).order("created_at");

    const transcript = (msgs ?? []).map((m: any) =>
      `${m.direction === "inbound" ? "Lead" : "Atendente"}: ${m.content ?? ""}`
    ).join("\n");

    const extractSchema = z.object({
      legal_area: z.string().describe("Área: trabalhista, civil, criminal, familia, tributario, empresarial, previdenciario, consumidor, outro"),
      urgency: z.enum(["baixa", "media", "alta"]),
      description: z.string().describe("Resumo do caso"),
      estimated_value: z.number().nullable().optional().describe("Valor estimado da causa em BRL"),
      score: z.number().int().min(0).max(100).describe("Qualidade do lead 0-100"),
      qualified: z.boolean().describe("true se há informação suficiente para gerar proposta"),
    });

    type ExtractArgs = z.infer<typeof extractSchema>;
    const extractedRef: { current: ExtractArgs | null } = { current: null };

    try {
      await generateText({
        model: gatewayModel(modelId),
        system: "Extraia dados de qualificação jurídica da conversa fornecida pelo usuário. Use a ferramenta extract_lead.",
        prompt: transcript,
        tools: {
          extract_lead: tool({
            description: "Salva os dados de qualificação do lead",
            inputSchema: extractSchema,
            execute: async (args: ExtractArgs) => {
              extractedRef.current = args;
              return { ok: true };
            },
          }),
        },
        toolChoice: "required",
        stopWhen: stepCountIs(50),
      });
    } catch (e) {
      throw new Error(describeAiError(e));
    }

    const extracted = extractedRef.current;
    if (!extracted) throw new Error("IA não retornou qualificação");

    const { data: conv } = await supabase.from("conversations").select("client_id").eq("id", data.conversationId).single();

    const { data: qual, error } = await supabase.from("lead_qualifications").insert({
      user_id: userId,
      conversation_id: data.conversationId,
      client_id: conv?.client_id ?? null,
      legal_area: extracted.legal_area,
      urgency: extracted.urgency,
      description: extracted.description,
      estimated_value: extracted.estimated_value ?? null,
      score: extracted.score ?? 0,
      qualified: extracted.qualified ?? false,
      raw_data: extracted,
    }).select().single();

    if (error) throw new Error(error.message);
    return { qualification: qual };
  });

/** Agente Proposta: gera proposta com base em uma qualificação */
export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    qualificationId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    caseId: z.string().uuid().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("ai_agent_settings").select("*").eq("user_id", userId).maybeSingle();
    const modelId = settings?.ai_model ?? DEFAULT_LOVABLE_MODEL;
    const proposalPrompt = settings?.proposal_prompt ??
      "Você é um advogado experiente. Gere uma proposta de honorários profissional usando a ferramenta create_proposal.";

    const { data: qual } = await supabase
      .from("lead_qualifications").select("*").eq("id", data.qualificationId).single();
    if (!qual) throw new Error("Qualificação não encontrada");

    const proposalSchema = z.object({
      title: z.string(),
      scope: z.string().describe("Escopo de atuação detalhado"),
      value: z.number().describe("Valor dos honorários em BRL"),
      payment_terms: z.string().describe("Forma de pagamento"),
      estimated_duration: z.string().describe("Prazo estimado"),
    });

    type ProposalArgs = z.infer<typeof proposalSchema>;
    const capturedRef: { current: ProposalArgs | null } = { current: null };

    try {
      await generateText({
        model: gatewayModel(modelId),
        system: proposalPrompt,
        prompt: `Área: ${qual.legal_area}\nUrgência: ${qual.urgency}\nDescrição: ${qual.description}\nValor estimado: R$ ${qual.estimated_value ?? "não informado"}`,
        tools: {
          create_proposal: tool({
            description: "Cria proposta de honorários",
            inputSchema: proposalSchema,
            execute: async (args: ProposalArgs) => {
              capturedRef.current = args;
              return { ok: true };
            },
          }),
        },
        toolChoice: "required",
        stopWhen: stepCountIs(50),
      });
    } catch (e) {
      throw new Error(describeAiError(e));
    }

    const captured = capturedRef.current;
    if (!captured) throw new Error("IA não retornou proposta");

    const { data: prop, error } = await supabase.from("proposals").insert({
      user_id: userId,
      case_id: data.caseId ?? qual.case_id ?? null,
      client_id: data.clientId ?? qual.client_id ?? null,
      title: captured.title,
      scope: captured.scope,
      value: captured.value,
      payment_terms: captured.payment_terms,
      estimated_duration: captured.estimated_duration,
      status: "rascunho",
      ai_generated: true,
    }).select().single();

    if (error) throw new Error(error.message);
    return { proposal: prop };
  });
