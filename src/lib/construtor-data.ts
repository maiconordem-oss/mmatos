import {
  ArrowRight, FileSignature, Calendar, Users, User,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────
export type AcaoTipo = "contrato" | "agendamento" | "handoff" | "criar_grupo" | "nenhuma";

export type Fase = {
  id: string; label: string; emoji: string; cor: string;
  perguntas: string[];
  opcoesPergunta?: Record<number, string[]>;
  exclusoes: { condicao: string; motivo: string }[];
  midias: { chave: string; script: string; momento: string; delayAposSegundos?: number }[];
  textoAposMidia: string;
  acao: AcaoTipo;
  camposColeta: string[];
};

export type Versao = { ts: number; label: string; fases: Fase[]; nomeFunil: string };
export type SimMsg = { de: "ia" | "lead"; texto: string; tipo?: string };

export type BriefingFunil = {
  area: string;
  objetivo: string;
  publico: string;
  cidade: string;
  documentos: string;
  urgencias: string;
  tom: string;
  honorarios: string;
  proibicoes: string;
  chamarHumano: string;
};

export type AuditResult = {
  score: number;
  clareza: number;
  seguranca: number;
  coleta: number;
  conversao: number;
  humanizacao: number;
  problemas: string[];
  sugestoes: string[];
};

// ── Constantes ─────────────────────────────────────────────────
export const BRIEFING_PADRAO: BriefingFunil = {
  area: "Direito previdenciario",
  objetivo: "",
  publico: "",
  cidade: "",
  documentos: "",
  urgencias: "",
  tom: "Humano, claro, seguro e sem juridiquês",
  honorarios: "",
  proibicoes: "Nao prometer resultado. Nao dar prazo garantido. Nao encerrar com mensagem fria.",
  chamarHumano: "Duvida juridica complexa, cliente irritado, urgencia real, proposta de acordo, pedido fora do escopo ou risco de promessa.",
};

export const AREAS_JURIDICAS = [
  "Direito previdenciario",
  "Direito de saude",
  "Direito de familia",
  "Direito do consumidor",
  "Direito trabalhista",
  "Direito civel",
  "Direito criminal",
  "Beneficio assistencial/BPC",
  "Vaga em creche",
  "Outro",
];

export const REGRAS_GLOBAIS_PADRAO = [
  "Sempre responder com uma pergunta ou proximo passo claro.",
  "Coletar uma informacao por vez para nao cansar o lead.",
  "Explicar o motivo de cada pergunta quando ela for sensivel.",
  "Usar linguagem simples, sem juridiquês.",
  "Chamar humano quando houver risco juridico, emocional ou comercial.",
  "Nunca prometer ganho, prazo ou decisao judicial.",
];

export const CHECKLIST_QUALIDADE = [
  "Briefing tem area, objetivo e publico definidos",
  "Triagem identifica qualificacao e exclusoes",
  "Coleta pede dados suficientes para contrato",
  "Existe regra de chamar humano",
  "Mensagens terminam com pergunta ou CTA",
  "Nao ha promessa de resultado juridico",
];

export const TESTES_SIMULACAO = [
  { id: "quente", label: "Lead quente", msg: "Tenho urgencia e quero comecar hoje. O que preciso mandar?" },
  { id: "frio",   label: "Lead frio",   msg: "So queria saber como funciona, nao sei se vou contratar." },
  { id: "fora",   label: "Fora do perfil", msg: "Meu caso e de outra cidade e nao tenho nenhum documento ainda." },
  { id: "risco",  label: "Risco juridico", msg: "Voce garante que eu ganho? Quanto tempo demora exatamente?" },
];

export const SUGESTOES_PERGUNTAS: Record<string, string[]> = {
  triagem: [
    "Qual é o seu nome completo?",
    "Em qual cidade você mora?",
    "Já fez o pedido formal? Tem o número do protocolo?",
    "Qual é a situação atual do caso?",
    "Há quanto tempo está tentando resolver isso?",
    "Já tentou resolver de outra forma antes?",
  ],
  conexao: [
    "Posso abrir o seu caso agora?",
    "Você quer que eu analise em detalhes?",
    "Posso te ajudar com isso?",
  ],
  fechamento: [
    "O que eu falei faz sentido para você?",
    "Podemos começar hoje?",
    "Tem alguma dúvida antes de continuarmos?",
    "Quer que eu entre com a ação?",
  ],
};

export const FASES_PADRAO: Fase[] = [
  { id: "abertura",   label: "Abertura",       emoji: "🟢", cor: "#0d9488",
    perguntas: [], exclusoes: [], midias: [{ chave: "video_abertura", script: "", momento: "Primeira mensagem" }],
    textoAposMidia: "Me conta o que está acontecendo.", acao: "nenhuma", camposColeta: [] },
  { id: "triagem",    label: "Triagem",         emoji: "📋", cor: "#2563eb",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "conexao",    label: "Conexão",         emoji: "🤝", cor: "#d97706",
    perguntas: ["Posso abrir o seu caso agora?"], exclusoes: [], midias: [{ chave: "video_conexao", script: "", momento: "Após triagem" }],
    textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "fechamento", label: "Fechamento",      emoji: "🎯", cor: "#db2777",
    perguntas: ["O que eu falei faz sentido para você?"], exclusoes: [], midias: [{ chave: "audio_fechamento", script: "", momento: "Após conexão" }],
    textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "coleta",     label: "Coleta de dados", emoji: "📝", cor: "#7c3aed",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "contrato",
    camposColeta: ["nome", "cpf", "rg", "endereco"] },
  { id: "assinatura", label: "Assinatura",      emoji: "✍️", cor: "#059669",
    perguntas: [], exclusoes: [], midias: [{ chave: "video_documentos", script: "", momento: "Após contrato" }],
    textoAposMidia: "", acao: "criar_grupo", camposColeta: [] },
  { id: "encerrado",  label: "Encerrado",       emoji: "✅", cor: "#64748b",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
];

export const CAMPOS = [
  { key: "nome",              label: "Nome completo" },
  { key: "cpf",               label: "CPF" },
  { key: "rg",                label: "RG" },
  { key: "endereco",          label: "Endereço" },
  { key: "dataNascimento",    label: "Data de nascimento" },
  { key: "municipio",         label: "Município" },
  { key: "nomeCrianca",       label: "Nome da criança" },
  { key: "idadeCrianca",      label: "Idade da criança" },
  { key: "protocolo",         label: "Protocolo" },
  { key: "email",             label: "E-mail" },
  { key: "temPrescricao",     label: "Tem prescrição?" },
  { key: "nomeMedico",        label: "Nome do médico" },
];

export const ACOES = [
  { val: "nenhuma",     label: "Avançar",        icon: ArrowRight,    desc: "Passa para próxima fase" },
  { val: "contrato",    label: "Gerar contrato",  icon: FileSignature, desc: "ZapSign automático" },
  { val: "agendamento", label: "Agendar",         icon: Calendar,      desc: "Google Calendar" },
  { val: "criar_grupo", label: "Criar grupo",     icon: Users,         desc: "Grupo WhatsApp" },
  { val: "handoff",     label: "Chamar humano",   icon: User,          desc: "Pausa a IA" },
] as const;

export const TEMPLATES: { id: string; label: string; emoji: string; desc: string; fases: Partial<Fase>[] }[] = [
  {
    id: "creche", label: "Vaga em Creche", emoji: "🏫", desc: "Crianças até 5a11m com vaga negada na prefeitura",
    fases: [
      { id: "abertura", midias: [{ chave: "video_abertura", script: "Apareça sorrindo. Diga: 'Olá! Aqui é o Dr. Maicon. Você fez bem em entrar em contato. Vamos garantir a vaga do seu filho!'", momento: "Primeira mensagem" }], textoAposMidia: "Me conta: a prefeitura negou a vaga da creche para o seu filho?" },
      { id: "triagem", perguntas: ["Qual o nome e a idade do seu filho ou filha?", "Em qual cidade você mora?", "Já fez o pedido formal na prefeitura e tem o número do protocolo?"],
        exclusoes: [{ condicao: "6 anos", motivo: "infelizmente só atendemos crianças até 5 anos e 11 meses" }, { condicao: "não fiz", motivo: "é necessário ter o pedido formal com protocolo para entrar com a ação" }] },
      { id: "conexao", midias: [{ chave: "video_conexao", script: "Olhe para a câmera com empatia. Diga: 'Olha, o município tem obrigação legal de garantir essa vaga. Eu já recuperei a vaga de mais de 50 crianças. Vou fazer o mesmo pelo seu filho.'", momento: "Após triagem qualificada" }], textoAposMidia: "Posso abrir o seu caso agora?" },
      { id: "fechamento", midias: [{ chave: "audio_fechamento", script: "Grave com voz firme e confiante: 'Eu analisei o seu caso e tenho certeza que vamos conseguir. O serviço é totalmente gratuito para você — só cobramos se ganharmos. Posso começar hoje mesmo.'", momento: "Após confirmar interesse" }], perguntas: ["O que eu falei faz sentido para você?"] },
      { id: "coleta", camposColeta: ["nome", "cpf", "rg", "endereco", "municipio", "nomeCrianca", "idadeCrianca", "protocolo", "dataNascimento"], acao: "contrato" },
      { id: "assinatura", midias: [{ chave: "video_documentos", script: "Explique os documentos necessários: RG, CPF, comprovante de residência e o protocolo do pedido.", momento: "Após contrato gerado" }], acao: "criar_grupo" },
    ],
  },
  {
    id: "bpc", label: "BPC/LOAS", emoji: "♿", desc: "Benefício assistencial para pessoas com deficiência ou idosos",
    fases: [
      { id: "abertura", midias: [{ chave: "video_abertura", script: "Apresente-se e diga que o BPC é um direito e que o INSS frequentemente nega indevidamente.", momento: "Primeira mensagem" }], textoAposMidia: "O INSS negou o seu benefício BPC/LOAS?" },
      { id: "triagem", perguntas: ["Qual é a situação? É para pessoa com deficiência ou idoso acima de 65 anos?", "O INSS já negou o benefício? Tem o número do processo?", "Qual é a renda familiar mensal?"],
        exclusoes: [{ condicao: "renda alta", motivo: "o BPC exige renda familiar per capita de até 1/4 do salário mínimo" }] },
      { id: "conexao", midias: [{ chave: "video_conexao", script: "Explique que o INSS nega em até 70% dos casos mas que na via judicial a chance de sucesso é muito maior.", momento: "Após triagem" }], textoAposMidia: "Posso analisar o seu caso em detalhes?" },
      { id: "fechamento", midias: [{ chave: "audio_fechamento", script: "Grave confiante: 'Analisei e acredito que temos boas chances. Serviço gratuito, só cobramos honorários se ganharmos.'", momento: "Após interesse confirmado" }], perguntas: ["Podemos começar?"] },
      { id: "coleta", camposColeta: ["nome", "cpf", "rg", "dataNascimento", "endereco", "municipio", "email"], acao: "contrato" },
      { id: "assinatura", acao: "criar_grupo" },
    ],
  },
  {
    id: "tirzepatida", label: "Tirzepatida / ANVISA", emoji: "💊", desc: "Medicamentos negados pelo plano de saúde",
    fases: [
      { id: "abertura", midias: [{ chave: "video_abertura", script: "Apresente-se e diga que o plano tem obrigação de fornecer o medicamento prescrito.", momento: "Primeira mensagem" }], textoAposMidia: "O plano de saúde negou o seu medicamento?" },
      { id: "triagem", perguntas: ["Qual medicamento foi negado?", "Tem prescrição médica para este medicamento?", "Qual é o seu plano de saúde?"],
        exclusoes: [{ condicao: "sem prescrição", motivo: "é necessário ter prescrição médica para entrar com a ação" }] },
      { id: "conexao", midias: [{ chave: "video_conexao", script: "Explique que o STJ já pacificou o entendimento: plano não pode negar medicamento prescrito.", momento: "Após triagem" }], textoAposMidia: "Posso abrir uma tutela de urgência para garantir o medicamento em 48h?" },
      { id: "fechamento", midias: [{ chave: "audio_fechamento", script: "Grave: 'Já consegui o medicamento para vários pacientes em menos de 48h via tutela de urgência. Posso fazer o mesmo por você.'", momento: "Após interesse confirmado" }], perguntas: ["Quer que eu entre com a ação agora?"] },
      { id: "coleta", camposColeta: ["nome", "cpf", "rg", "dataNascimento", "endereco", "email", "nomeMedico", "temPrescricao"], acao: "contrato" },
      { id: "assinatura", acao: "criar_grupo" },
    ],
  },
];

// ── Função pura ────────────────────────────────────────────────
export function fasePct(f: Fase): number {
  let pts = 0; let total = 0;
  if (f.id === "abertura")   { total = 2; if (f.midias.length > 0) pts++; if (f.textoAposMidia) pts++; }
  else if (f.id === "triagem")    { total = 3; if (f.perguntas.length >= 2) pts++; if (f.exclusoes.length >= 1) pts++; if (f.perguntas.length > 0) pts++; }
  else if (f.id === "conexao")    { total = 2; if (f.midias.length > 0) pts++; if (f.perguntas.length > 0) pts++; }
  else if (f.id === "fechamento") { total = 2; if (f.midias.length > 0) pts++; if (f.perguntas.length > 0) pts++; }
  else if (f.id === "coleta")     { total = 2; if (f.camposColeta.length >= 3) pts++; if (f.acao === "contrato") pts++; }
  else if (f.id === "assinatura") { total = 2; if (f.midias.length > 0) pts++; if (f.acao !== "nenhuma") pts++; }
  else { total = 1; pts = 1; }
  return total > 0 ? Math.round((pts / total) * 100) : 100;
}
