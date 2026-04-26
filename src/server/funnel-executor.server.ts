/**
 * Funnel Executor — Motor de atendimento automático via WhatsApp
 * 
 * Fluxo por mensagem recebida:
 * 1. Carrega estado da conversa (fase, dados, mídias enviadas, histórico)
 * 2. Chama IA com prompt da persona + contexto completo
 * 3. Executa resposta: texto → mídias → texto_pos_midia → ação
 * 4. Salva novo estado
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Tipos ──────────────────────────────────────────────────────
type AiReply = {
  texto: string;
  midias: string[];
  texto_pos_midia: string | null;
  nova_fase: string | null;
  acao: string | null;
  dados_extraidos: Record<string, any>;
};

type FunnelState = {
  id: string;
  funnel_id: string | null;
  fase: string;
  dados: Record<string, any>;
  midias_enviadas: string[];
  historico: Array<{ role: string; content: string }>;
};

type Funnel = {
  id: string;
  persona_prompt: string;
  proposal_value: number | null;
  proposal_is_free: boolean;
  zapsign_template_id: string | null;
  media_video_abertura: string | null;
  media_video_conexao: string | null;
  media_audio_fechamento: string | null;
  media_video_documentos: string | null;
};

// ── Enviar texto via Evolution API ─────────────────────────────
async function sendText(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  text: string
) {
  if (!text?.trim()) return;

  const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();

  // Salvar mensagem no banco
  await admin.from("messages").insert({
    user_id: userId, conversation_id: convId,
    direction: "outbound", content: text,
    status: inst?.api_url ? "sent" : "pending",
  });
  await admin.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: text.slice(0, 80),
    ai_handled: true,
  }).eq("id", convId);

  if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

  // Enviar via Evolution API
  try {
    await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: conv.phone, text }),
    });
  } catch { /* non-fatal */ }
}

// ── Enviar mídia via Evolution API ─────────────────────────────
async function sendMedia(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  mediaKey: string,
  funnel: Funnel
) {
  // Mapear chave → URL e tipo
  const mediaMap: Record<string, { url: string | null; type: string; label: string }> = {
    video_abertura:   { url: funnel.media_video_abertura,   type: "video", label: "vídeo de apresentação" },
    video_conexao:    { url: funnel.media_video_conexao,    type: "video", label: "vídeo sobre o caso" },
    audio_fechamento: { url: funnel.media_audio_fechamento, type: "audio", label: "áudio de avaliação" },
    video_documentos: { url: funnel.media_video_documentos, type: "video", label: "vídeo sobre documentos" },
  };

  const media = mediaMap[mediaKey];
  if (!media) return;

  if (!media.url) {
    // Placeholder — avisa que vídeo chegará em breve, não trava o fluxo
    await sendText(admin, userId, convId, `[${media.label} em breve disponível]`);
    return;
  }

  const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();

  // Salvar no banco
  await admin.from("messages").insert({
    user_id: userId, conversation_id: convId,
    direction: "outbound", content: `[${media.type}]`,
    media_url: media.url, status: inst?.api_url ? "sent" : "pending",
  });

  if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

  try {
    if (media.type === "audio") {
      await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendWhatsAppAudio/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({ number: conv.phone, audio: media.url }),
      });
    } else {
      await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendMedia/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({ number: conv.phone, mediatype: "video", media: media.url }),
      });
    }
  } catch { /* non-fatal */ }
}

// ── Chamar IA ──────────────────────────────────────────────────
async function callAI(
  personaPrompt: string,
  state: FunnelState,
  userMessage: string
): Promise<AiReply> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const contextBlock = `
═══════════════════════════
ESTADO ATUAL DA CONVERSA
═══════════════════════════
fase: ${state.fase}
dados coletados: ${JSON.stringify(state.dados)}
mídias já enviadas: ${state.midias_enviadas.join(", ") || "nenhuma"}
ATENÇÃO: Nunca envie mídia que já está em "mídias já enviadas".
Responda APENAS com JSON válido no formato especificado. Nenhum texto fora do JSON.`;

  const messages = [
    { role: "system", content: personaPrompt + "\n\n" + contextBlock },
    ...state.historico.slice(-30),
    { role: "user", content: userMessage },
  ];

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash-preview", messages, max_tokens: 1000 }),
  });

  if (!res.ok) throw new Error(`IA [${res.status}]: ${await res.text()}`);

  const data = await res.json();
  let raw = (data.choices?.[0]?.message?.content ?? "{}").trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const p = JSON.parse(raw) as AiReply;
    return {
      texto:          p.texto ?? "",
      midias:         Array.isArray(p.midias) ? p.midias : [],
      texto_pos_midia: p.texto_pos_midia ?? null,
      nova_fase:      p.nova_fase ?? null,
      acao:           p.acao ?? null,
      dados_extraidos: p.dados_extraidos ?? {},
    };
  } catch {
    return { texto: raw, midias: [], texto_pos_midia: null, nova_fase: null, acao: null, dados_extraidos: {} };
  }
}

// ── Gerar e enviar contrato ────────────────────────────────────
async function gerarContrato(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnel: Funnel,
  dados: Record<string, any>
): Promise<void> {
  const { data: conv } = await admin
    .from("conversations").select("client_id, phone, contact_name").eq("id", convId).single();

  const valor = funnel.proposal_is_free ? 0 : (funnel.proposal_value ?? 0);
  const valorTexto = funnel.proposal_is_free
    ? "Gratuito — honorários pagos pelo município em caso de êxito"
    : `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  // Criar proposta
  const { data: prop } = await admin.from("proposals").insert({
    user_id: userId,
    client_id: conv?.client_id ?? null,
    title: dados.nomeCrianca
      ? `Ação de vaga em creche — ${dados.nomeCrianca}`
      : `Ação judicial — ${dados.nome ?? "Cliente"}`,
    scope: dados.nomeCrianca
      ? `Ação judicial para garantir vaga em creche pública ao(à) ${dados.nomeCrianca} em ${dados.municipio ?? ""}`
      : `Ação judicial para autorização de busca pessoal de medicamento`,
    value: valor,
    payment_terms: valorTexto,
    estimated_duration: "30 a 60 dias",
    status: "enviado",
    ai_generated: true,
  }).select().single();

  // Tentar ZapSign
  const token = process.env.ZAPSIGN_API_TOKEN;
  const tplId = funnel.zapsign_template_id;

  if (!token || !tplId) {
    await sendText(admin, userId, convId,
      "Os documentos estão sendo preparados. Em breve você receberá o link de assinatura."
    );
    return;
  }

  try {
    const signerName = dados.nome ?? conv?.contact_name ?? "Cliente";
    const payload = {
      template_id: tplId,
      signer_name: signerName,
      signer_phone_number: conv?.phone ?? "",
      data: Object.entries(dados).map(([de, para]) => ({ de, para: String(para ?? "") })),
    };

    const r = await fetch("https://api.zapsign.com.br/api/v1/models/create-doc/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    const link = json.signers?.[0]?.sign_url ?? null;

    if (prop) {
      await admin.from("contracts").insert({
        user_id: userId, client_id: conv?.client_id ?? null,
        proposal_id: prop.id,
        zapsign_document_id: json.open_id?.toString() ?? null,
        signing_url: link, status: link ? "enviado" : "pendente",
        sent_at: link ? new Date().toISOString() : null,
      });
    }

    if (link) {
      await sendText(admin, userId, convId,
        `Segue o link para assinatura digital:\n\n${link}\n\nAssine com o dedo mesmo — é rápido e seguro.`
      );
    } else {
      await sendText(admin, userId, convId,
        "Os documentos foram gerados. Em breve você receberá o link de assinatura."
      );
    }
  } catch (e) {
    console.error("ZapSign error:", e);
    await sendText(admin, userId, convId,
      "Os documentos estão sendo preparados. Envio o link em breve."
    );
  }
}

// ── FUNÇÃO PRINCIPAL ───────────────────────────────────────────
export async function handleFunnelMessage(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  userMessage: string
) {
  // 1. Carregar ou criar estado
  const { data: existing } = await admin
    .from("funnel_states").select("*").eq("conversation_id", convId).maybeSingle();

  let state: FunnelState;
  let funnel: Funnel | null = null;

  if (existing) {
    if (existing.fase === "encerrado") return; // não responder mais
    state = {
      id: existing.id,
      funnel_id: existing.funnel_id,
      fase: existing.fase,
      dados: existing.dados ?? {},
      midias_enviadas: existing.midias_enviadas ?? [],
      historico: existing.historico ?? [],
    };
  } else {
    // Detectar funil: pegar default do usuário
    const { data: defaultFunnel } = await admin
      .from("funnels").select("id")
      .eq("user_id", userId).eq("is_active", true).eq("is_default", true)
      .limit(1).maybeSingle();

    const funnelId = defaultFunnel?.id ?? null;

    const { data: newState } = await admin.from("funnel_states").insert({
      user_id: userId, conversation_id: convId, funnel_id: funnelId,
      fase: "abertura", dados: {}, midias_enviadas: [], historico: [],
    }).select().single();

    state = {
      id: newState?.id ?? crypto.randomUUID(),
      funnel_id: funnelId,
      fase: "abertura", dados: {}, midias_enviadas: [], historico: [],
    };
  }

  // 2. Carregar funil
  if (state.funnel_id) {
    const { data: f } = await admin.from("funnels").select("*").eq("id", state.funnel_id).single();
    funnel = f as Funnel;
  }

  if (!funnel?.persona_prompt) {
    // Sem funil configurado
    await sendText(admin, userId, convId,
      "Olá! Recebemos sua mensagem. Em breve um de nossos advogados irá retornar."
    );
    return;
  }

  // 3. Chamar IA
  let reply: AiReply;
  try {
    reply = await callAI(funnel.persona_prompt, state, userMessage);
  } catch (e: any) {
    console.error("AI error:", e);
    await sendText(admin, userId, convId, "Tive uma instabilidade. Pode repetir?");
    return;
  }

  // 4. Enviar texto inicial
  if (reply.texto?.trim()) {
    await sendText(admin, userId, convId, reply.texto);
  }

  // 5. Enviar mídias (somente as não enviadas ainda)
  const novasMidias: string[] = [];
  for (const key of reply.midias) {
    if (!state.midias_enviadas.includes(key)) {
      await sendMedia(admin, userId, convId, key, funnel);
      novasMidias.push(key);
    }
  }

  // 6. texto_pos_midia — enviado após as mídias
  if (reply.texto_pos_midia?.trim() && novasMidias.length > 0) {
    // Pequeno delay para parecer natural
    await new Promise((r) => setTimeout(r, 1500));
    await sendText(admin, userId, convId, reply.texto_pos_midia);
  }

  // 7. Ação: gerar contrato
  if (reply.acao === "gerar_contrato") {
    await gerarContrato(admin, userId, convId, funnel, {
      ...state.dados, ...reply.dados_extraidos,
    });
  }

  // 8. Salvar novo estado
  await admin.from("funnel_states").update({
    fase: reply.nova_fase ?? state.fase,
    dados: { ...state.dados, ...reply.dados_extraidos },
    midias_enviadas: [...state.midias_enviadas, ...novasMidias],
    historico: [
      ...state.historico,
      { role: "user", content: userMessage },
      { role: "assistant", content: reply.texto + (reply.texto_pos_midia ? "\n" + reply.texto_pos_midia : "") },
    ].slice(-60),
    updated_at: new Date().toISOString(),
  }).eq("id", state.id);
}
