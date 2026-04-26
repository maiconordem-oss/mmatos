/**
 * Funnel Executor — Motor de atendimento automático via WhatsApp
 *
 * Fluxo por mensagem recebida:
 * 1. Carrega estado da conversa (fase, dados, mídias enviadas, histórico)
 * 2. Chama IA com prompt da persona + contexto completo
 * 3. Executa resposta: texto → mídias → texto_pos_midia → ação
 * 4. Atualiza cliente + caso no Kanban com dados extraídos
 * 5. Salva novo estado
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
  name: string;
  persona_prompt: string;
  proposal_value: number | null;
  proposal_is_free: boolean;
  zapsign_template_id: string | null;
  media_video_abertura: string | null;
  media_video_conexao: string | null;
  media_audio_fechamento: string | null;
  media_video_documentos: string | null;
};

// ── Mapeamento fase → coluna Kanban ────────────────────────────
const FASE_TO_STAGE: Record<string, string> = {
  abertura:   "lead",
  triagem:    "lead",
  conexao:    "qualificacao",
  fechamento: "qualificacao",
  coleta:     "proposta",
  assinatura: "em_andamento",
  encerrado:  "em_andamento",
};

// ── Verificar horário de atendimento ───────────────────────────
function isWithinWorkingHours(funnel: any): boolean {
  if (!funnel.working_hours_start || !funnel.working_hours_end) return true;

  const now   = new Date();
  // Horário de Brasília (UTC-3)
  const brt   = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day   = brt.getDay(); // 0=Dom, 1=Seg...6=Sab
  const hhmm  = brt.getHours() * 60 + brt.getMinutes();

  const [startH, startM] = (funnel.working_hours_start as string).split(":").map(Number);
  const [endH,   endM  ] = (funnel.working_hours_end   as string).split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin   = endH   * 60 + endM;

  const days: number[] = funnel.working_days ?? [1,2,3,4,5,6];
  if (!days.includes(day)) return false;
  return hhmm >= startMin && hhmm <= endMin;
}

// ── Agendar follow-up ──────────────────────────────────────────
async function scheduleFollowup(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnelId: string | null,
  followupHours: number
) {
  const scheduledAt = new Date(Date.now() + followupHours * 60 * 60 * 1000).toISOString();
  // Substituir follow-up pendente se existir
  await admin.from("funnel_followups")
    .delete().eq("conversation_id", convId).eq("sent", false);
  await admin.from("funnel_followups").insert({
    user_id: userId, conversation_id: convId,
    funnel_id: funnelId, scheduled_at: scheduledAt, sent: false,
  });
}

// ── Cancelar follow-up quando cliente responde ─────────────────
async function cancelFollowup(admin: SupabaseClient<any, any, any>, convId: string) {
  await admin.from("funnel_followups")
    .delete().eq("conversation_id", convId).eq("sent", false);
}

// ── Notificar Dr. Maicon quando contrato gerado ───────────────
async function notifyOwner(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  notifyPhone: string,
  dados: Record<string, any>,
  convId: string
) {
  if (!notifyPhone) return;
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();
  if (!inst?.api_url) return;

  const nome     = dados.nome ?? "Lead";
  const crianca  = dados.nomeCrianca ? ` (${dados.nomeCrianca})` : "";
  const phone    = await admin.from("conversations").select("phone").eq("id", convId).single()
    .then(r => r.data?.phone ?? "");

  const msg = `✅ *Novo contrato gerado!*\n\nCliente: *${nome}*${crianca}\nWhatsApp: ${phone}\n\nAcesse o sistema para acompanhar.`;

  try {
    await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: notifyPhone.replace(/\D/g, ""), text: msg }),
    });
  } catch { /* non-fatal */ }
}

// ── Sincronizar cliente e caso no Kanban ───────────────────────
async function syncCRM(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  dados: Record<string, any>,
  fase: string,
  funnelName: string
) {
  try {
    // 1. Upsert cliente
    const nome = dados.nome as string | undefined;
    const phone = await admin.from("conversations").select("phone").eq("id", convId).single()
      .then(r => r.data?.phone ?? "");

    let clientId: string | null = null;

    // Buscar cliente existente pelo telefone
    const { data: existingClient } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("whatsapp", phone)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
      // Atualizar dados progressivamente
      const patch: Record<string, any> = {};
      if (nome)            patch.full_name  = nome;
      if (dados.cpf)       patch.document   = dados.cpf;
      if (dados.endereco)  patch.address    = dados.endereco;
      if (dados.email)     patch.email      = dados.email;
      if (Object.keys(patch).length > 0) {
        await admin.from("clients").update(patch).eq("id", clientId);
      }
    } else if (nome || phone) {
      const { data: newClient } = await admin.from("clients").insert({
        user_id:   userId,
        full_name: nome ?? phone,
        whatsapp:  phone,
        phone:     phone,
        document:  dados.cpf ?? null,
        address:   dados.endereco ?? null,
      }).select("id").single();
      clientId = newClient?.id ?? null;

      // Vincular conversa ao cliente
      if (clientId) {
        await admin.from("conversations").update({ client_id: clientId }).eq("id", convId);
      }
    }

    // 2. Upsert caso no Kanban
    const stage = FASE_TO_STAGE[fase] ?? "lead";
    const caseTitle = dados.nomeCrianca
      ? `Vaga em creche — ${dados.nomeCrianca}${dados.municipio ? ` (${dados.municipio})` : ""}`
      : dados.nome
        ? `Caso ${funnelName} — ${dados.nome}`
        : `Novo lead via WhatsApp — ${phone}`;

    // Buscar caso existente vinculado à conversa
    const { data: existingCase } = await admin
      .from("cases")
      .select("id, stage")
      .eq("user_id", userId)
      .eq("client_id", clientId ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCase) {
      // Só avança de fase, nunca volta
      const stageOrder = ["lead","qualificacao","proposta","em_andamento","aguardando","concluido"];
      const currentIdx = stageOrder.indexOf(existingCase.stage);
      const newIdx     = stageOrder.indexOf(stage);
      const patch: Record<string, any> = { title: caseTitle };
      if (newIdx > currentIdx) patch.stage = stage;
      if (dados.nomeCrianca) patch.description = JSON.stringify(dados, null, 2);
      await admin.from("cases").update(patch).eq("id", existingCase.id);
    } else if (clientId) {
      await admin.from("cases").insert({
        user_id:     userId,
        client_id:   clientId,
        title:       caseTitle,
        stage:       stage,
        area:        dados.municipio ? "outro" : "outro",
        priority:    "media",
        description: JSON.stringify(dados, null, 2),
      });
    }
  } catch (e) {
    console.error("syncCRM error:", e);
    // Não fatal — não interrompe o atendimento
  }
}

// ── Enviar "digitando..." + texto via Evolution API ────────────
async function sendText(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  text: string,
  withTyping = true
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
    last_message_at:      new Date().toISOString(),
    last_message_preview: text.slice(0, 80),
    ai_handled:           true,
  }).eq("id", convId);

  if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

  const base = inst.api_url.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey: inst.api_key };

  try {
    // Enviar "digitando..." por tempo proporcional ao texto
    if (withTyping) {
      await fetch(`${base}/chat/presence/${inst.instance_name}`, {
        method: "POST", headers,
        body: JSON.stringify({ number: conv.phone, options: { presence: "composing" } }),
      }).catch(() => {});
      const typingMs = Math.min(Math.max(text.length * 30, 800), 3500);
      await new Promise(r => setTimeout(r, typingMs));
    }

    // Enviar mensagem
    await fetch(`${base}/message/sendText/${inst.instance_name}`, {
      method: "POST", headers,
      body: JSON.stringify({ number: conv.phone, text }),
    });

    // Parar "digitando..."
    await fetch(`${base}/chat/presence/${inst.instance_name}`, {
      method: "POST", headers,
      body: JSON.stringify({ number: conv.phone, options: { presence: "paused" } }),
    }).catch(() => {});
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
  const apiKey = process.env.LOVABLE_API_KEY ?? "lovable-internal";

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

  let res: Response;
  try {
    res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages, max_tokens: 1500 }),
    });
  } catch (networkErr) {
    console.error("Erro de rede ao chamar IA:", networkErr);
    throw new Error("Erro de rede");
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error(`IA erro [${res.status}]:`, errText);
    throw new Error(`IA [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  let raw = (data.choices?.[0]?.message?.content ?? "{}").trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const p = JSON.parse(raw) as AiReply;
    return {
      texto:           p.texto ?? "",
      midias:          Array.isArray(p.midias) ? p.midias : [],
      texto_pos_midia: p.texto_pos_midia ?? null,
      nova_fase:       p.nova_fase ?? null,
      acao:            p.acao ?? null,
      dados_extraidos: p.dados_extraidos ?? {},
    };
  } catch {
    // Se a IA retornou texto puro (não JSON), tratar como texto simples
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

  const valor      = funnel.proposal_is_free ? 0 : (funnel.proposal_value ?? 0);
  const valorTexto = funnel.proposal_is_free
    ? "Gratuito — honorários pagos pelo município em caso de êxito"
    : `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const caseTitle = dados.nomeCrianca
    ? `Ação de vaga em creche — ${dados.nomeCrianca}`
    : `Ação judicial — ${dados.nome ?? "Cliente"}`;

  // Criar proposta vinculada ao cliente já existente
  const { data: prop } = await admin.from("proposals").insert({
    user_id:            userId,
    client_id:          conv?.client_id ?? null,
    title:              caseTitle,
    scope:              dados.nomeCrianca
      ? `Ação judicial para garantir vaga em creche pública ao(à) ${dados.nomeCrianca} em ${dados.municipio ?? ""}`
      : `Ação judicial — ${funnel.name}`,
    value:              valor,
    payment_terms:      valorTexto,
    estimated_duration: "30 a 60 dias",
    status:             "enviado",
    ai_generated:       true,
  }).select().single();

  // Avançar caso no Kanban para "Em andamento"
  if (conv?.client_id) {
    const { data: caso } = await admin.from("cases")
      .select("id").eq("user_id", userId).eq("client_id", conv.client_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (caso) {
      await admin.from("cases").update({ stage: "em_andamento" }).eq("id", caso.id);
    }
  }

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
  userMessage: string,
  instanceFunnelId: string | null = null
) {
  // ── Verificar se IA está pausada (atendimento humano) ────────
  const { data: convCheck } = await admin
    .from("conversations").select("ai_paused").eq("id", convId).single();
  if ((convCheck as any)?.ai_paused) return;

  // ── Cancelar follow-up pendente (cliente respondeu) ──────────
  await cancelFollowup(admin, convId);

  // 1. Carregar ou criar estado
  const { data: existing } = await admin
    .from("funnel_states").select("*").eq("conversation_id", convId).maybeSingle();

  let state: FunnelState;
  let funnel: any = null;

  if (existing) {
    if (existing.fase === "encerrado") return;
    state = {
      id: existing.id,
      funnel_id: existing.funnel_id,
      fase: existing.fase,
      dados: existing.dados ?? {},
      midias_enviadas: existing.midias_enviadas ?? [],
      historico: existing.historico ?? [],
    };
  } else {
    let funnelId = instanceFunnelId;
    if (!funnelId) {
      const { data: defaultFunnel } = await admin
        .from("funnels").select("id")
        .eq("user_id", userId).eq("is_active", true).eq("is_default", true)
        .limit(1).maybeSingle();
      funnelId = defaultFunnel?.id ?? null;
    }

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
    funnel = f;
  }

  if (!funnel?.persona_prompt) {
    console.error("Funnel executor: nenhum funil para userId:", userId);
    return;
  }

  // ── Verificar horário de atendimento ─────────────────────────
  if (!isWithinWorkingHours(funnel)) {
    const msg = funnel.outside_hours_msg ||
      "Olá! Recebemos sua mensagem. O Dr. Maicon retorna no horário de atendimento.";
    await sendText(admin, userId, convId, msg, false);
    return;
  }

  // 3. Chamar IA
  let reply: AiReply;
  try {
    reply = await callAI(funnel.persona_prompt, state, userMessage);
  } catch (e: any) {
    console.error("Funnel executor - erro IA:", e?.message ?? e);
    return;
  }

  // 4. Texto inicial com typing indicator
  if (reply.texto?.trim()) {
    await sendText(admin, userId, convId, reply.texto);
  }

  // 5. Mídias com delay entre elas
  const novasMidias: string[] = [];
  for (const key of reply.midias) {
    if (!state.midias_enviadas.includes(key)) {
      await new Promise(r => setTimeout(r, 1000));
      await sendMedia(admin, userId, convId, key, funnel);
      novasMidias.push(key);
    }
  }

  // 6. texto_pos_midia com delay
  if (reply.texto_pos_midia?.trim() && novasMidias.length > 0) {
    await new Promise(r => setTimeout(r, 2000));
    await sendText(admin, userId, convId, reply.texto_pos_midia);
  }

  // 7. Ação: gerar contrato + notificar
  if (reply.acao === "gerar_contrato") {
    const dadosCompletos = { ...state.dados, ...reply.dados_extraidos };
    await gerarContrato(admin, userId, convId, funnel, dadosCompletos);
    if (funnel.notify_phone) {
      await notifyOwner(admin, userId, funnel.notify_phone, dadosCompletos, convId);
    }
  }

  // 8. Salvar novo estado
  const novosDados = { ...state.dados, ...reply.dados_extraidos };
  const novaFase   = reply.nova_fase ?? state.fase;

  await admin.from("funnel_states").update({
    fase:            novaFase,
    dados:           novosDados,
    midias_enviadas: [...state.midias_enviadas, ...novasMidias],
    historico: [
      ...state.historico,
      { role: "user",      content: userMessage },
      { role: "assistant", content: reply.texto + (reply.texto_pos_midia ? "\n" + reply.texto_pos_midia : "") },
    ].slice(-60),
    updated_at: new Date().toISOString(),
  }).eq("id", state.id);

  // 9. Sincronizar CRM
  if (Object.keys(reply.dados_extraidos).length > 0 || reply.nova_fase) {
    await syncCRM(admin, userId, convId, novosDados, novaFase, funnel.name);
  }

  // 10. Agendar follow-up
  if (novaFase !== "encerrado" && novaFase !== "assinatura" && (funnel.followup_hours ?? 0) > 0) {
    await scheduleFollowup(admin, userId, convId, state.funnel_id, funnel.followup_hours);
  }
}
