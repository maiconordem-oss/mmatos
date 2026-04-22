import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(model: string, messages: Array<{ role: string; content: string }>, tools?: any[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

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
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Erro IA [${res.status}]: ${t}`);
  }

  return res.json();
}

/** Agente Qualificador: responde ao lead via WhatsApp e tenta qualificar */
export const qualifierReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("ai_agent_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const qualifierPrompt = settings?.qualifier_prompt ??
      "Você é um assistente de um escritório de advocacia. Qualifique o lead descobrindo área jurídica, urgência e descrição do caso. Seja cordial e objetivo.";
    const model = settings?.ai_model ?? "google/gemini-3-flash-preview";

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at")
      .limit(30);

    const history = (msgs ?? []).map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content ?? "",
    }));

    const aiRes = await callAI(model, [
      { role: "system", content: qualifierPrompt },
      ...history,
    ]);

    const reply: string = aiRes.choices?.[0]?.message?.content ?? "Desculpe, não consegui responder agora.";

    // Salvar resposta como mensagem outbound
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
    }).eq("id", data.conversationId);

    return { reply };
  });

/** Extrai dados estruturados da conversa para qualificar o lead */
export const extractQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("ai_agent_settings").select("ai_model").eq("user_id", userId).maybeSingle();
    const model = settings?.ai_model ?? "google/gemini-3-flash-preview";

    const { data: msgs } = await supabase
      .from("messages").select("direction, content")
      .eq("conversation_id", data.conversationId).order("created_at");

    const transcript = (msgs ?? []).map((m: any) =>
      `${m.direction === "inbound" ? "Lead" : "Atendente"}: ${m.content ?? ""}`
    ).join("\n");

    const aiRes = await callAI(model, [
      { role: "system", content: "Extraia dados de qualificação jurídica da conversa abaixo." },
      { role: "user", content: transcript },
    ], [{
      type: "function",
      function: {
        name: "extract_lead",
        description: "Extrai dados de qualificação do lead",
        parameters: {
          type: "object",
          properties: {
            legal_area: { type: "string", description: "Área: trabalhista, civil, criminal, familia, tributario, empresarial, previdenciario, consumidor, outro" },
            urgency: { type: "string", enum: ["baixa", "media", "alta"] },
            description: { type: "string", description: "Resumo do caso" },
            estimated_value: { type: "number", description: "Valor estimado da causa em BRL, 0 se desconhecido" },
            score: { type: "integer", description: "0-100, qualidade do lead" },
            qualified: { type: "boolean", description: "true se há informação suficiente para gerar proposta" },
          },
          required: ["legal_area", "urgency", "description", "score", "qualified"],
        },
      },
    }]);

    const args = JSON.parse(aiRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");

    const { data: conv } = await supabase.from("conversations").select("client_id").eq("id", data.conversationId).single();

    const { data: qual, error } = await supabase.from("lead_qualifications").insert({
      user_id: userId,
      conversation_id: data.conversationId,
      client_id: conv?.client_id ?? null,
      legal_area: args.legal_area,
      urgency: args.urgency,
      description: args.description,
      estimated_value: args.estimated_value ?? null,
      score: args.score ?? 0,
      qualified: args.qualified ?? false,
      raw_data: args,
    }).select().single();

    if (error) throw new Error(error.message);
    return { qualification: qual };
  });

/** Agente Proposta: gera proposta com base em uma qualificação */
export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ qualificationId: z.string().uuid(), clientId: z.string().uuid().optional(), caseId: z.string().uuid().optional() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("ai_agent_settings").select("*").eq("user_id", userId).maybeSingle();
    const model = settings?.ai_model ?? "google/gemini-3-flash-preview";
    const proposalPrompt = settings?.proposal_prompt ??
      "Você é um advogado experiente. Gere uma proposta de honorários profissional.";

    const { data: qual } = await supabase
      .from("lead_qualifications").select("*").eq("id", data.qualificationId).single();
    if (!qual) throw new Error("Qualificação não encontrada");

    const aiRes = await callAI(model, [
      { role: "system", content: proposalPrompt },
      { role: "user", content: `Área: ${qual.legal_area}\nUrgência: ${qual.urgency}\nDescrição: ${qual.description}\nValor estimado: R$ ${qual.estimated_value ?? "não informado"}` },
    ], [{
      type: "function",
      function: {
        name: "create_proposal",
        description: "Cria proposta de honorários",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            scope: { type: "string", description: "Escopo de atuação detalhado" },
            value: { type: "number", description: "Valor dos honorários em BRL" },
            payment_terms: { type: "string", description: "Forma de pagamento" },
            estimated_duration: { type: "string", description: "Prazo estimado" },
          },
          required: ["title", "scope", "value", "payment_terms", "estimated_duration"],
        },
      },
    }]);

    const args = JSON.parse(aiRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");

    const { data: prop, error } = await supabase.from("proposals").insert({
      user_id: userId,
      case_id: data.caseId ?? qual.case_id ?? null,
      client_id: data.clientId ?? qual.client_id ?? null,
      title: args.title,
      scope: args.scope,
      value: args.value,
      payment_terms: args.payment_terms,
      estimated_duration: args.estimated_duration,
      status: "rascunho",
      ai_generated: true,
    }).select().single();

    if (error) throw new Error(error.message);
    return { proposal: prop };
  });
