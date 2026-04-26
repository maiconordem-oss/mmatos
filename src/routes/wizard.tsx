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
  Plus, Trash2, AlertCircle,
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

// ── Componente principal ───────────────────────────────────────
function WizardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [step, setStep]       = useState(0);
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

INSTRUÇÕES ADICIONAIS:
- Primeira mensagem sempre envia video_abertura e muda fase para triagem
- Quando triagem completa e caso tem fundamento: enviar video_conexao + texto emocional + perguntar se pode abrir o caso
- Quando confirmar: enviar audio_fechamento
- Quando dados coletados: mostrar resumo e pedir confirmação, depois usar acao: gerar_contrato
- Se cliente pedir atendimento humano: acao: transferir_humano
- Nunca prometer resultado garantido
- Nunca dizer que é IA ou robô`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer lovable-internal`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userMsg },
          ],
          max_tokens: 4000,
        }),
      });

      if (!res.ok) throw new Error(`IA erro: ${res.status}`);
      const aiData = await res.json();
      const prompt = aiData.choices?.[0]?.message?.content ?? "";
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

      // PASSO 6 — Gerar
      case 5: return (
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

      {/* Progresso */}
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

      {/* Conteúdo do passo */}
      <div className="border rounded-xl p-6 space-y-4 bg-card min-h-[400px]">
        <div className="flex items-center gap-3 pb-2 border-b">
          {(() => { const s = STEPS[step]; const Icon = s.icon; return (
            <>
              <div className={`h-8 w-8 rounded-lg ${s.color} flex items-center justify-center`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="font-semibold">Passo {step + 1} de {STEPS.length} — {s.label}</h2>
              </div>
            </>
          ); })()}
        </div>
        {renderStep()}
      </div>

      {/* Navegação */}
      {step < 5 && (
        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
          )}
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="gap-2 flex-1">
            {step === 4 ? "Revisar e gerar" : "Próximo"} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {step === 5 && !promptGerado && (
        <Button variant="outline" onClick={() => setStep(4)} className="gap-2 w-full">
          <ChevronLeft className="h-4 w-4" /> Voltar e ajustar
        </Button>
      )}
    </div>
  );
}
