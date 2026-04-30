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
import { getAvailableSlots, createCalendarEvent } from "@/server/google-calendar.server";

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
  msg: string
) {
  if (!notifyPhone?.trim()) return;
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();
  if (!inst?.api_url) return;
  try {
    await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: notifyPhone.replace(/\D/g, ""), text: msg, textMessage: { text: msg } }),
    });
  } catch { /* non-fatal */ }
}

const FASE_EMOJIS: Record<string, string> = {
  triagem: "📋", conexao: "🤝", fechamento: "🎯",
  coleta: "📝", assinatura: "✍️", encerrado: "✅",
};
const FASE_LABELS_NOTIF: Record<string, string> = {
  triagem: "Novo lead", conexao: "Lead interessado", fechamento: "Em fechamento",
  coleta: "Coletando dados", assinatura: "Pronto para assinar", encerrado: "Encerrado",
};

async function notifyFaseChange(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  notifyPhone: string,
  novaFase: string,
  dados: Record<string, any>,
  convId: string,
  funnelName: string
) {
  if (!notifyPhone?.trim() || !FASE_LABELS_NOTIF[novaFase]) return;
  const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
  const phone = conv?.phone ?? "";
  const nome = dados.nome ?? phone;
  const extras = [
    dados.nomeCrianca ? `👶 ${dados.nomeCrianca}` : "",
    dados.municipio  ? `📍 ${dados.municipio}`   : "",
  ].filter(Boolean).join(" | ");
  const emoji = FASE_EMOJIS[novaFase] ?? "📌";
  const label = FASE_LABELS_NOTIF[novaFase];
  const msg = `${emoji} *${label}*\n\nFunil: ${funnelName}\nCliente: *${nome}*${extras ? "\n" + extras : ""}\nWhatsApp: ${phone}\n\nAcesse o Inbox para acompanhar.`;
  await notifyOwner(admin, userId, notifyPhone, msg);
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

  // Salvar mensagem no banco SEMPRE
  await admin.from("messages").insert({
    user_id: userId, conversation_id: convId,
    direction: "outbound", content: text,
    status: "sent",
  });
  await admin.from("conversations").update({
    last_message_at:      new Date().toISOString(),
    last_message_preview: text.slice(0, 80),
    ai_handled:           true,
  }).eq("id", convId);

  if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

  const base    = inst.api_url.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey: inst.api_key };
  const number  = conv.phone.replace(/\D/g, "");

  try {
    // Delay de digitação (sem chamar API de presença — pode não existir na versão)
    if (withTyping) {
      const typingMs = Math.min(Math.max(text.length * 25, 600), 2500);
      await new Promise(r => setTimeout(r, typingMs));
    }

    // Tentar endpoint v2 primeiro, fallback para v1
    const res = await fetch(`${base}/message/sendText/${inst.instance_name}`, {
      method: "POST", headers,
      body: JSON.stringify({
        number,
        text,
        // Alguns versões usam textMessage
        textMessage: { text },
        options: { delay: 500 },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Evolution API sendText [${res.status}]:`, errBody);
    }
  } catch (e) {
    console.error("sendText network error:", e);
  }
}

// ── Enviar mídia via Evolution API ─────────────────────────────
async function sendMedia(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  mediaKey: string,
  funnel: any
) {
  // Buscar URL no campo JSONB livre
  const medias: Record<string, string> = funnel.medias ?? {};

  // Fallback para colunas antigas se existirem
  const legacyMap: Record<string, string | null> = {
    video_abertura:   funnel.media_video_abertura   ?? null,
    video_conexao:    funnel.media_video_conexao    ?? null,
    audio_fechamento: funnel.media_audio_fechamento ?? null,
    video_documentos: funnel.media_video_documentos ?? null,
  };

  const mediaUrl = medias[mediaKey] ?? legacyMap[mediaKey] ?? null;

  // Detectar tipo pela chave
  const isAudio = mediaKey.startsWith("audio_") || mediaKey.includes("_audio");
  const mediaType = isAudio ? "audio" : "video";
  const label = mediaKey.replace(/_/g, " ");

  if (!mediaUrl) {
    await sendText(admin, userId, convId, `[${label} — em breve disponível]`, false);
    return;
  }

  const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();

  await admin.from("messages").insert({
    user_id: userId, conversation_id: convId,
    direction: "outbound", content: `[${mediaType}]`,
    media_url: mediaUrl, status: "sent",
  });

  if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

  const number = conv.phone.replace(/\D/g, "");
  const base   = inst.api_url.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey: inst.api_key };

  try {
    if (isAudio) {
      await fetch(`${base}/message/sendWhatsAppAudio/${inst.instance_name}`, {
        method: "POST", headers,
        body: JSON.stringify({ number, audio: mediaUrl }),
      });
    } else {
      await fetch(`${base}/message/sendMedia/${inst.instance_name}`, {
        method: "POST", headers,
        body: JSON.stringify({ number, mediatype: "video", media: mediaUrl }),
      });
    }
  } catch { /* non-fatal */ }
}


// ── Debounce: lock por conversa ────────────────────────────────
async function acquireLock(admin: SupabaseClient<any, any, any>, convId: string): Promise<boolean> {
  try {
    // Limpar locks expirados
    await admin.from("conversation_locks").delete().lt("expires_at", new Date().toISOString());
    // Tentar inserir lock
    const { error } = await admin.from("conversation_locks").insert({
      conversation_id: convId,
      locked_at:       new Date().toISOString(),
      expires_at:      new Date(Date.now() + 30000).toISOString(),
    });
    return !error; // true se conseguiu o lock
  } catch { return false; }
}

async function releaseLock(admin: SupabaseClient<any, any, any>, convId: string) {
  await admin.from("conversation_locks").delete().eq("conversation_id", convId);
}

// ── Chamar IA com retry automático ─────────────────────────────
async function callAI(
  personaPrompt: string,
  state: FunnelState,
  userMessage: string,
  retries = 2
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
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return callAI(personaPrompt, state, userMessage, retries - 1);
    }
    console.error("Erro de rede ao chamar IA:", networkErr);
    throw new Error("Erro de rede");
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`IA erro [${res.status}]:`, errText);
    if (retries > 0 && res.status >= 500) {
      await new Promise(r => setTimeout(r, 2000));
      return callAI(personaPrompt, state, userMessage, retries - 1);
    }
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

// ── Criar grupo WhatsApp com cliente + equipe ─────────────────
async function createWhatsAppGroup(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnel: any,
  dados: Record<string, any>
) {
  if (!funnel.group_enabled) return;

  const participants: string[] = funnel.group_participants ?? [];
  if (participants.length === 0) {
    console.log("createWhatsAppGroup: nenhum participante configurado");
    return;
  }

  try {
    const { data: conv } = await admin
      .from("conversations").select("phone, contact_name").eq("id", convId).single();
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();

    if (!conv?.phone || !inst?.api_url || !inst?.api_key) return;

    const clientPhone = conv.phone.replace(/\D/g, "");
    const nome        = dados.nome ?? conv.contact_name ?? "Cliente";
    const nomeCrianca = dados.nomeCrianca ? ` | ${dados.nomeCrianca}` : "";

    // Montar nome do grupo com template
    const groupName = (funnel.group_name_template ?? "Caso {nome} — Dr. Maicon")
      .replace("{nome}", nome)
      .replace("{nomeCrianca}", dados.nomeCrianca ?? "")
      .replace("{municipio}", dados.municipio ?? "");

    // Montar lista de participantes: cliente + equipe
    const allParticipants = [
      `${clientPhone}@s.whatsapp.net`,
      ...participants.map((p: string) => `${p.replace(/\D/g, "")}@s.whatsapp.net`),
    ];

    const base    = inst.api_url.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", apikey: inst.api_key };

    // Criar grupo via Evolution API
    const res = await fetch(`${base}/group/create/${inst.instance_name}`, {
      method:  "POST",
      headers,
      body: JSON.stringify({
        subject:      groupName,
        participants: allParticipants,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Erro ao criar grupo:", res.status, err);
      return;
    }

    const json     = await res.json();
    const groupId  = json.id ?? json.gid ?? null;
    const groupInv = json.inviteCode ?? null;

    // Enviar mensagem de boas-vindas no grupo
    const welcomeMsg = funnel.group_welcome_msg
      ?? `Olá, ${nome}! Bem-vindo(a) ao grupo do seu caso${nomeCrianca}.\n\nAqui você vai receber todas as atualizações do processo diretamente comigo e minha equipe.\n\nQualquer dúvida, é só falar! 👨‍⚖️`;

    if (groupId) {
      await new Promise(r => setTimeout(r, 1500));
      await fetch(`${base}/message/sendText/${inst.instance_name}`, {
        method:  "POST",
        headers,
        body: JSON.stringify({
          number:       groupId,
          text:         welcomeMsg,
          textMessage:  { text: welcomeMsg },
        }),
      }).catch(() => {});
    }

    // Notificar o cliente no chat individual sobre o grupo
    await sendText(admin, userId, convId,
      `✅ Pronto! Criei um grupo no WhatsApp com você e minha equipe: *${groupName}*\n\nVocê vai receber todas as atualizações do processo por lá. Fique de olho! 👆`,
      false
    );

    // Registrar no banco
    await admin.from("messages").insert({
      user_id:         userId,
      conversation_id: convId,
      direction:       "outbound",
      content:         `[Grupo criado: ${groupName}]`,
      status:          "sent",
    });

    console.log("Grupo criado:", groupName, groupId);
  } catch (e) {
    console.error("createWhatsAppGroup error:", e);
  }
}

// ── Oferecer slots de agenda ───────────────────────────────────
async function handleAgendarConsulta(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnel: any,
  dados: Record<string, any>
) {
  if (!funnel.calendar_enabled || !funnel.calendar_google_token || !funnel.calendar_id) {
    await sendText(admin, userId, convId,
      "Para agendar uma consulta, entre em contato pelo telefone ou aguarde meu retorno em breve."
    );
    return;
  }
  try {
    const slots = await getAvailableSlots(
      funnel.calendar_google_token, funnel.calendar_id,
      funnel.calendar_slot_duration ?? 30, funnel.calendar_start_hour ?? 9, funnel.calendar_end_hour ?? 18
    );
    if (slots.length === 0) {
      await sendText(admin, userId, convId, "Não tenho horários disponíveis para amanhã. Me fala qual dia você prefere e verifico na agenda.");
      return;
    }
    const options = slots.slice(0, 5);
    const tomorrow = options[0].start.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
    const optionsText = options.map((s: any, i: number) => `${i + 1}. ${s.label}`).join("\n");
    await sendText(admin, userId, convId, `Tenho os seguintes horários disponíveis para amanhã, ${tomorrow}:\n\n${optionsText}\n\nQual desses horários funciona melhor para você? Responda com o número.`);
    await admin.from("funnel_states").update({
      dados: { ...dados, _slots_agenda: options.map((s: any) => ({ label: s.label, start: s.start.toISOString(), end: s.end.toISOString() })) }
    }).eq("conversation_id", convId);
  } catch (e) {
    console.error("handleAgendarConsulta error:", e);
    await sendText(admin, userId, convId, "Tive uma instabilidade ao verificar a agenda. Tente novamente em instantes.");
  }
}

async function handleConfirmarAgendamento(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnel: any,
  dados: Record<string, any>,
  escolha: string
) {
  const slots: any[] = dados._slots_agenda ?? [];
  if (slots.length === 0) return;
  const num = parseInt(escolha.trim()) - 1;
  const slot = !isNaN(num) && num >= 0 && num < slots.length
    ? slots[num]
    : slots.find((s: any) => escolha.includes(s.label));
  if (!slot) {
    await sendText(admin, userId, convId, "Não entendi qual horário você escolheu. Responda com o número (1, 2, 3...).");
    return;
  }
  const start = new Date(slot.start);
  const end   = new Date(slot.end);
  const nome  = dados.nome ?? "Cliente";
  let eventId: string | null = null;
  if (funnel.calendar_google_token && funnel.calendar_id) {
    eventId = await createCalendarEvent(
      funnel.calendar_google_token, funnel.calendar_id,
      `${funnel.calendar_meeting_title ?? "Consulta"} — ${nome}`,
      `Consulta agendada via WhatsApp. Nome: ${nome}`,
      start, end, dados.email ?? undefined
    );
  }
  const { data: conv } = await admin.from("conversations").select("client_id").eq("id", convId).single();
  await admin.from("appointments").insert({
    user_id: userId, client_id: conv?.client_id ?? null,
    conversation_id: convId, funnel_id: funnel.id ?? null,
    google_event_id: eventId,
    title: `${funnel.calendar_meeting_title ?? "Consulta"} — ${nome}`,
    start_at: start.toISOString(), end_at: end.toISOString(), status: "confirmado",
  });
  const horario = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const dia = start.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
  await sendText(admin, userId, convId, `Perfeito! Consulta confirmada para ${dia} às ${horario}.\n\nQualquer dúvida, é só me chamar.`);
}

async function handleTransferirHumano(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  funnel: any
) {
  const msg = funnel.handoff_msg ?? "Entendido. Vou acionar minha equipe para falar diretamente com você. Aguarde um instante.";
  await sendText(admin, userId, convId, msg);
  await admin.from("conversations").update({ ai_paused: true, ai_handled: false, status: "open" }).eq("id", convId);
}

export async function handleFunnelMessage(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  convId: string,
  userMessage: string,
  instanceFunnelId: string | null = null
) {
  // ── Debounce: evitar processamento paralelo ───────────────────
  const locked = await acquireLock(admin, convId);
  if (!locked) {
    console.log("handleFunnelMessage: conversa já está sendo processada, ignorando:", convId);
    return;
  }

  try {
    await handleFunnelMessageInner(admin, userId, convId, userMessage, instanceFunnelId);
  } finally {
    await releaseLock(admin, convId);
  }
}

async function handleFunnelMessageInner(
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

  // ── A/B Testing: selecionar variante do prompt ───────────────
  let personaPrompt = funnel.persona_prompt;
  let promptVariant = state.prompt_variant ?? "a";

  if (!state.historico?.length) {
    // Primeira mensagem: definir variante
    if (funnel.ab_enabled && funnel.prompt_b) {
      const roll = Math.random() * 100;
      promptVariant = roll < (funnel.ab_split ?? 50) ? "a" : "b";
      if (promptVariant === "b") personaPrompt = funnel.prompt_b;
    }
    // Registrar entrada do lead para métricas A/B
    await admin.from("funnel_ab_metrics").insert({
      funnel_id: funnel.id, variant: promptVariant, event: "lead",
    }).catch(() => {});
  } else if (promptVariant === "b" && funnel.prompt_b) {
    personaPrompt = funnel.prompt_b;
  }

  // ── Reconhecer lead recorrente ────────────────────────────────
  if (!state.historico?.length && state.fase === "abertura") {
    const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
    if (conv?.phone) {
      // Buscar conversas anteriores do mesmo número (excluindo atual e simulações)
      const { data: prevConvs } = await admin
        .from("conversations").select("id")
        .eq("user_id", userId).eq("phone", conv.phone)
        .neq("id", convId).not("phone", "like", "SIM_%")
        .limit(1);

      if (prevConvs && prevConvs.length > 0) {
        // Lead recorrente: personalizar abertura
        const recurrentNote = "\n\nOBSERVAÇÃO DO SISTEMA: Este número já entrou em contato antes. Reconheça isso de forma natural, ex: 'Olá, que bom te ver de volta!' ou 'Vi que você já esteve aqui antes.' Retome o atendimento com naturalidade.";
        personaPrompt = personaPrompt + recurrentNote;
      }
    }
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

  // 7. Processar ações
  if (reply.acao === "gerar_contrato") {
    const dadosCompletos = { ...state.dados, ...reply.dados_extraidos };
    await gerarContrato(admin, userId, convId, funnel, dadosCompletos);
    if (funnel.notify_phone) {
      const nomeCliente = dadosCompletos.nome ?? "Cliente";
      const phoneCliente = await admin.from("conversations").select("phone").eq("id", convId).single().then(r => r.data?.phone ?? "");
      await notifyOwner(admin, userId, funnel.notify_phone,
        `✍️ *Contrato gerado!*\n\nFunil: ${funnel.name}\nCliente: *${nomeCliente}*\nWhatsApp: ${phoneCliente}\n\nAcesse Propostas & Contratos para acompanhar.`
      );
    }
  }

  if (reply.acao === "agendar_consulta") {
    await handleAgendarConsulta(admin, userId, convId, funnel, novosDados);
  }

  if (reply.acao === "confirmar_agendamento") {
    await handleConfirmarAgendamento(admin, userId, convId, funnel, novosDados, userMessage);
  }

  if (reply.acao === "transferir_humano") {
    await handleTransferirHumano(admin, userId, convId, funnel);
    return; // Para o fluxo após transferir
  }

  // 8. Salvar novo estado
  const novosDados = { ...state.dados, ...reply.dados_extraidos };
  const novaFase   = reply.nova_fase ?? state.fase;

  await admin.from("funnel_states").update({
    fase:            novaFase,
    dados:           novosDados,
    midias_enviadas: [...state.midias_enviadas, ...novasMidias],
    prompt_variant:  promptVariant,
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

  // 10. Calcular score do lead baseado nos dados coletados
  if (reply.nova_fase === "coleta" || reply.nova_fase === "assinatura") {
    const camposImportantes = ["nome","cpf","rg","endereco","nomeCrianca","municipio","temPrescricao","nomeMedico"];
    const preenchidos = camposImportantes.filter(k => novosDados[k]).length;
    const score = Math.round((preenchidos / camposImportantes.length) * 100);
    await admin.from("funnel_states").update({ lead_score: score }).eq("conversation_id", convId);

    // Atualizar score no kanban
    const { data: conv } = await admin.from("conversations").select("client_id").eq("id", convId).single();
    if (conv?.client_id) {
      const { data: caso } = await admin.from("cases").select("id").eq("client_id", conv.client_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (caso) {
        const priority = score >= 80 ? "alta" : score >= 50 ? "media" : "baixa";
        await admin.from("cases").update({ priority }).eq("id", caso.id);
      }
    }
  }

  // Métricas A/B por evento
  if (reply.nova_fase && funnel.ab_enabled) {
    const eventMap: Record<string,string> = {
      conexao: "qualificado", assinatura: "contrato",
    };
    const event = eventMap[reply.nova_fase];
    if (event) {
      await admin.from("funnel_ab_metrics").insert({
        funnel_id: funnel.id, variant: promptVariant, event,
      }).catch(() => {});
    }
  }

  // 11. Notificar dono sobre mudança de fase
  if (reply.nova_fase && reply.nova_fase !== state.fase && funnel.notify_phone) {
    await notifyFaseChange(admin, userId, funnel.notify_phone, reply.nova_fase, novosDados, convId, funnel.name);
  }

  // 11. Criar grupo WhatsApp quando chegar na fase de assinatura
  if (
    reply.nova_fase === "assinatura" &&
    state.fase !== "assinatura" &&
    state.fase !== "encerrado"
  ) {
    await createWhatsAppGroup(admin, userId, convId, funnel, novosDados);
  }

  // 12. Notificar quando novo lead entra (primeira mensagem)
  if (state.fase === "abertura" && !state.historico.length && funnel.notify_phone) {
    const { data: conv } = await admin.from("conversations").select("phone").eq("id", convId).single();
    await notifyOwner(admin, userId, funnel.notify_phone,
      `🆕 *Novo lead!*\n\nFunil: ${funnel.name}\nWhatsApp: ${conv?.phone ?? ""}\n\nAcesse o Inbox para acompanhar.`
    );
  }

  // 13. Agendar follow-up
  if (novaFase !== "encerrado" && novaFase !== "assinatura" && (funnel.followup_hours ?? 0) > 0) {
    await scheduleFollowup(admin, userId, convId, state.funnel_id, funnel.followup_hours);
  }
}
