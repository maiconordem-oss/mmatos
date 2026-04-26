/**
 * AI Workflow Executor — Arquitetura de Estado Semântico
 * Baseado no prompt v3.0 de Maicon Matos Advocacia.
 *
 * Cada mensagem inbound dispara:
 * 1. Carrega estado semântico da conversa (fase, dados, mídias enviadas, histórico)
 * 2. Chama IA com contexto completo → recebe JSON estruturado
 * 3. Envia texto, mídias e texto_pos_midia em sequência
 * 4. Salva novo estado
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type AiResponse = {
  texto: string;
  midias: string[];
  texto_pos_midia: string | null;
  nova_fase: string | null;
  acao: string | null;
  dados_extraidos: Record<string, any>;
};

type ConvState = {
  id: string;
  fase: string;
  dados_extraidos: Record<string, any>;
  midias_enviadas: string[];
  historico: Array<{ role: string; content: string }>;
  workflow_id: string | null;
};

// ── Envio de texto via Evolution API ─────────────────────────
async function sendText(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  conversationId: string,
  text: string
) {
  if (!text?.trim()) return;

  const { data: conv } = await admin.from("conversations").select("phone").eq("id", conversationId).single();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  // Salvar no banco sempre
  await admin.from("messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    direction: "outbound",
    content: text,
    status: inst?.api_url ? "sent" : "pending",
  });

  await admin.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: text.slice(0, 80),
    ai_handled: true,
  }).eq("id", conversationId);

  if (!conv || !inst?.api_url || !inst?.api_key) return;

  try {
    await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: conv.phone, text }),
    });
  } catch { /* non-fatal */ }
}

// ── Envio de mídia via Evolution API ─────────────────────────
async function sendMedia(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  conversationId: string,
  mediaKey: string,
  workflowId: string | null
) {
  // Buscar configuração da mídia
  let mediaUrl: string | null = null;
  let mediaType = "video";
  let caption = "";

  if (workflowId) {
    const { data: media } = await admin
      .from("workflow_medias")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("media_key", mediaKey)
      .maybeSingle();

    if (media) {
      mediaUrl = media.url;
      mediaType = media.media_type;
      caption = media.caption ?? "";
    }
  }

  const { data: conv } = await admin.from("conversations").select("phone").eq("id", conversationId).single();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  if (!mediaUrl) {
    // Placeholder: envia aviso de que o vídeo será disponibilizado em breve
    const placeholderMsg = `[${mediaKey.replace(/_/g, " ")}] — Em breve disponível.`;
    await sendText(admin, userId, conversationId, placeholderMsg);
    return;
  }

  // Salvar no banco
  await admin.from("messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    direction: "outbound",
    content: caption || `[${mediaType}]`,
    media_url: mediaUrl,
    status: inst?.api_url ? "sent" : "pending",
  });

  if (!conv || !inst?.api_url || !inst?.api_key) return;

  try {
    const endpoint = mediaType === "audio"
      ? `/message/sendWhatsAppAudio/${inst.instance_name}`
      : `/message/sendMedia/${inst.instance_name}`;

    await fetch(`${inst.api_url.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({
        number: conv.phone,
        mediatype: mediaType,
        media: mediaUrl,
        caption,
      }),
    });
  } catch { /* non-fatal */ }
}

// ── Chamar IA com estado completo ─────────────────────────────
async function callAI(
  personaPrompt: string,
  state: ConvState,
  newUserMessage: string
): Promise<AiResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  // Injetar contexto de estado no system prompt
  const stateContext = `
═══════════════════════════════════
ESTADO ATUAL DA CONVERSA
═══════════════════════════════════
fase atual: ${state.fase}
dados já coletados: ${JSON.stringify(state.dados_extraidos, null, 2)}
mídias já enviadas: ${state.midias_enviadas.length > 0 ? state.midias_enviadas.join(", ") : "nenhuma"}

IMPORTANTE: Responda APENAS com JSON válido conforme o formato especificado.
Não envie a mesma mídia que já está em midiasJaEnviadas.
`.trim();

  const systemPrompt = `${personaPrompt}\n\n${stateContext}`;

  // Histórico da conversa (últimas 20 mensagens)
  const history = state.historico.slice(-20);

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: newUserMessage },
  ];

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-preview",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Erro IA [${res.status}]: ${t}`);
  }

  const data = await res.json();
  let raw = data.choices?.[0]?.message?.content ?? "{}";

  // Limpar markdown caso a IA envolva em ```json
  raw = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(raw) as AiResponse;
    return {
      texto: parsed.texto ?? "",
      midias: Array.isArray(parsed.midias) ? parsed.midias : [],
      texto_pos_midia: parsed.texto_pos_midia ?? null,
      nova_fase: parsed.nova_fase ?? null,
      acao: parsed.acao ?? null,
      dados_extraidos: parsed.dados_extraidos ?? {},
    };
  } catch {
    // Fallback: tratar como texto simples
    return {
      texto: raw,
      midias: [],
      texto_pos_midia: null,
      nova_fase: null,
      acao: null,
      dados_extraidos: {},
    };
  }
}

// ── Gerar contrato via ZapSign ────────────────────────────────
async function gerarContrato(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  conversationId: string,
  workflowId: string | null,
  dados: Record<string, any>
): Promise<string | null> {
  if (!workflowId) return null;

  // Buscar template ZapSign padrão do workflow
  const { data: wf } = await admin.from("workflows").select("*").eq("id", workflowId).single();
  const proposalIsFree = wf?.proposal_is_free ?? false;
  const proposalValue = wf?.proposal_value ?? 0;

  // Buscar cliente ou criar
  const { data: conv } = await admin
    .from("conversations")
    .select("client_id, phone, contact_name")
    .eq("id", conversationId)
    .single();

  // Criar proposta
  const { data: prop } = await admin.from("proposals").insert({
    user_id: userId,
    client_id: conv?.client_id ?? null,
    title: `Ação de vaga em creche — ${dados.nomeCrianca ?? "criança"}`,
    scope: `Ação judicial para garantir vaga em creche pública ao(à) ${dados.nomeCrianca ?? "criança"} no município de ${dados.municipio ?? ""}`,
    value: proposalValue,
    payment_terms: proposalIsFree ? "Gratuito — honorários pagos pelo município em caso de êxito" : `R$ ${Number(proposalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    estimated_duration: "30 a 60 dias até liminar",
    status: "enviado",
    ai_generated: true,
  }).select().single();

  // Buscar template ZapSign
  const { data: tpl } = await admin
    .from("zapsign_templates")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!tpl || !process.env.ZAPSIGN_API_TOKEN) {
    // Sem ZapSign configurado: retornar link placeholder
    return null;
  }

  try {
    const signerName = dados.nome ?? conv?.contact_name ?? "Cliente";
    const signerPhone = conv?.phone ?? "";

    const payload = {
      template_id: tpl.zapsign_template_id,
      signer_name: signerName,
      signer_phone_number: signerPhone,
      data: [
        { de: "nome", para: signerName },
        { de: "nomeCrianca", para: dados.nomeCrianca ?? "" },
        { de: "cpf", para: dados.cpf ?? "" },
        { de: "rg", para: dados.rg ?? "" },
        { de: "estadoCivil", para: dados.estadoCivil ?? "" },
        { de: "profissao", para: dados.profissao ?? "" },
        { de: "endereco", para: dados.endereco ?? "" },
        { de: "municipio", para: dados.municipio ?? "" },
        { de: "creche", para: dados.creche ?? "" },
        { de: "valor", para: proposalIsFree ? "Gratuito" : `R$ ${Number(proposalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
      ],
    };

    const res = await fetch("https://api.zapsign.com.br/api/v1/models/create-doc/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ZAPSIGN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    const signingUrl = json.signers?.[0]?.sign_url ?? null;
    const zapsignDocId = json.open_id?.toString() ?? json.token ?? null;

    if (prop) {
      await admin.from("contracts").insert({
        user_id: userId,
        client_id: conv?.client_id ?? null,
        proposal_id: prop.id,
        template_id: tpl.id,
        zapsign_document_id: zapsignDocId,
        signing_url: signingUrl,
        status: zapsignDocId ? "enviado" : "pendente",
        sent_at: zapsignDocId ? new Date().toISOString() : null,
        variables: payload.data,
      });
    }

    return signingUrl;
  } catch (e) {
    console.error("ZapSign error:", e);
    return null;
  }
}

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────
export async function handleAiConversation(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  conversationId: string,
  userMessage: string
) {
  // 1. Carregar ou criar estado da conversa
  let state: ConvState;

  const { data: existing } = await admin
    .from("ai_conversation_states")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (existing) {
    state = {
      id: existing.id,
      fase: existing.fase,
      dados_extraidos: existing.dados_extraidos ?? {},
      midias_enviadas: existing.midias_enviadas ?? [],
      historico: existing.historico ?? [],
      workflow_id: existing.workflow_id,
    };
  } else {
    // Novo: detectar workflow pelo nome do canal/anúncio ou usar default
    const { data: wf } = await admin
      .from("workflows")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    const { data: newState } = await admin
      .from("ai_conversation_states")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        workflow_id: wf?.id ?? null,
        fase: "abertura",
        dados_extraidos: {},
        midias_enviadas: [],
        historico: [],
      })
      .select()
      .single();

    state = {
      id: newState?.id ?? "",
      fase: "abertura",
      dados_extraidos: {},
      midias_enviadas: [],
      historico: [],
      workflow_id: wf?.id ?? null,
    };
  }

  // Se encerrado, não responder mais
  if (state.fase === "encerrado") return;

  // 2. Buscar persona_prompt do workflow
  let personaPrompt = "";
  if (state.workflow_id) {
    const { data: wf } = await admin
      .from("workflows")
      .select("persona_prompt")
      .eq("id", state.workflow_id)
      .single();
    personaPrompt = wf?.persona_prompt ?? "";
  }

  if (!personaPrompt) {
    // Fallback genérico
    personaPrompt = `Você é o Dr. Maicon Matos, advogado. Atenda o cliente com cordialidade e segurança jurídica.
Responda SEMPRE com JSON válido no formato:
{"texto":"...","midias":[],"texto_pos_midia":null,"nova_fase":null,"acao":null,"dados_extraidos":{}}`;
  }

  // 3. Chamar IA
  let aiResponse: AiResponse;
  try {
    aiResponse = await callAI(personaPrompt, state, userMessage);
  } catch (e: any) {
    console.error("AI error:", e);
    await sendText(admin, userId, conversationId, "Estou com uma instabilidade. Tente novamente em instantes.");
    return;
  }

  // 4. Enviar texto inicial
  if (aiResponse.texto?.trim()) {
    await sendText(admin, userId, conversationId, aiResponse.texto);
  }

  // 5. Enviar mídias (excluindo as já enviadas)
  const novasMidias: string[] = [];
  for (const mediaKey of aiResponse.midias) {
    if (!state.midias_enviadas.includes(mediaKey)) {
      await sendMedia(admin, userId, conversationId, mediaKey, state.workflow_id);
      novasMidias.push(mediaKey);
    }
  }

  // 6. Enviar texto_pos_midia (após mídias)
  if (aiResponse.texto_pos_midia?.trim() && novasMidias.length > 0) {
    await sendText(admin, userId, conversationId, aiResponse.texto_pos_midia);
  }

  // 7. Processar ação especial
  if (aiResponse.acao === "gerar_contrato") {
    const link = await gerarContrato(
      admin, userId, conversationId,
      state.workflow_id,
      { ...state.dados_extraidos, ...aiResponse.dados_extraidos }
    );

    if (link) {
      await sendText(admin, userId, conversationId, `Segue o link para assinatura digital:\n\n${link}`);
    } else {
      await sendText(admin, userId, conversationId, "Os documentos estão sendo preparados. Enviarei o link em breve.");
    }
  }

  // 8. Atualizar estado
  const novosDados = { ...state.dados_extraidos, ...aiResponse.dados_extraidos };
  const novaFase = aiResponse.nova_fase ?? state.fase;
  const novasMidiasEnviadas = [...state.midias_enviadas, ...novasMidias];
  const novoHistorico = [
    ...state.historico,
    { role: "user", content: userMessage },
    {
      role: "assistant",
      content: JSON.stringify({
        texto: aiResponse.texto,
        texto_pos_midia: aiResponse.texto_pos_midia,
        nova_fase: aiResponse.nova_fase,
        midias: aiResponse.midias,
      }),
    },
  ].slice(-60); // Manter últimas 60 mensagens

  await admin.from("ai_conversation_states").update({
    fase: novaFase,
    dados_extraidos: novosDados,
    midias_enviadas: novasMidiasEnviadas,
    historico: novoHistorico,
    updated_at: new Date().toISOString(),
  }).eq("id", state.id);
}
