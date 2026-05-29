import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sendEvolutionText } from "@/server/whatsapp.functions";

const GATEWAY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const FAST_MODEL = "gemini-2.0-flash";

async function callAI(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_KEY não configurada");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: FAST_MODEL, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── F3: Briefing jurídico por área ───────────────────────────────────────────

export const generateLegalBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, phone, contact_name, client_id")
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .single();
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(60);

    const { data: funnelState } = await supabase
      .from("funnel_states")
      .select("dados, fase")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();

    const historyText = (msgs ?? [])
      .filter((m: any) => m.content)
      .map((m: any) => `[${m.direction === "inbound" ? "Cliente" : "Atendente"}]: ${m.content}`)
      .join("\n");

    const dadosContext = funnelState?.dados ? JSON.stringify(funnelState.dados) : "{}";

    const systemPrompt = `Você é um assistente jurídico especializado. Analise a conversa abaixo e extraia um briefing estruturado do caso.

Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "area": "trabalhista|previdenciario|familia|criminal|consumerista|civil|tributario|outro",
  "urgencia": "alta|media|baixa",
  "resumo_caso": "resumo em 2-3 frases",
  "fatos_principais": ["fato 1", "fato 2", ...],
  "documentos_necessarios": ["documento 1", "documento 2", ...],
  "gerado_em": "${new Date().toISOString()}"
}

Dados estruturados coletados: ${dadosContext}`;

    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Conversa:\n${historyText || "(sem mensagens ainda)"}` },
    ]);

    let briefing: any = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      briefing = match ? JSON.parse(match[0]) : { resumo_caso: raw, gerado_em: new Date().toISOString() };
    } catch {
      briefing = { resumo_caso: raw, gerado_em: new Date().toISOString() };
    }

    await supabase
      .from("conversations")
      .update({ briefing })
      .eq("id", data.conversationId);

    return { briefing };
  });

// ── F4: Score de viabilidade do caso ─────────────────────────────────────────

export const evaluateCaseViability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, briefing")
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .single();
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: funnelState } = await supabase
      .from("funnel_states")
      .select("id, dados, fase")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();

    const briefingText = conv.briefing ? JSON.stringify(conv.briefing) : "(sem briefing gerado)";
    const dadosText = funnelState?.dados ? JSON.stringify(funnelState.dados) : "{}";

    const raw = await callAI([
      {
        role: "system",
        content: `Você é um advogado experiente avaliando a viabilidade jurídica de um caso.
Retorne APENAS um JSON válido:
{ "score": <número de 0 a 100>, "notes": "<avaliação em 2-3 frases com pontos fortes e fracos>" }

Critérios: documentação disponível (30%), prazo prescricional (20%), jurisprudência favorável (25%), valor/dano demonstrável (25%).`,
      },
      {
        role: "user",
        content: `Briefing do caso: ${briefingText}\n\nDados coletados: ${dadosText}`,
      },
    ]);

    let score = 0;
    let notes = "";
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      score = Math.min(100, Math.max(0, parseInt(parsed.score ?? "0", 10)));
      notes = parsed.notes ?? raw;
    } catch {
      notes = raw;
    }

    if (funnelState?.id) {
      await supabase
        .from("funnel_states")
        .update({ viability_score: score, viability_notes: notes })
        .eq("id", funnelState.id);
    }

    return { score, notes };
  });

// ── F2: Marcar consulta como realizada → agenda follow-ups ───────────────────

export const markConsultationAttended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    appointmentId: z.string().uuid(),
    conversationId: z.string().uuid(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const now = new Date().toISOString();

    await supabase
      .from("appointments")
      .update({ attended: true, attended_at: now })
      .eq("id", data.appointmentId)
      .eq("user_id", userId);

    await supabase
      .from("conversations")
      .update({ consulta_at: now, post_consulta_stage: null })
      .eq("id", data.conversationId)
      .eq("user_id", userId);

    const { data: appt } = await supabase
      .from("appointments")
      .select("funnel_id")
      .eq("id", data.appointmentId)
      .single();

    let d1msg = "Olá! Espero que a consulta tenha sido útil. Conseguiu pensar melhor sobre o caso? Estou à disposição para qualquer dúvida!";
    let d3msg = "Oi! Passaram alguns dias desde nossa conversa. Conseguiu reunir a documentação que conversamos? Posso ajudar com os próximos passos.";
    let d7msg = "Olá! Quero retomar nosso contato. Sei que decisões jurídicas pedem reflexão — mas quero garantir que você tenha todo o suporte necessário. Ainda posso ajudar?";

    if (appt?.funnel_id) {
      const { data: funnel } = await supabase
        .from("funnels")
        .select("post_consulta_d1_msg, post_consulta_d3_msg, post_consulta_d7_msg")
        .eq("id", appt.funnel_id)
        .single();
      if (funnel?.post_consulta_d1_msg) d1msg = funnel.post_consulta_d1_msg;
      if (funnel?.post_consulta_d3_msg) d3msg = funnel.post_consulta_d3_msg;
      if (funnel?.post_consulta_d7_msg) d7msg = funnel.post_consulta_d7_msg;
    }

    const d1at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const d3at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const d7at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("scheduled_messages").insert([
      { user_id: userId, conversation_id: data.conversationId, content: d1msg, scheduled_at: d1at, status: "pending" },
      { user_id: userId, conversation_id: data.conversationId, content: d3msg, scheduled_at: d3at, status: "pending" },
      { user_id: userId, conversation_id: data.conversationId, content: d7msg, scheduled_at: d7at, status: "pending" },
    ]);

    return { ok: true, followupsScheduled: 3 };
  });

// ── F6: Enviar proposta de honorários ────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  fixo: "Honorário fixo",
  exito: "Êxito (% sobre ganho)",
  mensalidade: "Mensalidade",
  misto: "Misto (fixo + êxito)",
};

export const sendHonorarioProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    conversationId: z.string().uuid(),
    paymentType: z.enum(["fixo", "exito", "mensalidade", "misto"]),
    value: z.number().positive(),
    scope: z.string().min(1),
    details: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, phone, contact_name, client_id, instance_id")
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .single();
    if (!conv) throw new Error("Conversa não encontrada");

    const typeLabel = PAYMENT_TYPE_LABELS[data.paymentType] ?? data.paymentType;
    const valueFormatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data.value);

    const msgLines = [
      `📋 *Proposta de Honorários*`,
      ``,
      `*Tipo:* ${typeLabel}`,
      `*Valor:* ${valueFormatted}`,
      `*Escopo:* ${data.scope}`,
    ];
    if (data.details) msgLines.push(`*Detalhes:* ${data.details}`);
    msgLines.push(``, `Qualquer dúvida sobre os termos, é só perguntar!`);

    const messageText = msgLines.join("\n");

    const { data: proposal } = await supabase
      .from("proposals")
      .insert({
        user_id: userId,
        client_id: conv.client_id,
        title: `Proposta - ${typeLabel}`,
        scope: data.scope,
        value: data.value,
        payment_terms: typeLabel,
        status: "enviada",
        sent_at: new Date().toISOString(),
        ai_generated: false,
      })
      .select("id")
      .single();

    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("api_url, api_key, instance_name, status")
      .eq("id", conv.instance_id)
      .eq("status", "connected")
      .maybeSingle();

    if (inst?.api_url && conv.phone) {
      const now = new Date().toISOString();
      const { data: msg } = await supabase.from("messages").insert({
        user_id: userId,
        conversation_id: data.conversationId,
        direction: "outbound",
        content: messageText,
        status: "pending",
      }).select("id").single();

      await supabase.from("conversations").update({
        last_message_at: now,
        last_message_preview: messageText.slice(0, 80),
      }).eq("id", data.conversationId);

      try {
        const externalId = await sendEvolutionText(inst.api_url, inst.api_key, inst.instance_name, conv.phone, messageText);
        if (msg?.id) {
          await supabase.from("messages").update({ status: "sent", external_id: externalId }).eq("id", msg.id);
        }
      } catch {
        if (msg?.id) {
          await supabase.from("messages").update({ status: "failed" }).eq("id", msg.id);
        }
      }
    }

    return { ok: true, proposalId: proposal?.id ?? null };
  });

// ── F7: Extrair prazo mencionado na conversa ──────────────────────────────────

export const extractMentionedDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), conversationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .single();
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", data.conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(30);

    const historyText = (msgs ?? [])
      .filter((m: any) => m.content)
      .map((m: any) => m.content)
      .join("\n");

    const today = new Date().toISOString().split("T")[0];

    const raw = await callAI([
      {
        role: "system",
        content: `Você analisa mensagens de clientes jurídicos buscando prazos ou datas mencionadas.
Hoje é ${today}. Retorne APENAS JSON:
{ "deadline_at": "<ISO date ou null>", "context": "<trecho exato que menciona o prazo, ou null>" }

Procure por: audiências, vencimentos, prazos prescriticionais, datas de rescisão, vencimentos de contratos, etc.`,
      },
      { role: "user", content: historyText || "(sem mensagens)" },
    ]);

    let deadlineAt: string | null = null;
    let deadlineContext: string | null = null;

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      deadlineAt = parsed.deadline_at || null;
      deadlineContext = parsed.context || null;
    } catch {
      // AI não retornou JSON válido, sem prazo encontrado
    }

    if (deadlineAt) {
      await supabase.from("conversations").update({
        deadline_mentioned_at: deadlineAt,
        deadline_context: deadlineContext,
      }).eq("id", data.conversationId);
    }

    return { found: Boolean(deadlineAt), deadline_at: deadlineAt, context: deadlineContext };
  });

// ── F8: Gestão de equipe ──────────────────────────────────────────────────────

export const listTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional() }).parse)
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("owner_user_id", userId)
      .neq("status", "removido")
      .order("created_at", { ascending: false });
    return { members: data ?? [] };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    email: z.string().email(),
    role: z.enum(["admin", "advogado", "estagiario", "secretaria"]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const existing = await supabase
      .from("team_members")
      .select("id, status")
      .eq("owner_user_id", userId)
      .eq("member_email", data.email)
      .neq("status", "removido")
      .maybeSingle();

    if (existing.data) throw new Error("Este e-mail já foi convidado.");

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: member } = await supabase
      .from("team_members")
      .insert({
        owner_user_id: userId,
        member_email: data.email,
        role: data.role,
        status: "pendente",
        invite_token: token,
        invite_expires_at: expiresAt,
      })
      .select()
      .single();

    return { ok: true, member };
  });

export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    memberId: z.string().uuid(),
    role: z.enum(["admin", "advogado", "estagiario", "secretaria"]),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("team_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("owner_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), memberId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("team_members")
      .update({ status: "removido" })
      .eq("id", data.memberId)
      .eq("owner_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
