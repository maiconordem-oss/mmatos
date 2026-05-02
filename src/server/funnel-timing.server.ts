/**
 * Funnel Timing — Camada de IA que decide:
 *  - É o momento ideal para enviar áudio/vídeo agora?
 *  - Existe alguma OBJEÇÃO ESCONDIDA na última mensagem do cliente?
 *  - Qual tática usar (validar, quebrar objeção, avançar, dar prova social)?
 *  - Tom adequado (acolhedor, firme, urgente, leve)?
 *
 * Roda em paralelo ao prompt principal e injeta uma "diretiva" curta no system.
 */
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FAST_MODEL = "google/gemini-3-flash-preview";

export type MomentDirective = {
  send_media_now: boolean;
  media_kind: "audio" | "video" | "none";
  media_reason: string;
  hidden_objection: string | null;     // ex: "preço disfarçado de 'vou pensar'"
  objection_break: string | null;      // como quebrar — frase curta
  tactic: "validar" | "quebrar_objecao" | "avancar" | "prova_social" | "acolher" | "perguntar";
  tone: "acolhedor" | "firme" | "urgente" | "leve" | "tecnico";
  urgency: "baixa" | "media" | "alta";
  pause_seconds: number;               // 0–8s — antes de responder, p/ parecer humano
  reason: string;
};

const FALLBACK: MomentDirective = {
  send_media_now: false,
  media_kind: "none",
  media_reason: "",
  hidden_objection: null,
  objection_break: null,
  tactic: "perguntar",
  tone: "acolhedor",
  urgency: "media",
  pause_seconds: 1,
  reason: "fallback",
};

export async function analyzeMoment(params: {
  fase: string;
  dados: Record<string, any>;
  midiasJaEnviadas: string[];
  midiasDisponiveis: string[];     // chaves do funnel.medias
  historico: Array<{ role: string; content: string }>;
  ultimaMensagem: string;
}): Promise<MomentDirective> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return FALLBACK;

  const ultimasTrocas = params.historico
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
    .join("\n");

  const midiasRest = params.midiasDisponiveis.filter(
    (k) => !params.midiasJaEnviadas.includes(k)
  );

  const sys = `Você é um coach de vendas consultivas para advocacia que analisa o MOMENTO de uma conversa em andamento via WhatsApp.
Seu papel: decidir, em milissegundos, qual é a melhor jogada agora — sem produzir a resposta final, apenas a DIRETIVA estratégica.

Regras:
- Áudio só vale a pena quando o cliente está engajado e numa fase de DECISÃO ou EMOÇÃO (conexão, fechamento). Nunca em saudação, nunca quando o cliente está distraído ou frio.
- Vídeo só vale para abertura impactante OU prova/educação (documentos). Nunca repetir mídia já enviada.
- "Objeção escondida" é quando o cliente diz uma coisa que parece neutra mas esconde um medo real (preço, tempo, desconfiança, vergonha, dúvida sobre eficácia). Detecte e proponha como quebrar em UMA frase curta.
- pause_seconds simula tempo humano de digitação: 0 para respostas rápidas/empáticas, 3-6s quando a resposta exige reflexão.`;

  const user = `Fase atual: ${params.fase}
Dados já coletados: ${JSON.stringify(params.dados)}
Mídias disponíveis (chaves): ${midiasRest.join(", ") || "nenhuma"}
Mídias já enviadas: ${params.midiasJaEnviadas.join(", ") || "nenhuma"}

Últimas trocas:
${ultimasTrocas}

Última mensagem do cliente: "${params.ultimaMensagem}"

Decida a diretiva.`;

  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: FAST_MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "moment_directive",
              parameters: {
                type: "object",
                properties: {
                  send_media_now: { type: "boolean" },
                  media_kind: { type: "string", enum: ["audio", "video", "none"] },
                  media_reason: { type: "string" },
                  hidden_objection: { type: ["string", "null"] },
                  objection_break: { type: ["string", "null"] },
                  tactic: {
                    type: "string",
                    enum: ["validar", "quebrar_objecao", "avancar", "prova_social", "acolher", "perguntar"],
                  },
                  tone: { type: "string", enum: ["acolhedor", "firme", "urgente", "leve", "tecnico"] },
                  urgency: { type: "string", enum: ["baixa", "media", "alta"] },
                  pause_seconds: { type: "number", minimum: 0, maximum: 8 },
                  reason: { type: "string" },
                },
                required: [
                  "send_media_now", "media_kind", "media_reason",
                  "hidden_objection", "objection_break",
                  "tactic", "tone", "urgency", "pause_seconds", "reason",
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "moment_directive" } },
      }),
    });

    if (!res.ok) return FALLBACK;
    const data = await res.json();
    const args = JSON.parse(
      data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}"
    );
    return { ...FALLBACK, ...args };
  } catch {
    return FALLBACK;
  }
}

export function directiveToPromptBlock(d: MomentDirective): string {
  const obj = d.hidden_objection
    ? `OBJEÇÃO ESCONDIDA detectada: "${d.hidden_objection}". Quebra sugerida: "${d.objection_break ?? ""}". Aborde de forma natural, sem repetir essas palavras.`
    : "Nenhuma objeção escondida detectada.";

  const midiaHint = d.send_media_now
    ? `MOMENTO IDEAL para enviar mídia tipo ${d.media_kind} agora (motivo: ${d.media_reason}). Se houver chave disponível compatível, inclua em "midias".`
    : "NÃO envie mídia neste turno (não é o momento certo).";

  return `
═══════════════════════════
DIRETIVA DE MOMENTO (use como guia, não copie literal)
═══════════════════════════
Tática: ${d.tactic} | Tom: ${d.tone} | Urgência: ${d.urgency}
${midiaHint}
${obj}
Por quê agora: ${d.reason}`.trim();
}
