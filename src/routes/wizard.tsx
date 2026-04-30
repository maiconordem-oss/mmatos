import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Wand2, ChevronRight, ChevronLeft, Bot, DollarSign,
  HelpCircle, Shield, FileText, Sparkles, Check,
  Plus, Trash2, AlertCircle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wizard")({
  head: () => ({ meta: [{ title: "Criar Funil — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <WizardPage />
      </AppShell>
    </AuthGate>
  ),
});

// ── Tipos ──────────────────────────────────────────────────────
type Step = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
};

const STEPS: Step[] = [
  { id: "persona",   label: "Persona",         icon: Bot,       color: "bg-violet-500" },
  { id: "servico",   label: "Serviço",         icon: DollarSign,color: "bg-green-500"  },
  { id: "triagem",   label: "Triagem",         icon: HelpCircle,color: "bg-blue-500"   },
  { id: "objecoes",  label: "Objeções",        icon: Shield,    color: "bg-orange-500" },
  { id: "coleta",    label: "Coleta de dados", icon: FileText,  color: "bg-pink-500"   },
  { id: "acoes",     label: "Ações e Mídias",  icon: Zap,       color: "bg-red-500"    },
  { id: "gerar",     label: "Gerar prompt",    icon: Sparkles,  color: "bg-amber-500"  },
];

type WizardData = {
  // Persona
  nomeDr: string;
  especialidade: string;
  tomVoz: string;
  apresentacao: string;
  // Serviço
  nomeServico: string;
  descricaoServico: string;
  gratuito: boolean;
  valorHonorarios: string;
  direitoDefendido: string;
  argumentosJuridicos: string;
  // Triagem
  perguntas: { texto: string; exclusao: string }[];
  // Objeções
  objecoes: { gatilho: string; resposta: string }[];
  // Coleta
  camposContrato: string[];
  // Ações
  acoes: { momento: string; tipo: string; valor: string; descricao: string }[];
  // Config
  nomeFunil: string;
};

const EMPTY_DATA: WizardData = {
  nomeDr: "Dr. Maicon Matos",
  especialidade: "",
  tomVoz: "proximo",
  apresentacao: "",
  nomeServico: "",
  descricaoServico: "",
  gratuito: false,
  valorHonorarios: "",
  direitoDefendido: "",
  argumentosJuridicos: "",
  perguntas: [{ texto: "", exclusao: "" }],
  objecoes: [
    { gatilho: "Quanto custa?", resposta: "" },
    { gatilho: "Demora muito?", resposta: "" },
    { gatilho: "Vai funcionar?", resposta: "" },
    { gatilho: "Deixa eu pensar", resposta: "" },
    { gatilho: "Você é robô?", resposta: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso." },
  ],
  camposContrato: ["nome", "cpf", "rg", "estadoCivil", "profissao", "endereco"],
  acoes: [],
  nomeFunil: "",
};

const CAMPOS_DISPONIVEIS = [
  { key: "nome",                 label: "Nome completo" },
  { key: "cpf",                  label: "CPF" },
  { key: "rg",                   label: "RG" },
  { key: "estadoCivil",          label: "Estado civil" },
  { key: "profissao",            label: "Profissão" },
  { key: "endereco",             label: "Endereço" },
  { key: "nomeCrianca",          label: "Nome da criança" },
  { key: "idadeCrianca",         label: "Idade da criança" },
  { key: "dataNascimentoCrianca",label: "Data de nascimento da criança" },
  { key: "municipio",            label: "Município" },
  { key: "creche",               label: "Creche solicitada" },
  { key: "protocolo",            label: "Protocolo do pedido" },
  { key: "temPrescricao",        label: "Tem prescrição médica?" },
  { key: "nomeMedico",           label: "Nome do médico" },
  { key: "crm",                  label: "CRM do médico" },
  { key: "cid",                  label: "CID" },
  { key: "dataNascimento",       label: "Data de nascimento" },
  { key: "email",                label: "E-mail" },
];


// ── Templates por área jurídica ────────────────────────────────
const TEMPLATES: Record<string, Partial<WizardData>> = {
  creche: {
    especialidade: "direito da criança e do adolescente — vaga em creche pública negada",
    tomVoz: "proximo",
    apresentacao: "advogado especialista em casos de vaga em creche em Porto Alegre, com centenas de casos resolvidos",
    nomeServico: "Vaga em Creche — Porto Alegre",
    descricaoServico: "Ação judicial para garantir vaga em creche pública para crianças até 5 anos negada pelo município",
    gratuito: true,
    direitoDefendido: "Direito à educação infantil garantido pela CF/88 art. 208 e pelo ECA. O município tem obrigação constitucional de fornecer vaga em creche para crianças de 0 a 5 anos.",
    argumentosJuridicos: "STF Tema 548: municípios são obrigados. Alta taxa de êxito. Liminar pode sair em 48h. Jurisprudência consolidada nos TJs. Não custa nada para o responsável.",
    perguntas: [
      { texto: "Qual é o seu nome?", exclusao: "" },
      { texto: "E o nome do seu filho ou filha?", exclusao: "" },
      { texto: "Quantos anos e meses ele tem?", exclusao: "se a criança tiver mais de 5 anos e 11 meses, encerrar" },
      { texto: "Em qual cidade foi pedida a vaga?", exclusao: "" },
      { texto: "Você já fez o pedido formal na Prefeitura ou Secretaria de Educação?", exclusao: "se não fez o pedido, orientar a fazer e encerrar" },
      { texto: "O que aconteceu depois do pedido — teve negativa ou simplesmente não responderam?", exclusao: "" },
      { texto: "Você trabalha? Tem alguma urgência como recomendação médica ou vulnerabilidade financeira?", exclusao: "" },
    ],
    objecoes: [
      { gatilho: "Quanto custa? Tem algum custo?", resposta: "Você não paga nada. Quando o município perde — e na maioria dos casos perde — ele é condenado a pagar meus honorários. Quem banca é a Prefeitura. Para você, é gratuito." },
      { gatilho: "Demora muito? Preciso ir ao escritório?", resposta: "Você não vai precisar ir a lugar nenhum. Eu cuido de tudo. Já vi liminares saírem em 48 horas. Sua parte é só me mandar os documentos." },
      { gatilho: "Vai funcionar? Já tentei antes.", resposta: "Cobrar informalmente é diferente de entrar com ação judicial. Com a ação, o município é legalmente obrigado a responder. Já resolvi casos iguais." },
      { gatilho: "Deixa eu pensar / ver depois", resposta: "Sem pressão. Só quero que você saiba que enquanto a gente não abre o processo, o município não tem obrigação nenhuma de te responder. A fila continua andando." },
      { gatilho: "Você é robô? É IA?", resposta: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso." },
      { gatilho: "Quero falar com uma pessoa", resposta: "" },
    ],
    camposContrato: ["nome","cpf","rg","estadoCivil","profissao","endereco","nomeCrianca","idadeCrianca","dataNascimentoCrianca","municipio","creche","protocolo"],
  },
  tirzepatida: {
    especialidade: "direito à saúde — ação contra ANVISA para busca pessoal de Tirzepatida no Paraguai",
    tomVoz: "proximo",
    apresentacao: "advogado especialista em direito à saúde e medicamentos importados",
    nomeServico: "Tirzepatida — Autorização ANVISA",
    descricaoServico: "Ação judicial para autorizar o paciente a buscar Tirzepatida pessoalmente no Paraguai com segurança jurídica",
    gratuito: false,
    valorHonorarios: "1500",
    direitoDefendido: "Direito à saúde (CF/88 art. 196). A ANVISA proíbe a importação pessoal de Tirzepatida, mas é possível obter autorização judicial para busca pessoal com prescrição médica válida.",
    argumentosJuridicos: "Jurisprudência favorável em TJs para medicamentos com prescrição. Liminar costuma sair em 5-10 dias. Paciente vai ao Paraguai com documento judicial, sem risco de apreensão na fronteira.",
    perguntas: [
      { texto: "Qual é o seu nome?", exclusao: "" },
      { texto: "Você tem prescrição médica para a Tirzepatida?", exclusao: "se não tiver prescrição, informar que é necessária e encerrar" },
      { texto: "O médico prescreveu para qual finalidade — emagrecimento, diabetes tipo 2 ou outro?", exclusao: "" },
      { texto: "Você já tentou comprar no Brasil ou pelo plano de saúde e foi negado?", exclusao: "" },
      { texto: "Você sabe que a ANVISA proíbe a importação pessoal? Estava ciente dessa restrição?", exclusao: "" },
    ],
    objecoes: [
      { gatilho: "Quanto custa?", resposta: "São R$ 1.500 de honorários. O investimento é pontual — e garante que você vá ao Paraguai com segurança jurídica total, sem risco de apreensão na fronteira." },
      { gatilho: "Demora muito?", resposta: "A liminar costuma sair em 5 a 10 dias úteis. Rápido o suficiente para você planejar a viagem com tranquilidade." },
      { gatilho: "Vai funcionar?", resposta: "Já obtivemos autorizações judiciais para pacientes buscarem medicamentos no Paraguai. É um direito que a Justiça tem reconhecido com frequência." },
      { gatilho: "Deixa eu pensar", resposta: "Sem pressão. Só lembre que sem a autorização judicial, o risco na fronteira é real. Quando decidir, é só me chamar." },
      { gatilho: "Você é robô?", resposta: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso." },
      { gatilho: "Quero falar com uma pessoa", resposta: "" },
    ],
    camposContrato: ["nome","cpf","rg","estadoCivil","profissao","endereco","dataNascimento","temPrescricao","nomeMedico","crm","cid"],
  },
  trabalhista: {
    especialidade: "direito trabalhista — reclamação por verbas rescisórias e direitos violados",
    tomVoz: "proximo",
    nomeServico: "Ação Trabalhista",
    descricaoServico: "Ação judicial para recuperar verbas rescisórias, horas extras, danos morais e outros direitos trabalhistas violados",
    gratuito: false,
    valorHonorarios: "",
    direitoDefendido: "CLT e CF/88 art. 7º. Trabalhador tem direito a FGTS, férias, 13º, aviso prévio, horas extras, e indenizações por demissão irregular ou assédio.",
    argumentosJuridicos: "A maioria dos casos trabalhistas tem êxito parcial ou total. Sem custo inicial — honorários são percentual do que for recuperado. Prazo de 2 anos após rescisão.",
    perguntas: [
      { texto: "Qual é o seu nome?", exclusao: "" },
      { texto: "Qual foi o problema com seu empregador — demissão, horas extras não pagas, assédio, acidente?", exclusao: "" },
      { texto: "Quando foi demitido ou quando o problema ocorreu?", exclusao: "se faz mais de 2 anos da rescisão, verificar prescrição" },
      { texto: "Você recebeu todas as verbas rescisórias — FGTS, aviso prévio, férias, 13º?", exclusao: "" },
      { texto: "Tem algum documento: carteira assinada, holerites, contrato ou conversa por escrito?", exclusao: "" },
    ],
    objecoes: [
      { gatilho: "Quanto custa?", resposta: "Não tem custo inicial. Meus honorários são um percentual do que você recuperar — só pago se ganhar. Se não ganhar nada, você não paga nada." },
      { gatilho: "Vai demorar?", resposta: "Ações trabalhistas costumam ser resolvidas em 6 a 18 meses, dependendo da comarca. Muitos casos são resolvidos em audiência de conciliação sem precisar ir a julgamento." },
      { gatilho: "A empresa é grande, tenho chance?", resposta: "O tamanho da empresa não muda seus direitos. O que importa é se houve violação da CLT — e se houve, a Justiça do Trabalho é eficiente em garantir esses direitos." },
      { gatilho: "Deixa eu pensar", resposta: "Fique à vontade. Só lembre que o prazo para entrar com ação trabalhista é de 2 anos após a rescisão. Se estiver próximo desse prazo, me chama logo." },
      { gatilho: "Você é robô?", resposta: "Sou o Dr. Maicon Matos. Estou aqui para analisar seu caso." },
      { gatilho: "Quero falar com uma pessoa", resposta: "" },
    ],
    camposContrato: ["nome","cpf","rg","estadoCivil","profissao","endereco","email"],
  },
};

const TEMPLATE_LABELS = [
  { key: "creche",      emoji: "🏫", label: "Vaga em Creche",      desc: "Direito à educação infantil" },
  { key: "tirzepatida", emoji: "💊", label: "Tirzepatida / ANVISA", desc: "Direito à saúde — medicamento" },
  { key: "trabalhista", emoji: "⚖️", label: "Ação Trabalhista",     desc: "Verbas rescisórias e direitos" },
  { key: "zero",        emoji: "✨", label: "Do zero",             desc: "Criar do início" },
];

// ── Componente principal ───────────────────────────────────────
function WizardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [step, setStep]       = useState(-1);
  const [data, setData]       = useState<WizardData>({ ...EMPTY_DATA });
  const [generating, setGenerating] = useState(false);
  const [promptGerado, setPromptGerado] = useState("");
  const [salvando, setSalvando]   = useState(false);

  const patch = (fields: Partial<WizardData>) => setData(d => ({ ...d, ...fields }));

  // ── Gerar prompt via IA ──────────────────────────────────────
  const gerarPrompt = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const systemPrompt = `Você é um especialista em criação de prompts para agentes de IA de advocacia.
Sua tarefa é gerar um prompt completo para um funil de atendimento automático via WhatsApp.
O prompt deve fazer a IA responder SEMPRE com JSON válido no formato:
{"texto":"...","midias":[],"texto_pos_midia":null,"nova_fase":null,"acao":null,"dados_extraidos":{}}

Fases possíveis: abertura → triagem → conexao → fechamento → coleta → assinatura → encerrado
Ações possíveis: gerar_contrato, agendar_consulta, confirmar_agendamento, transferir_humano
Mídias disponíveis: video_abertura, video_conexao, audio_fechamento, video_documentos (e outras configuradas)

O prompt deve ser profissional, humanizado e seguir as melhores práticas de conversão.
Retorne APENAS o texto do prompt, sem JSON externo.`;

      const userMsg = `Crie um prompt completo para este funil de atendimento:

PERSONA:
- Nome: ${data.nomeDr}
- Especialidade: ${data.especialidade}
- Tom: ${data.tomVoz === "proximo" ? "próximo, humano, sem juridiquês" : "técnico e formal"}
- Apresentação: ${data.apresentacao || "Advogado especialista"}

SERVIÇO:
- Nome: ${data.nomeServico}
- Descrição: ${data.descricaoServico}
- Honorários: ${data.gratuito ? "GRATUITO (honorários pagos pelo réu em caso de êxito)" : `R$ ${data.valorHonorarios}`}
- Direito defendido: ${data.direitoDefendido}
- Argumentos jurídicos: ${data.argumentosJuridicos}

PERGUNTAS DE TRIAGEM (fazer uma por vez):
${data.perguntas.filter(p => p.texto).map((p, i) => `${i + 1}. ${p.texto}${p.exclusao ? ` [SE: ${p.exclusao} → ENCERRAR]` : ""}`).join("\n")}

OBJEÇÕES E RESPOSTAS:
${data.objecoes.filter(o => o.gatilho && o.resposta).map(o => `- Gatilho: "${o.gatilho}" → Resposta: "${o.resposta}"`).join("\n")}

DADOS A COLETAR PARA O CONTRATO:
${data.camposContrato.join(", ")}

QUANDO EXECUTAR CADA AÇÃO (siga EXATAMENTE):
${data.acoes.length > 0 ? data.acoes.map((a: any) => {
  const m: Record<string,string> = {
    abertura: "na primeira mensagem",
    triagem_completa: "quando triagem completa e caso tem fundamento",
    conexao_confirmada: "quando lead confirmar que quer abrir o caso",
    fechamento_audio: "após lead ouvir o áudio e confirmar",
    dados_confirmados: "quando lead confirmar que dados estão corretos",
    contrato_assinado: "quando lead confirmar assinatura",
    pagamento_realizado: "quando lead confirmar pagamento",
  };
  const t: Record<string,string> = {
    midia: "enviar mídia " + a.valor + " em midias: [\"" + a.valor + "\"]",
    contrato: 'usar acao: "gerar_contrato" + nova_fase: "assinatura"',
    agendamento: 'usar acao: "agendar_consulta"',
    pagamento: "enviar link: " + a.valor,
    grupo: "sistema cria grupo automaticamente na fase assinatura",
    handoff: 'usar acao: "transferir_humano" + nova_fase: "encerrado"',
  };
  return "- " + (m[a.momento] || a.momento) + ": " + (t[a.tipo] || a.tipo);
}).join("\n") : "use as ações padrão do formato JSON"}

INSTRUÇÕES ADICIONAIS:
- Primeira mensagem sempre envia video_abertura e muda fase para triagem
- Quando triagem completa e caso tem fundamento: enviar video_conexao + texto emocional + perguntar se pode abrir o caso
- Quando confirmar: enviar audio_fechamento
- Quando dados coletados: mostrar resumo e pedir confirmação, depois usar acao: gerar_contrato
- Se cliente pedir atendimento humano: acao: transferir_humano
- Nunca prometer resultado garantido
- Nunca dizer que é IA ou robô`;

      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, userMsg }),
      });

      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const aiData = await res.json();
      const prompt = aiData.prompt ?? "";
      if (!prompt) throw new Error("IA não retornou prompt");

      setPromptGerado(prompt);
      toast.success("Prompt gerado com sucesso!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ── Salvar funil ─────────────────────────────────────────────
  const salvarFunil = async () => {
    if (!user) return;
    if (!promptGerado) { toast.error("Gere o prompt primeiro"); return; }
    if (!data.nomeFunil.trim()) { toast.error("Defina o nome do funil"); return; }

    setSalvando(true);
    try {
      const { error } = await supabase.from("funnels").insert({
        user_id:          user.id,
        name:             data.nomeFunil,
        description:      data.descricaoServico,
        persona_prompt:   promptGerado,
        proposal_is_free: data.gratuito,
        proposal_value:   data.gratuito ? null : (data.valorHonorarios ? Number(data.valorHonorarios) : null),
        is_active:        true,
        is_default:       false,
        medias:           {},
      });
      if (error) throw error;
      toast.success("Funil criado! Acesse Funis de Atendimento para configurar as mídias.");
      setTimeout(() => navigate({ to: "/funis" }), 1500);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // ── Renderizar passo ─────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // PASSO 0 — Template
      case -1: return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Escolha um template para começar com tudo pré-configurado, ou comece do zero:</p>
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATE_LABELS.map(t => (
              <button key={t.key} onClick={() => {
                if (t.key !== "zero" && TEMPLATES[t.key]) {
                  const tpl = TEMPLATES[t.key];
                  patch({ ...tpl, nomeFunil: tpl.nomeServico ?? "" });
                }
                setStep(0);
              }} className="flex flex-col items-start gap-2 p-4 border-2 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left">
                <span className="text-3xl">{t.emoji}</span>
                <div>
                  <p className="font-semibold text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">Você pode ajustar tudo depois de escolher o template</p>
        </div>
      );

      // PASSO 1 — Persona
      case 0: return (
        <div className="space-y-5">
          <div>
            <Label>Nome do advogado *</Label>
            <Input value={data.nomeDr} onChange={e => patch({ nomeDr: e.target.value })} placeholder="Dr. Maicon Matos" />
          </div>
          <div>
            <Label>Especialidade / área jurídica *</Label>
            <Input value={data.especialidade} onChange={e => patch({ especialidade: e.target.value })} placeholder="Ex: direito da criança e do adolescente, saúde, trabalhista..." />
          </div>
          <div>
            <Label>Tom de voz</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                { val: "proximo", label: "Próximo e humano", desc: "Sem juridiquês. Como se fosse um amigo advogado." },
                { val: "formal",  label: "Técnico e formal", desc: "Linguagem mais profissional e reservada." },
              ].map(t => (
                <button key={t.val} onClick={() => patch({ tomVoz: t.val })}
                  className={cn("border rounded-lg p-4 text-left transition-colors", data.tomVoz === t.val ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Frase de apresentação (opcional)</Label>
            <Textarea rows={2} value={data.apresentacao} onChange={e => patch({ apresentacao: e.target.value })}
              placeholder="Ex: advogado com 10 anos de experiência em casos de vaga em creche em Porto Alegre" />
          </div>
        </div>
      );

      // PASSO 2 — Serviço
      case 1: return (
        <div className="space-y-5">
          <div>
            <Label>Nome do serviço / funil *</Label>
            <Input value={data.nomeServico} onChange={e => patch({ nomeServico: e.target.value, nomeFunil: e.target.value })}
              placeholder="Ex: Vaga em Creche — Porto Alegre" />
          </div>
          <div>
            <Label>Descrição do serviço</Label>
            <Textarea rows={2} value={data.descricaoServico} onChange={e => patch({ descricaoServico: e.target.value })}
              placeholder="Ex: Ação judicial para garantir vaga em creche pública para crianças até 5 anos negada pelo município" />
          </div>
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={data.gratuito} onCheckedChange={v => patch({ gratuito: v })} />
              <Label>Serviço gratuito para o cliente (honorários pagos pelo réu)</Label>
            </div>
            {!data.gratuito && (
              <div>
                <Label className="text-xs">Valor dos honorários (R$)</Label>
                <Input type="number" value={data.valorHonorarios} onChange={e => patch({ valorHonorarios: e.target.value })} placeholder="Ex: 1500" />
              </div>
            )}
          </div>
          <div>
            <Label>Qual direito está sendo defendido? *</Label>
            <Textarea rows={2} value={data.direitoDefendido} onChange={e => patch({ direitoDefendido: e.target.value })}
              placeholder="Ex: Direito à educação infantil garantido pela CF/88, art. 208, e pelo ECA. O município tem obrigação constitucional de fornecer vaga em creche para crianças de 0 a 5 anos." />
          </div>
          <div>
            <Label>Argumentos jurídicos principais</Label>
            <Textarea rows={3} value={data.argumentosJuridicos} onChange={e => patch({ argumentosJuridicos: e.target.value })}
              placeholder="Ex: STF Tema 548 — municípios são obrigados a fornecer vagas. Alta taxa de êxito. Liminar pode sair em 48h. Jurisprudência consolidada nos TJs." />
          </div>
        </div>
      );

      // PASSO 3 — Triagem
      case 2: return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">Como funciona</p>
            <p>Defina as perguntas de qualificação. A IA vai fazer uma por vez, na ordem que você definir. Se o cliente não se qualificar em alguma pergunta, o sistema encerra automaticamente.</p>
          </div>

          {data.perguntas.map((p, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Pergunta {i + 1}</Badge>
                {data.perguntas.length > 1 && (
                  <button onClick={() => patch({ perguntas: data.perguntas.filter((_, j) => j !== i) })}
                    className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <div>
                <Label className="text-xs">O que você quer saber?</Label>
                <Input value={p.texto} onChange={e => {
                  const arr = [...data.perguntas]; arr[i] = { ...arr[i], texto: e.target.value };
                  patch({ perguntas: arr });
                }} placeholder="Ex: A criança tem até 5 anos e 11 meses?" />
              </div>
              <div>
                <Label className="text-xs">Critério de exclusão (opcional)</Label>
                <Input value={p.exclusao} onChange={e => {
                  const arr = [...data.perguntas]; arr[i] = { ...arr[i], exclusao: e.target.value };
                  patch({ perguntas: arr });
                }} placeholder="Ex: se a criança tiver mais de 5 anos e 11 meses, encerrar" />
                <p className="text-xs text-muted-foreground mt-1">Se preenchido, o funil encerra quando esta condição for verdadeira.</p>
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full gap-2" onClick={() => patch({ perguntas: [...data.perguntas, { texto: "", exclusao: "" }] })}>
            <Plus className="h-4 w-4" /> Adicionar pergunta
          </Button>
        </div>
      );

      // PASSO 4 — Objeções
      case 3: return (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            Defina como a IA deve responder quando o cliente apresentar objeções. Deixe a resposta em branco para a IA criar uma baseada no seu contexto.
          </div>

          {data.objecoes.map((o, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Quando o cliente disser algo como...</Label>
                {i >= 5 && (
                  <button onClick={() => patch({ objecoes: data.objecoes.filter((_, j) => j !== i) })}
                    className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <Input value={o.gatilho} onChange={e => {
                const arr = [...data.objecoes]; arr[i] = { ...arr[i], gatilho: e.target.value };
                patch({ objecoes: arr });
              }} placeholder='Ex: "Quanto custa?" ou "Vai funcionar?"' />
              <div>
                <Label className="text-xs">A IA responde:</Label>
                <Textarea rows={2} value={o.resposta} onChange={e => {
                  const arr = [...data.objecoes]; arr[i] = { ...arr[i], resposta: e.target.value };
                  patch({ objecoes: arr });
                }} placeholder="Deixe em branco para a IA criar baseada no contexto do seu funil" />
              </div>
            </div>
          ))}

          <Button variant="outline" className="w-full gap-2"
            onClick={() => patch({ objecoes: [...data.objecoes, { gatilho: "", resposta: "" }] })}>
            <Plus className="h-4 w-4" /> Adicionar objeção
          </Button>
        </div>
      );

      // PASSO 5 — Coleta de dados
      case 4: return (
        <div className="space-y-4">
          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-sm text-pink-800">
            Selecione os dados que a IA deve coletar para preencher o contrato. A IA vai pedir um por vez, na fase de coleta.
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CAMPOS_DISPONIVEIS.map(({ key, label }) => {
              const selecionado = data.camposContrato.includes(key);
              return (
                <button key={key}
                  onClick={() => patch({ camposContrato: selecionado ? data.camposContrato.filter(k => k !== key) : [...data.camposContrato, key] })}
                  className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors",
                    selecionado ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50 text-muted-foreground")}>
                  <div className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    selecionado ? "bg-primary border-primary" : "border-muted-foreground")}>
                    {selecionado && <Check className="h-3 w-3 text-white" />}
                  </div>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">Selecionados: <strong>{data.camposContrato.length}</strong> campos</p>
          </div>
        </div>
      );

      // PASSO 6 — Ações e Mídias
      case 5: return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <p className="font-medium mb-1">⚡ O que acontece em cada momento?</p>
            <p>Defina quando enviar vídeo, áudio, gerar contrato, oferecer agendamento, link de pagamento ou transferir para humano. A IA executa automaticamente.</p>
          </div>

          {[
            { momento: "abertura",           label: "🟢 Abertura",                desc: "Primeira mensagem do lead" },
            { momento: "triagem_completa",   label: "📋 Triagem completa",        desc: "Após coletar dados do caso e ter fundamento" },
            { momento: "conexao_confirmada", label: "🤝 Lead confirmou interesse",desc: "Quando disser sim, pode abrir o caso" },
            { momento: "apos_audio",         label: "🎙️ Após áudio de avaliação", desc: "Depois do lead ouvir e confirmar" },
            { momento: "dados_confirmados",  label: "📝 Dados confirmados",       desc: "Lead conferiu e aprovou todos os dados" },
            { momento: "contrato_assinado",  label: "✍️ Contrato assinado",       desc: "Após assinatura digital" },
          ].map(({ momento, label, desc }) => {
            const existentes = (data.acoes ?? []).filter((a: any) => a.momento === momento);
            return (
              <div key={momento} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 text-xs shrink-0"
                    onClick={() => patch({ acoes: [...(data.acoes ?? []), { momento, tipo: "midia", valor: "", descricao: "" }] })}>
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
                {existentes.map((acao: any) => {
                  const gi = (data.acoes ?? []).indexOf(acao);
                  return (
                    <div key={gi} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
                      <select value={acao.tipo}
                        onChange={e => { const arr = [...(data.acoes ?? [])]; arr[gi] = { ...arr[gi], tipo: e.target.value, valor: "" }; patch({ acoes: arr }); }}
                        className="text-xs border rounded px-2 py-1 bg-background shrink-0">
                        <option value="midia">🎬 Enviar mídia (vídeo/áudio)</option>
                        <option value="contrato">📄 Gerar contrato ZapSign</option>
                        <option value="agendamento">📅 Oferecer horários (Google Calendar)</option>
                        <option value="pagamento">💳 Enviar link de pagamento</option>
                        <option value="grupo">👥 Criar grupo WhatsApp com equipe</option>
                        <option value="handoff">👤 Transferir para atendimento humano</option>
                      </select>
                      {acao.tipo === "midia" && (
                        <Input className="flex-1 text-xs h-7 font-mono" placeholder="ex: video_abertura, audio_fechamento"
                          value={acao.valor}
                          onChange={e => { const arr = [...(data.acoes ?? [])]; arr[gi] = { ...arr[gi], valor: e.target.value }; patch({ acoes: arr }); }} />
                      )}
                      {acao.tipo === "pagamento" && (
                        <Input className="flex-1 text-xs h-7" placeholder="URL do link de pagamento"
                          value={acao.valor}
                          onChange={e => { const arr = [...(data.acoes ?? [])]; arr[gi] = { ...arr[gi], valor: e.target.value }; patch({ acoes: arr }); }} />
                      )}
                      {["contrato","agendamento","grupo","handoff"].includes(acao.tipo) && (
                        <span className="flex-1 text-xs text-muted-foreground italic">
                          {acao.tipo === "contrato" ? "Gerado automaticamente com os dados coletados" :
                           acao.tipo === "agendamento" ? "Busca horários livres do Google Calendar" :
                           acao.tipo === "grupo" ? "Cria grupo com o cliente + sua equipe" :
                           "Pausa a IA e notifica você no Inbox"}
                        </span>
                      )}
                      <button onClick={() => patch({ acoes: (data.acoes ?? []).filter((_: any, i: number) => i !== gi) })}
                        className="text-destructive hover:opacity-70 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
                {existentes.length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">Nenhuma ação — clique em Adicionar</p>
                )}
              </div>
            );
          })}

          {(data.acoes ?? []).length > 0 && (
            <div className="border rounded-lg p-3 bg-green-50 border-green-200">
              <p className="text-xs font-medium text-green-800 mb-2">✅ Fluxo configurado:</p>
              {(data.acoes ?? []).map((a: any, i: number) => (
                <p key={i} className="text-xs text-green-700">→ {a.momento.replace(/_/g," ")}: {a.tipo === "midia" ? a.valor : a.tipo}</p>
              ))}
            </div>
          )}
        </div>
      );

      // PASSO 7 — Gerar
      case 6: return (
        <div className="space-y-5">
          <div>
            <Label>Nome do funil *</Label>
            <Input value={data.nomeFunil} onChange={e => patch({ nomeFunil: e.target.value })}
              placeholder="Ex: Vaga em Creche — Porto Alegre" />
          </div>

          {/* Resumo */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <p className="font-medium text-sm">Resumo do funil</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Persona:</span> {data.nomeDr}</div>
              <div><span className="text-muted-foreground">Tom:</span> {data.tomVoz === "proximo" ? "Próximo e humano" : "Técnico"}</div>
              <div><span className="text-muted-foreground">Serviço:</span> {data.nomeServico || "—"}</div>
              <div><span className="text-muted-foreground">Honorários:</span> {data.gratuito ? "Gratuito" : `R$ ${data.valorHonorarios}`}</div>
              <div><span className="text-muted-foreground">Perguntas:</span> {data.perguntas.filter(p => p.texto).length}</div>
              <div><span className="text-muted-foreground">Objeções:</span> {data.objecoes.filter(o => o.gatilho).length}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Dados coletados:</span> {data.camposContrato.join(", ")}</div>
            </div>
          </div>

          {!promptGerado ? (
            <Button onClick={gerarPrompt} disabled={generating} className="w-full gap-2 h-12 text-base">
              <Sparkles className="h-5 w-5" />
              {generating ? "A IA está criando seu prompt..." : "Gerar prompt com IA"}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Prompt gerado com sucesso!</span>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                  <span className="text-xs font-medium">Prompt gerado</span>
                  <button onClick={gerarPrompt} disabled={generating} className="text-xs text-primary hover:underline">
                    Regenerar
                  </button>
                </div>
                <Textarea rows={12} value={promptGerado} onChange={e => setPromptGerado(e.target.value)}
                  className="border-0 font-mono text-xs rounded-none focus-visible:ring-0" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Revise o prompt antes de salvar. Você pode editá-lo diretamente acima ou usar o botão Regenerar para uma nova versão.</span>
              </div>
              <Button onClick={salvarFunil} disabled={salvando} className="w-full gap-2 h-12 text-base bg-green-600 hover:bg-green-700">
                <Check className="h-5 w-5" />
                {salvando ? "Salvando funil..." : "Salvar funil e ir para configurações"}
              </Button>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  const canNext = () => {
    if (step === -1) return true;
    if (step === 0) return data.nomeDr.trim() && data.especialidade.trim();
    if (step === 1) return data.nomeServico.trim() && data.direitoDefendido.trim();
    if (step === 2) return data.perguntas.some(p => p.texto.trim());
    return true;
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Wand2 className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Criar Funil com IA</h1>
          <p className="text-muted-foreground text-sm">Responda as perguntas e a IA monta o prompt automaticamente</p>
        </div>
      </div>

      {/* Progresso — só mostra a partir do passo 1 */}
      {step >= 0 && (
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done    = i < step;
          const current = i === step;
          return (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all flex-1",
                done    ? "bg-green-500/10 text-green-600" :
                current ? "bg-primary/10 text-primary" :
                          "text-muted-foreground")}>
                <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                  done    ? "bg-green-500 text-white" :
                  current ? s.color + " text-white" :
                            "bg-muted text-muted-foreground")}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", current ? "text-primary" : "")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-0.5 w-2 rounded-full", done ? "bg-green-400" : "bg-muted")} />
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Conteúdo do passo */}
      <div className="border rounded-xl p-6 space-y-4 bg-card min-h-[400px]">
        <div className="flex items-center gap-3 pb-2 border-b">
          {step === -1 ? (
            <>
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Wand2 className="h-4 w-4 text-white" />
              </div>
              <h2 className="font-semibold">Escolha um template para começar</h2>
            </>
          ) : (
            (() => { const s = STEPS[step]; if (!s) return null; const Icon = s.icon; return (
              <>
                <div className={`h-8 w-8 rounded-lg ${s.color} flex items-center justify-center`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold">Passo {step + 1} de {STEPS.length} — {s.label}</h2>
                </div>
              </>
            ); })()
          )}
        </div>
        {renderStep()}
      </div>

      {/* Navegação */}
      {step >= 0 && step < 6 && (
        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
          )}
          {step === 0 && (
            <Button variant="outline" onClick={() => setStep(-1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Trocar template
            </Button>
          )}
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="gap-2 flex-1">
            {step === 4 ? "Revisar e gerar" : "Próximo"} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {step === 6 && !promptGerado && (
        <Button variant="outline" onClick={() => setStep(4)} className="gap-2 w-full">
          <ChevronLeft className="h-4 w-4" /> Voltar e ajustar
        </Button>
      )}
    </div>
  );
}
