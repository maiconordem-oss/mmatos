import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ChevronRight, ChevronDown, Play, Plus, Trash2,
  Video, Mic, FileText, MessageSquare, Calendar,
  CheckCheck, X, Zap, Sparkles, Eye, Save,
  ArrowRight, Bot, User, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/construtor")({
  head: () => ({ meta: [{ title: "Construtor de Funil — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ConstrutorPage />
      </AppShell>
    </AuthGate>
  ),
});

// ── Tipos ──────────────────────────────────────────────────────
type MidiaKey = string;
type AcaoTipo = "contrato" | "agendamento" | "handoff" | "nenhuma";

type Fase = {
  id: string;
  label: string;
  emoji: string;
  cor: string;
  corBg: string;
  descricao: string;
  // Config do usuário
  perguntas:   string[];         // perguntas desta fase
  exclusoes:   { condicao: string; motivo: string }[]; // critérios de exclusão
  midias:      MidiaKey[];       // mídias a enviar
  textoAposMidia: string;        // texto após mídias
  scriptsMedia:   Record<string, { script: string; momento: string }>; // script por chave de mídia
  acao:        AcaoTipo;         // ação ao completar
  camposColeta: string[];        // campos a coletar (só fase coleta)
  ativo:       boolean;
};

type FunilConfig = {
  nome:         string;
  descricao:    string;
  nomeDr:       string;
  tomVoz:       "proximo" | "formal";
  servicoGratuito: boolean;
  honorarios:   string;
  fases:        Fase[];
};

const CAMPOS_DISPONIVEIS = [
  { key: "nome",              label: "Nome completo" },
  { key: "cpf",               label: "CPF" },
  { key: "rg",                label: "RG" },
  { key: "estadoCivil",       label: "Estado civil" },
  { key: "profissao",         label: "Profissão" },
  { key: "endereco",          label: "Endereço completo" },
  { key: "dataNascimento",    label: "Data de nascimento" },
  { key: "nomeCrianca",       label: "Nome da criança" },
  { key: "idadeCrianca",      label: "Idade da criança" },
  { key: "municipio",         label: "Município" },
  { key: "creche",            label: "Creche solicitada" },
  { key: "protocolo",         label: "Protocolo do pedido" },
  { key: "temPrescricao",     label: "Tem prescrição médica?" },
  { key: "nomeMedico",        label: "Nome do médico" },
  { key: "email",             label: "E-mail" },
];

const FASES_PADRAO: Fase[] = [
  {
    id: "abertura", label: "Abertura", emoji: "🟢", cor: "#64748b", corBg: "#f8fafc",
    descricao: "Primeira mensagem do lead. Apresente o Dr. e convide para contar o caso.",
    perguntas: [], exclusoes: [], midias: ["video_abertura"], textoAposMidia: "Me conta o que está acontecendo.",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
  {
    id: "triagem", label: "Triagem", emoji: "📋", cor: "#3b82f6", corBg: "#eff6ff",
    descricao: "Qualifique o lead com perguntas estratégicas. Uma por vez.",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
  {
    id: "conexao", label: "Conexão", emoji: "🤝", cor: "#f97316", corBg: "#fff7ed",
    descricao: "Apresente o caso como solucionável. Envie vídeo emocional. Peça confirmação.",
    perguntas: ["Posso abrir o seu caso agora?"], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
  {
    id: "fechamento", label: "Fechamento", emoji: "🎯", cor: "#ec4899", corBg: "#fdf2f8",
    descricao: "Envie áudio de avaliação. Confirme interesse antes de coletar dados.",
    perguntas: ["O que eu falei faz sentido para você?"], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
  {
    id: "coleta", label: "Coleta de dados", emoji: "📝", cor: "#8b5cf6", corBg: "#f5f3ff",
    descricao: "Colete os dados necessários para o contrato. Um campo por mensagem.",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "contrato", camposColeta: ["nome", "cpf", "rg", "endereco"], scriptsMedia: {}, ativo: true,
  },
  {
    id: "assinatura", label: "Assinatura", emoji: "✍️", cor: "#22c55e", corBg: "#f0fdf4",
    descricao: "Contrato gerado. Aguarde assinatura e instrua sobre documentos.",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
  {
    id: "encerrado", label: "Encerrado", emoji: "✅", cor: "#10b981", corBg: "#ecfdf5",
    descricao: "Atendimento finalizado com sucesso.",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "",
    acao: "nenhuma", camposColeta: [], scriptsMedia: {}, ativo: true,
  },
];

const CONFIG_INICIAL: FunilConfig = {
  nome: "", descricao: "", nomeDr: "Dr. Maicon Matos",
  tomVoz: "proximo", servicoGratuito: true, honorarios: "",
  fases: FASES_PADRAO.map(f => ({ ...f })),
};

// ── Preview de conversa ────────────────────────────────────────
type PreviewMsg = { de: "ia" | "lead"; texto: string; tipo?: string };

function PreviewConversa({ msgs }: { msgs: PreviewMsg[] }) {
  return (
    <div className="space-y-2 p-3 max-h-80 overflow-y-auto">
      {msgs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Configure as fases para ver o preview
        </p>
      )}
      {msgs.map((m, i) => (
        <div key={i} className={cn("flex gap-2", m.de === "ia" ? "justify-start" : "justify-end")}>
          {m.de === "ia" && (
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3 w-3 text-primary" />
            </div>
          )}
          <div className={cn("max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed",
            m.de === "ia"
              ? "bg-card border border-border text-foreground rounded-tl-none"
              : "bg-primary text-primary-foreground rounded-tr-none"
          )}>
            {m.tipo === "video" && <span className="flex items-center gap-1 mb-1 opacity-70"><Video className="h-3 w-3" /> vídeo</span>}
            {m.tipo === "audio" && <span className="flex items-center gap-1 mb-1 opacity-70"><Mic className="h-3 w-3" /> áudio</span>}
            {m.texto}
          </div>
          {m.de === "lead" && (
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <User className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Card de fase ───────────────────────────────────────────────
function FaseCard({
  fase, index, expanded, onToggle, onChange, totalFases,
}: {
  fase: Fase; index: number; expanded: boolean;
  onToggle: () => void; onChange: (f: Fase) => void; totalFases: number;
}) {
  const patch = (fields: Partial<Fase>) => onChange({ ...fase, ...fields });

  const addPergunta = () => patch({ perguntas: [...fase.perguntas, ""] });
  const setPergunta = (i: number, v: string) => {
    const arr = [...fase.perguntas]; arr[i] = v; patch({ perguntas: arr });
  };
  const removePergunta = (i: number) => patch({ perguntas: fase.perguntas.filter((_, j) => j !== i) });

  const addExclusao = () => patch({ exclusoes: [...fase.exclusoes, { condicao: "", motivo: "" }] });
  const setExclusao = (i: number, field: "condicao" | "motivo", v: string) => {
    const arr = [...fase.exclusoes]; arr[i] = { ...arr[i], [field]: v }; patch({ exclusoes: arr });
  };
  const removeExclusao = (i: number) => patch({ exclusoes: fase.exclusoes.filter((_, j) => j !== i) });

  const addMidia = () => patch({ midias: [...fase.midias, ""] });
  const setMidia = (i: number, v: string) => {
    const arr = [...fase.midias]; arr[i] = v; patch({ midias: arr });
  };
  const removeMidia = (i: number) => patch({ midias: fase.midias.filter((_, j) => j !== i) });

  const toggleCampo = (key: string) => {
    const campos = fase.camposColeta.includes(key)
      ? fase.camposColeta.filter(k => k !== key)
      : [...fase.camposColeta, key];
    patch({ camposColeta: campos });
  };

  const hasCfg = fase.perguntas.length > 0 || fase.midias.length > 0 ||
    fase.exclusoes.length > 0 || fase.camposColeta.length > 0 ||
    fase.acao !== "nenhuma";

  return (
    <div className={cn("rounded-xl border transition-all", expanded ? "border-primary/40 shadow-sm" : "border-border hover:border-primary/20")}>
      {/* Header da fase */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        {/* Linha de conexão */}
        <div className="flex flex-col items-center shrink-0">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-base font-bold border-2"
            style={{ borderColor: fase.cor, background: fase.corBg }}>
            {fase.emoji}
          </div>
          {index < totalFases - 1 && (
            <div className="w-0.5 h-3 mt-1" style={{ background: fase.cor + "40" }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{fase.label}</span>
            {hasCfg && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                configurado
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{fase.descricao}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Resumo rápido */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {fase.perguntas.length > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{fase.perguntas.length}</span>}
            {fase.midias.length > 0 && <span className="flex items-center gap-0.5"><Video className="h-3 w-3" />{fase.midias.length}</span>}
            {fase.camposColeta.length > 0 && <span className="flex items-center gap-0.5"><FileText className="h-3 w-3" />{fase.camposColeta.length}</span>}
            {fase.acao !== "nenhuma" && <span className="flex items-center gap-0.5 text-primary"><Zap className="h-3 w-3" />{fase.acao}</span>}
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Corpo expandido */}
      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">

          {/* Mídias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5 text-blue-500" /> Mídias a enviar nesta fase
              </Label>
              <button onClick={addMidia} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            {fase.midias.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhuma mídia. Clique em Adicionar.</p>
            )}
            {fase.midias.map((m, i) => {
              const isAudio = m.startsWith("audio_");
              const script = fase.scriptsMedia?.[m] ?? { script: "", momento: "" };
              const setScript = (field: "script"|"momento", val: string) => {
                patch({ scriptsMedia: { ...fase.scriptsMedia, [m]: { ...script, [field]: val } } });
              };
              return (
                <div key={i} className="mb-3 rounded-lg border border-border overflow-hidden">
                  {/* Linha da chave */}
                  <div className="flex items-center gap-2 p-2 bg-muted/30">
                    {isAudio ? <Mic className="h-3.5 w-3.5 text-violet-500 shrink-0" /> : <Video className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                    <Input value={m} onChange={e => setMidia(i, e.target.value)}
                      placeholder="chave da mídia (ex: video_abertura, audio_fechamento)"
                      className="flex-1 text-xs h-7 font-mono bg-transparent border-0 shadow-none focus-visible:ring-0" />
                    <button onClick={() => removeMidia(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Script sugerido */}
                  {m && (
                    <div className="p-2.5 space-y-2 bg-card">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                          {isAudio ? "🎤 O que falar no áudio:" : "🎬 O que mostrar/falar no vídeo:"}
                        </p>
                        <Textarea value={script.script}
                          onChange={e => setScript("script", e.target.value)}
                          rows={3} className="text-xs resize-none"
                          placeholder={isAudio
                            ? "Ex: 'Olá! Sou o Dr. Maicon. Eu já analisei o seu caso e acredito que você tem direito...'"
                            : "Ex: Apareça de frente para a câmera, sorria, se apresente. Diga: 'Você fez bem em entrar em contato...'"}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                          ⏱️ Momento exato de enviar:
                        </p>
                        <Input value={script.momento}
                          onChange={e => setScript("momento", e.target.value)}
                          className="text-xs h-7"
                          placeholder={isAudio
                            ? "Ex: Após o lead confirmar interesse (fase fechamento)"
                            : "Ex: Primeira mensagem do lead — antes de qualquer pergunta"}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground mt-1">
              Chave começando com <code className="bg-muted px-1 rounded">audio_</code> → áudio · resto → vídeo
            </p>
          </div>

          {/* Texto após mídias */}
          {fase.midias.length > 0 && (
            <div>
              <Label className="text-xs font-medium">Mensagem enviada automaticamente após as mídias</Label>
              <Input value={fase.textoAposMidia} onChange={e => patch({ textoAposMidia: e.target.value })}
                className="mt-1 text-xs" placeholder='Ex: "Posso abrir o seu caso agora?"' />
            </div>
          )}

          {/* Perguntas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-500" /> Perguntas desta fase
              </Label>
              <button onClick={addPergunta} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            {fase.perguntas.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhuma pergunta. Clique em Adicionar.</p>
            )}
            {fase.perguntas.map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground shrink-0 font-mono">{i + 1}.</span>
                <Input value={p} onChange={e => setPergunta(i, e.target.value)}
                  placeholder='Ex: "Qual o nome da criança?"'
                  className="flex-1 text-xs h-8" />
                <button onClick={() => removePergunta(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Exclusões */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-500" /> Critérios de exclusão
              </Label>
              <button onClick={addExclusao} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Quando uma condição for verdadeira, o funil encerra automaticamente.
            </p>
            {fase.exclusoes.map((ex, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 mb-2 p-2 rounded-lg bg-red-50 border border-red-200">
                <div>
                  <p className="text-[10px] text-red-600 mb-1">Se o lead disser / tiver:</p>
                  <Input value={ex.condicao} onChange={e => setExclusao(i, "condicao", e.target.value)}
                    placeholder="Ex: criança com mais de 6 anos"
                    className="text-xs h-7 bg-white" />
                </div>
                <div>
                  <p className="text-[10px] text-red-600 mb-1">Explicação ao encerrar:</p>
                  <div className="flex gap-1">
                    <Input value={ex.motivo} onChange={e => setExclusao(i, "motivo", e.target.value)}
                      placeholder="Ex: só atendemos até 5 anos"
                      className="text-xs h-7 bg-white flex-1" />
                    <button onClick={() => removeExclusao(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Coleta de dados — só na fase coleta */}
          {fase.id === "coleta" && (
            <div>
              <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <FileText className="h-3.5 w-3.5 text-purple-500" /> Dados a coletar para o contrato
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CAMPOS_DISPONIVEIS.map(({ key, label }) => {
                  const sel = fase.camposColeta.includes(key);
                  return (
                    <button key={key} onClick={() => toggleCampo(key)}
                      className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs text-left transition-colors",
                        sel ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50 text-muted-foreground")}>
                      <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                        sel ? "bg-primary border-primary" : "border-muted-foreground")}>
                        {sel && <CheckCheck className="h-2.5 w-2.5 text-white" />}
                      </div>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ação ao completar */}
          <div>
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Ação ao completar esta fase
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { val: "nenhuma",    label: "Nenhuma",         icon: ArrowRight,  desc: "Apenas avança" },
                { val: "contrato",   label: "Gerar contrato",  icon: FileText,    desc: "ZapSign automático" },
                { val: "agendamento",label: "Oferecer horários",icon: Calendar,   desc: "Google Calendar" },
                { val: "handoff",    label: "Chamar humano",   icon: User,        desc: "Pausa a IA" },
              ] as const).map(({ val, label, icon: Icon, desc }) => (
                <button key={val} onClick={() => patch({ acao: val })}
                  className={cn("p-2.5 rounded-lg border text-left transition-colors",
                    fase.acao === val ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={cn("h-3.5 w-3.5", fase.acao === val ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", fase.acao === val ? "text-primary" : "text-foreground")}>{label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────
function ConstrutorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg]           = useState<FunilConfig>({ ...CONFIG_INICIAL });
  const [expandedId, setExpanded] = useState<string | null>("abertura");
  const [preview, setPreview]   = useState<PreviewMsg[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [descricaoLivre, setDescricaoLivre] = useState("");
  const [gerandoFluxo, setGerandoFluxo]     = useState(false);
  const [gerandoScripts, setGerandoScripts] = useState(false);

  // Gerar fluxo completo a partir de descrição livre
  const gerarFluxoComIA = async () => {
    if (!descricaoLivre.trim()) {
      toast.error("Descreva o caso antes de gerar");
      return;
    }
    setGerandoFluxo(true);
    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Você é especialista em funis de atendimento jurídico via WhatsApp.
Com base na descrição do usuário, gere a configuração JSON do funil.
Retorne APENAS um JSON válido, sem markdown, com esta estrutura exata:
{
  "nome": "string",
  "descricao": "string",
  "servicoGratuito": boolean,
  "honorarios": "string ou vazio",
  "fases": [
    {
      "id": "abertura|triagem|conexao|fechamento|coleta|assinatura|encerrado",
      "perguntas": ["pergunta 1", "pergunta 2"],
      "exclusoes": [{"condicao": "...", "motivo": "..."}],
      "midias": ["video_abertura"],
      "textoAposMidia": "texto ou vazio",
      "acao": "nenhuma|contrato|agendamento|handoff",
      "camposColeta": ["nome","cpf","rg","endereco","nomeCrianca","idadeCrianca","municipio","protocolo","dataNascimento","temPrescricao","nomeMedico","email","estadoCivil","profissao"]
    }
  ]
}

REGRAS:
- perguntas: feitas uma por vez, em ordem lógica para qualificar o lead
- exclusoes: critérios que ENCERRAM o atendimento (lead não qualificado)
- midias: use video_abertura na fase abertura, video_conexao na conexao, audio_fechamento no fechamento, video_documentos na assinatura
- camposColeta: só na fase "coleta", escolha apenas os campos necessários para o contrato
- acao "contrato" APENAS na fase "coleta"
- Inclua TODAS as 7 fases mesmo que algumas não tenham configuração especial`,
          userMsg: `Caso jurídico: ${descricaoLivre}

Gere o fluxo completo com perguntas de triagem, critérios de exclusão, dados a coletar e ações corretas para cada fase.`,
        }),
      });

      if (!res.ok) throw new Error("Erro na API");
      const { prompt: jsonStr } = await res.json();

      // Limpar e parsear JSON
      const clean = jsonStr.replace(/```json|```/g, "").trim();
      const data = JSON.parse(clean);

      // Aplicar configurações geradas
      if (data.nome) setCfg(c => ({ ...c, nome: data.nome, descricao: data.descricao || c.descricao }));
      if (data.servicoGratuito !== undefined) setCfg(c => ({ ...c, servicoGratuito: data.servicoGratuito }));
      if (data.honorarios) setCfg(c => ({ ...c, honorarios: data.honorarios }));

      // Aplicar fases
      if (data.fases?.length) {
        setCfg(c => ({
          ...c,
          fases: c.fases.map(fase => {
            const faseGerada = data.fases.find((f: any) => f.id === fase.id);
            if (!faseGerada) return fase;
            return {
              ...fase,
              perguntas:      faseGerada.perguntas      ?? fase.perguntas,
              exclusoes:      faseGerada.exclusoes       ?? fase.exclusoes,
              midias:         faseGerada.midias          ?? fase.midias,
              textoAposMidia: faseGerada.textoAposMidia  ?? fase.textoAposMidia,
              acao:           faseGerada.acao             ?? fase.acao,
              camposColeta:   faseGerada.camposColeta     ?? fase.camposColeta,
            };
          }),
        }));
      }

      toast.success("Fluxo gerado! Revise cada fase e ajuste se necessário.");
      setExpanded("triagem"); // Abrir triagem para revisão
    } catch (e: any) {
      toast.error(`Erro ao gerar: ${e.message}`);
    } finally {
      setGerandoFluxo(false);
    }
  };

  // Gerar scripts de vídeo e áudio com IA
  const gerarScripts = async () => {
    const todasMidias: { faseId: string; faseLabel: string; chave: string; tipo: string }[] = [];
    cfg.fases.forEach(f => {
      f.midias.forEach(m => {
        if (m.trim()) todasMidias.push({
          faseId: f.id, faseLabel: f.label, chave: m,
          tipo: m.startsWith("audio_") ? "áudio" : "vídeo",
        });
      });
    });
    if (todasMidias.length === 0) { toast.error("Adicione mídias nas fases primeiro"); return; }

    setGerandoScripts(true);
    try {
      const listaMidias = todasMidias.map(m =>
        `- ${m.tipo.toUpperCase()} "${m.chave}" (fase ${m.faseLabel})`
      ).join("\n");

      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Você é especialista em criação de scripts para vídeos e áudios de advocacia via WhatsApp.
Gere scripts persuasivos e humanizados para cada mídia listada.
Retorne APENAS JSON válido com esta estrutura:
{
  "scripts": {
    "chave_da_midia": {
      "script": "texto exato do que falar no vídeo/áudio",
      "momento": "momento exato de envio na conversa"
    }
  }
}
Sem markdown, sem explicações, apenas o JSON.`,
          userMsg: `Funil: ${cfg.nome || "atendimento jurídico"}
Advogado: ${cfg.nomeDr}
Tom: ${cfg.tomVoz === "proximo" ? "próximo, humano, sem juridiquês" : "técnico e formal"}
Descrição: ${descricaoLivre || cfg.descricao || "atendimento jurídico via WhatsApp"}

Mídias a criar script:
${listaMidias}

Para cada mídia, crie:
1. Script completo do que falar (vídeo: o que aparecer/dizer na frente da câmera; áudio: o que gravar)
2. Momento exato de envio (ex: "Primeira mensagem do lead, antes de qualquer pergunta")

Lembre: vídeo de abertura → primeira mensagem sempre. Áudio de fechamento → após lead confirmar interesse.`,
        }),
      });

      if (!res.ok) throw new Error("Erro na API");
      const { prompt: jsonStr } = await res.json();
      const clean = jsonStr.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const data = JSON.parse(clean);

      if (data.scripts) {
        // Aplicar scripts nas fases corretas
        setCfg(c => ({
          ...c,
          fases: c.fases.map(fase => {
            const novosScripts = { ...fase.scriptsMedia };
            fase.midias.forEach(m => {
              if (data.scripts[m]) {
                novosScripts[m] = data.scripts[m];
              }
            });
            return { ...fase, scriptsMedia: novosScripts };
          }),
        }));
        toast.success(`Scripts gerados para ${Object.keys(data.scripts).length} mídias!`);
      }
    } catch (e: any) {
      toast.error(`Erro ao gerar scripts: ${e.message}`);
    } finally {
      setGerandoScripts(false);
    }
  };

  const patchFase = (id: string, fields: Partial<Fase>) => {
    setCfg(c => ({
      ...c,
      fases: c.fases.map(f => f.id === id ? { ...f, ...fields } : f),
    }));
  };

  // Gerar preview da conversa
  const gerarPreview = useCallback(() => {
    const msgs: PreviewMsg[] = [];
    const nomeDr = cfg.nomeDr || "Dr. Maicon";

    cfg.fases.forEach(fase => {
      if (!fase.ativo) return;

      // Mídias
      fase.midias.forEach(m => {
        const tipo = m.startsWith("audio_") ? "audio" : "video";
        msgs.push({ de: "ia", texto: `[${tipo}: ${m}]`, tipo });
      });

      // Texto após mídia
      if (fase.textoAposMidia) {
        msgs.push({ de: "ia", texto: fase.textoAposMidia });
      }

      // Perguntas
      fase.perguntas.forEach(p => {
        msgs.push({ de: "ia", texto: p });
        msgs.push({ de: "lead", texto: "..." });
      });

      // Exclusões (exemplo)
      if (fase.exclusoes.length > 0) {
        msgs.push({ de: "ia", texto: `[Se critério de exclusão: ${fase.exclusoes[0].motivo || "encerrar"}]` });
      }

      // Campos de coleta
      fase.camposColeta.forEach(campo => {
        const label = CAMPOS_DISPONIVEIS.find(c => c.key === campo)?.label || campo;
        msgs.push({ de: "ia", texto: `Preciso do seu ${label}.` });
        msgs.push({ de: "lead", texto: "..." });
      });

      // Ação
      if (fase.acao === "contrato") {
        msgs.push({ de: "ia", texto: "Perfeito! Gerando o contrato agora... 📄" });
      } else if (fase.acao === "agendamento") {
        msgs.push({ de: "ia", texto: "Vou verificar minha agenda para amanhã... 📅" });
      } else if (fase.acao === "handoff") {
        msgs.push({ de: "ia", texto: "Vou acionar minha equipe para falar diretamente com você. 👤" });
      }
    });

    setPreview(msgs);
    setShowPreview(true);
  }, [cfg]);

  // Gerar prompt e salvar funil
  const gerarESalvar = async () => {
    if (!cfg.nome.trim()) { toast.error("Defina o nome do funil"); return; }
    if (!user) return;
    setGenerating(true);

    try {
      // Montar descrição do funil para a IA
      const fasesDesc = cfg.fases.map(fase => {
        const partes = [];
        if (fase.midias.length > 0) partes.push(`Enviar mídias: ${fase.midias.join(", ")}`);
        if (fase.textoAposMidia) partes.push(`Após mídias perguntar: "${fase.textoAposMidia}"`);
        if (fase.perguntas.length > 0) partes.push(`Perguntar: ${fase.perguntas.map(p => `"${p}"`).join(" | ")}`);
        if (fase.exclusoes.length > 0) partes.push(`Excluir se: ${fase.exclusoes.map(e => `${e.condicao} → ${e.motivo}`).join("; ")}`);
        if (fase.id === "coleta" && fase.camposColeta.length > 0) partes.push(`Coletar: ${fase.camposColeta.join(", ")}`);
        if (fase.acao !== "nenhuma") partes.push(`Ação: ${fase.acao}`);
        return `${fase.emoji} ${fase.label}: ${partes.length > 0 ? partes.join(" | ") : "Transicionar para próxima fase"}`;
      }).join("\n");

      const userMsg = `Crie um prompt de atendimento WhatsApp para advogado com estas configurações:

ADVOGADO: ${cfg.nomeDr}
TOM: ${cfg.tomVoz === "proximo" ? "próximo e humano, sem juridiquês" : "técnico e formal"}
SERVIÇO: ${cfg.nome} — ${cfg.descricao || "atendimento jurídico"}
HONORÁRIOS: ${cfg.servicoGratuito ? "GRATUITO (pago pelo réu em caso de êxito)" : `R$ ${cfg.honorarios}`}

FLUXO DE FASES (seguir EXATAMENTE esta ordem):
${fasesDesc}

REGRAS OBRIGATÓRIAS:
- Responder SEMPRE em JSON: {"texto":"...","midias":[],"texto_pos_midia":null,"nova_fase":null,"acao":null,"dados_extraidos":{}}
- Uma pergunta por mensagem
- Nunca dizer que é IA ou robô
- Nunca prometer resultado garantido
- Se cliente pedir humano: acao "transferir_humano"
- Mídias disponíveis: ${cfg.fases.flatMap(f => f.midias).filter(Boolean).join(", ") || "video_abertura, video_conexao, audio_fechamento"}`;

      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Você é especialista em criar prompts para agentes de IA de advocacia via WhatsApp. 
Gere um prompt completo que instrui a IA a responder SEMPRE com JSON válido no formato especificado.
O prompt deve ser profissional, humanizado e seguir exatamente o fluxo de fases configurado.
CRÍTICO: O prompt gerado DEVE incluir a regra de que o campo "texto" sempre termina com uma pergunta ou call-to-action, nunca deixando o lead sem próxima ação.
Retorne APENAS o texto do prompt, sem JSON externo nem markdown.`,
          userMsg,
        }),
      });

      if (!res.ok) throw new Error("Erro ao gerar prompt");
      const { prompt } = await res.json();
      if (!prompt) throw new Error("IA não retornou prompt");

      // Salvar funil
      setSaving(true);
      const { error } = await supabase.from("funnels").insert({
        user_id:        user.id,
        name:           cfg.nome,
        description:    cfg.descricao,
        persona_prompt: prompt,
        proposal_is_free: cfg.servicoGratuito,
        proposal_value: cfg.servicoGratuito ? null : (cfg.honorarios ? Number(cfg.honorarios) : null),
        is_active:      true,
        medias:         {},
      });

      if (error) throw error;
      toast.success("Funil criado com sucesso!");
      setTimeout(() => navigate({ to: "/funis" }), 1200);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
      setSaving(false);
    }
  };

  const faseAtual = cfg.fases.find(f => f.id === expandedId);

  return (
    <div className="flex h-full overflow-hidden">
      <Toaster />

      {/* ── Painel esquerdo — construtor ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" /> Construtor de Funil
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure fase por fase o que a IA vai fazer</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={gerarPreview} className="gap-2">
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button onClick={gerarESalvar} disabled={generating || saving}
              className="gap-2 bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
              {generating ? "Gerando..." : saving ? "Salvando..." : "Gerar e Salvar"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* IA — Descreva o caso */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-foreground">Deixe a IA montar o fluxo</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Descreva o caso em linguagem normal — tipo de ação, critérios de qualificação,
                documentos necessários e se o serviço é gratuito. A IA preenche todas as fases automaticamente.
              </p>
              <Textarea
                value={descricaoLivre}
                onChange={e => setDescricaoLivre(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                placeholder={`Ex: "Atendo famílias que tiveram vaga em creche negada pelo município de Porto Alegre. A criança precisa ter até 5 anos e 11 meses, os pais precisam ter feito o pedido formal na prefeitura. O serviço é gratuito. Preciso coletar: nome dos pais, CPF, RG, endereço, nome da criança, data de nascimento e número do protocolo do pedido."`}
              />
              <div className="flex gap-2">
                <Button onClick={gerarFluxoComIA} disabled={gerandoFluxo || !descricaoLivre.trim()}
                  className="gap-2 flex-1">
                  <Sparkles className="h-4 w-4" />
                  {gerandoFluxo ? "Gerando fluxo..." : "Gerar fluxo completo"}
                </Button>
                <Button variant="outline" onClick={gerarScripts} disabled={gerandoScripts || cfg.fases.every(f => f.midias.length === 0)}
                  className="gap-2 flex-1">
                  <Mic className="h-4 w-4" />
                  {gerandoScripts ? "Gerando scripts..." : "Sugerir scripts de vídeo/áudio"}
                </Button>
              </div>
              {gerandoFluxo && (
                <div className="flex items-center gap-2 text-xs text-primary animate-pulse">
                  <Bot className="h-4 w-4" />
                  Analisando o caso e configurando cada fase...
                </div>
              )}
            </div>

            {/* Configurações básicas */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-sm text-foreground">Configurações gerais</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs">Nome do funil *</Label>
                  <Input className="mt-1" value={cfg.nome}
                    onChange={e => setCfg(c => ({ ...c, nome: e.target.value }))}
                    placeholder="Ex: Vaga em Creche — Porto Alegre" />
                </div>
                <div>
                  <Label className="text-xs">Nome do advogado</Label>
                  <Input className="mt-1" value={cfg.nomeDr}
                    onChange={e => setCfg(c => ({ ...c, nomeDr: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Tom de voz</Label>
                  <div className="flex gap-2 mt-1">
                    {[
                      { val: "proximo", label: "Próximo" },
                      { val: "formal",  label: "Formal" },
                    ].map(t => (
                      <button key={t.val} onClick={() => setCfg(c => ({ ...c, tomVoz: t.val as any }))}
                        className={cn("flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          cfg.tomVoz === t.val ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={cfg.servicoGratuito}
                    onCheckedChange={v => setCfg(c => ({ ...c, servicoGratuito: v }))} />
                  <Label className="text-xs">Serviço gratuito (honorários pagos pelo réu)</Label>
                </div>
                {!cfg.servicoGratuito && (
                  <div>
                    <Label className="text-xs">Valor dos honorários (R$)</Label>
                    <Input type="number" className="mt-1" value={cfg.honorarios}
                      onChange={e => setCfg(c => ({ ...c, honorarios: e.target.value }))}
                      placeholder="1500" />
                  </div>
                )}
                <div className="col-span-2">
                  <Label className="text-xs">Descrição do serviço</Label>
                  <Input className="mt-1" value={cfg.descricao}
                    onChange={e => setCfg(c => ({ ...c, descricao: e.target.value }))}
                    placeholder="Ex: Ação para garantir vaga em creche pública para crianças até 5 anos" />
                </div>
              </div>
            </div>

            {/* Fases */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm text-foreground">Fases do funil</h2>
                <p className="text-xs text-muted-foreground">Clique em cada fase para configurar</p>
              </div>
              <div className="space-y-2">
                {cfg.fases.map((fase, idx) => (
                  <FaseCard
                    key={fase.id}
                    fase={fase}
                    index={idx}
                    expanded={expandedId === fase.id}
                    onToggle={() => setExpanded(expandedId === fase.id ? null : fase.id)}
                    onChange={f => patchFase(fase.id, f)}
                    totalFases={cfg.fases.length}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Painel direito — preview ── */}
      {showPreview && (
        <div className="w-80 shrink-0 border-l border-border flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" /> Preview da conversa
            </p>
            <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ background: "#f0f2f5" }}>
            <PreviewConversa msgs={preview} />
          </div>
          <div className="p-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">
              Preview simplificado — teste completo em Funis → Simular
            </p>
          </div>
        </div>
      )}
    </div>
  );

}
