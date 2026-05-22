// ── Constantes de fase ─────────────────────────────────────────
export const FASES = ["abertura","triagem","conexao","fechamento","coleta","assinatura","encerrado"];

export const FASE_LABELS: Record<string, string> = {
  abertura: "Abertura", triagem: "Triagem", conexao: "Conexão",
  fechamento: "Fechamento", coleta: "Coleta de dados",
  assinatura: "Assinatura", encerrado: "Encerrado",
};

export const FASE_COLORS: Record<string, string> = {
  abertura: "#8696a0", triagem: "#34B7F1", conexao: "#FF9800",
  fechamento: "#E91E63", coleta: "#9C27B0", assinatura: "#25D366", encerrado: "#128C7E",
};

export const DADO_LABELS: Record<string, string> = {
  nome: "Nome", nomeCrianca: "Criança", idadeCrianca: "Idade",
  municipio: "Município", cpf: "CPF", rg: "RG",
  estadoCivil: "Estado civil", profissao: "Profissão",
  endereco: "Endereço", dataNascimentoCrianca: "Nasc. criança",
  creche: "Creche", protocolo: "Protocolo",
  temPrescricao: "Tem prescrição", nomeMedico: "Médico", crm: "CRM", cid: "CID",
};

// ── Funções puras ──────────────────────────────────────────────
export function avatar(name: string | null, phone: string) {
  const label = name ? name[0].toUpperCase() : phone[0];
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#00BCD4","#8BC34A","#FF9800","#E91E63"];
  const idx = (name || phone).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return { label, color: colors[idx] };
}

export function formatTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function hoursUntil(iso?: string | null) {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / 3600000;
}

export function playbookForPhase(phase?: string | null) {
  const map: Record<string, string[]> = {
    abertura: ["Cumprimente pelo nome", "Confirme o motivo do contato", "Evite pedir documentos cedo demais"],
    triagem: ["Identifique urgência e cidade", "Colete dados mínimos", "Sinalize se precisa de humano"],
    conexao: ["Demonstre entendimento do caso", "Explique próximos passos em linguagem simples"],
    fechamento: ["Reforce valor e prazo", "Tire objeções antes de enviar contrato"],
    coleta: ["Peça documentos em lista curta", "Confirme recebimento de cada mídia"],
    assinatura: ["Oriente assinatura", "Confirme canal para dúvidas"],
    encerrado: ["Confirme conclusão", "Ofereça acompanhamento futuro"],
  };
  return map[phase || ""] ?? ["Leia o histórico", "Responda com clareza", "Registre a próxima ação"];
}

export function manualQuestionsForPhase(phase?: string | null) {
  const map: Record<string, string[]> = {
    abertura: [
      "Oi, tudo bem? Me conta rapidamente o que aconteceu para eu te orientar melhor.",
      "Esse atendimento é para você ou para outra pessoa?",
    ],
    triagem: [
      "Em qual cidade isso aconteceu?",
      "Existe algum prazo, audiência, negativa ou urgência envolvida?",
      "Você já tem algum documento ou protocolo sobre isso?",
    ],
    conexao: [
      "Pelo que você contou, vou te explicar o caminho mais seguro em passos simples.",
      "Antes de eu te passar os próximos passos, tem algum detalhe importante que ainda não mencionei?",
    ],
    fechamento: [
      "Faz sentido seguirmos com essa estratégia?",
      "Posso te passar as condições e próximos passos para começarmos?",
    ],
    coleta: [
      "Me envie, por favor, os documentos principais em fotos ou PDF.",
      "Pode me confirmar nome completo, CPF, endereço e melhor e-mail?",
    ],
    assinatura: [
      "Vou te enviar o link de assinatura. Assim que assinar, me avise por aqui.",
      "Conseguiu acessar o link de assinatura?",
    ],
    encerrado: [
      "Tudo certo por aqui. Vou manter você atualizado sobre os próximos movimentos.",
      "Se surgir qualquer documento novo, pode me enviar por aqui.",
    ],
  };
  return map[phase || ""] ?? [
    "Me conta um pouco mais sobre o caso.",
    "Qual é o principal resultado que você precisa resolver agora?",
  ];
}

export function groupByDate<T extends { created_at: string }>(messages: T[]) {
  const groups: { date: string; messages: T[] }[] = [];
  let current = "";
  for (const m of messages) {
    const d = new Date(m.created_at), now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const label = diff === 0 ? "Hoje" : diff === 1 ? "Ontem"
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (label !== current) { groups.push({ date: label, messages: [] }); current = label; }
    groups[groups.length - 1].messages.push(m);
  }
  return groups;
}
