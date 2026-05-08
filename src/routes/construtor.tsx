import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
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
  ChevronRight, Plus, Trash2, Video, Mic, FileText,
  MessageSquare, Calendar, CheckCheck, X, Sparkles,
  Save, Bot, User, AlertCircle, Zap, Play, RefreshCw,
  Users, FileSignature, ArrowRight, Settings, Eye,
} from "lucide-react";

export const Route = createFileRoute("/construtor")({
  head: () => ({ meta: [{ title: "Construtor — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell noPadding><ConstrutorPage /></AppShell></AuthGate>
  ),
});

// ── Tipos ──────────────────────────────────────────────────────
type AcaoTipo = "contrato" | "agendamento" | "handoff" | "criar_grupo" | "nenhuma";
type Fase = {
  id: string; label: string; emoji: string; cor: string;
  perguntas: string[];
  exclusoes: { condicao: string; motivo: string }[];
  midias: { chave: string; script: string; momento: string }[];
  textoAposMidia: string;
  acao: AcaoTipo;
  camposColeta: string[];
};

type SimMsg = { de: "ia" | "lead"; texto: string; tipo?: string; delay?: number };

const FASES_PADRAO: Fase[] = [
  { id: "abertura",  label: "Abertura",       emoji: "🟢", cor: "#0d9488",
    perguntas: [], exclusoes: [], midias: [{ chave: "video_abertura", script: "", momento: "Primeira mensagem" }],
    textoAposMidia: "Me conta o que está acontecendo.", acao: "nenhuma", camposColeta: [] },
  { id: "triagem",   label: "Triagem",         emoji: "📋", cor: "#2563eb",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "conexao",   label: "Conexão",         emoji: "🤝", cor: "#d97706",
    perguntas: ["Posso abrir o seu caso agora?"], exclusoes: [], midias: [{ chave: "video_conexao", script: "", momento: "Após triagem" }],
    textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "fechamento",label: "Fechamento",      emoji: "🎯", cor: "#db2777",
    perguntas: ["O que eu falei faz sentido para você?"], exclusoes: [], midias: [{ chave: "audio_fechamento", script: "", momento: "Após conexão" }],
    textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
  { id: "coleta",    label: "Coleta de dados", emoji: "📝", cor: "#7c3aed",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "contrato",
    camposColeta: ["nome", "cpf", "rg", "endereco"] },
  { id: "assinatura",label: "Assinatura",      emoji: "✍️", cor: "#059669",
    perguntas: [], exclusoes: [], midias: [{ chave: "video_documentos", script: "", momento: "Após contrato" }],
    textoAposMidia: "", acao: "criar_grupo", camposColeta: [] },
  { id: "encerrado", label: "Encerrado",       emoji: "✅", cor: "#64748b",
    perguntas: [], exclusoes: [], midias: [], textoAposMidia: "", acao: "nenhuma", camposColeta: [] },
];

const CAMPOS = [
  { key: "nome", label: "Nome completo" }, { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" }, { key: "endereco", label: "Endereço" },
  { key: "dataNascimento", label: "Data de nascimento" }, { key: "municipio", label: "Município" },
  { key: "nomeCrianca", label: "Nome da criança" }, { key: "idadeCrianca", label: "Idade da criança" },
  { key: "protocolo", label: "Protocolo" }, { key: "email", label: "E-mail" },
  { key: "temPrescricao", label: "Tem prescrição?" }, { key: "nomeMedico", label: "Nome do médico" },
];

const ACOES = [
  { val: "nenhuma",    label: "Avançar fase",      icon: ArrowRight,     desc: "Só passa para a próxima" },
  { val: "contrato",   label: "Gerar contrato",     icon: FileSignature,  desc: "ZapSign automático" },
  { val: "agendamento",label: "Agendar consulta",   icon: Calendar,       desc: "Google Calendar" },
  { val: "criar_grupo",label: "Criar grupo",        icon: Users,          desc: "Grupo WhatsApp" },
  { val: "handoff",    label: "Chamar humano",      icon: User,           desc: "Pausa a IA" },
] as const;

// ── Simulador de conversa ──────────────────────────────────────
function Simulador({ fases, nomeDr, onClose }: { fases: Fase[]; nomeDr: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<SimMsg[]>([]);
  const [input, setInput] = useState("");
  const [faseIdx, setFaseIdx] = useState(0);
  const [perguntaIdx, setPerguntaIdx] = useState(0);
  const [campoIdx, setCampoIdx] = useState(0);
  const [etapa, setEtapa] = useState<"midia"|"pergunta"|"coleta"|"acao"|"fim">("midia");
  const [typing, setTyping] = useState(false);
  const [dados, setDados] = useState<Record<string,string>>({});
  const [log, setLog] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const fase = fases[faseIdx];

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const iaFala = useCallback((texto: string, tipo?: string) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs(prev => [...prev, { de: "ia", texto, tipo }]);
    }, 900);
  }, []);

  const avancarFase = useCallback((idx: number) => {
    const proxFase = fases[idx];
    if (!proxFase) { setEtapa("fim"); return; }
    setFaseIdx(idx);
    setPerguntaIdx(0);
    setCampoIdx(0);
    addLog(`→ Fase: ${proxFase.label}`);

    if (proxFase.midias.length > 0) {
      setEtapa("midia");
      setTimeout(() => {
        proxFase.midias.forEach((m, i) => {
          setTimeout(() => {
            const tipo = m.chave.startsWith("audio_") ? "audio" : "video";
            setMsgs(prev => [...prev, { de: "ia", texto: `[${tipo.toUpperCase()}: ${m.chave}]`, tipo }]);
          }, i * 1200);
        });
        setTimeout(() => {
          if (proxFase.textoAposMidia) iaFala(proxFase.textoAposMidia);
          setTimeout(() => {
            if (proxFase.perguntas.length > 0) { setEtapa("pergunta"); iaFala(proxFase.perguntas[0]); }
            else if (proxFase.camposColeta.length > 0) { setEtapa("coleta"); const c = CAMPOS.find(x => x.key === proxFase.camposColeta[0]); iaFala(`Para continuar, preciso do seu ${c?.label ?? proxFase.camposColeta[0]}.`); }
            else { setEtapa("acao"); processarAcao(proxFase, idx); }
          }, 1200);
        }, proxFase.midias.length * 1200 + 400);
      }, 400);
    } else if (proxFase.perguntas.length > 0) {
      setEtapa("pergunta");
      setTimeout(() => iaFala(proxFase.perguntas[0]), 400);
    } else if (proxFase.camposColeta.length > 0) {
      setEtapa("coleta");
      const c = CAMPOS.find(x => x.key === proxFase.camposColeta[0]);
      setTimeout(() => iaFala(`Para continuar, preciso do seu ${c?.label ?? proxFase.camposColeta[0]}.`), 400);
    } else {
      setEtapa("acao");
      setTimeout(() => processarAcao(proxFase, idx), 400);
    }
  }, [fases, iaFala]);

  const processarAcao = useCallback((f: Fase, idx: number) => {
    if (f.acao === "contrato") {
      addLog("⚡ Ação: Gerando contrato ZapSign...");
      iaFala("Perfeito! Estou gerando o contrato agora... 📄");
      setTimeout(() => {
        setMsgs(prev => [...prev, { de: "ia", texto: "✅ Contrato gerado! Você receberá o link de assinatura por e-mail.", tipo: "contrato" }]);
        addLog("✅ Contrato gerado com sucesso");
        setTimeout(() => avancarFase(idx + 1), 1500);
      }, 2000);
    } else if (f.acao === "agendamento") {
      addLog("📅 Ação: Buscando horários no Google Calendar...");
      iaFala("Vou verificar minha agenda... 📅");
      setTimeout(() => {
        setMsgs(prev => [...prev, { de: "ia", texto: "Tenho os seguintes horários disponíveis:\n\n• Amanhã às 14h\n• Quinta às 10h\n• Sexta às 16h\n\nQual prefere?" }]);
        addLog("📅 3 horários oferecidos");
        setEtapa("pergunta");
      }, 1500);
    } else if (f.acao === "criar_grupo") {
      addLog("👥 Ação: Criando grupo WhatsApp...");
      iaFala("Criando um grupo para acompanharmos juntos o seu caso... 👥");
      setTimeout(() => {
        setMsgs(prev => [...prev, { de: "ia", texto: "✅ Grupo criado! Você já recebeu o convite. Lá vamos enviar todas as atualizações do processo.", tipo: "grupo" }]);
        addLog("✅ Grupo WhatsApp criado");
        setTimeout(() => avancarFase(idx + 1), 1500);
      }, 2000);
    } else if (f.acao === "handoff") {
      addLog("👤 Ação: Transferindo para humano...");
      setMsgs(prev => [...prev, { de: "ia", texto: "Vou acionar minha equipe agora. Em breve alguém vai falar diretamente com você! 👤", tipo: "handoff" }]);
      setEtapa("fim");
      addLog("🔚 IA pausada — atendimento humano");
    } else {
      avancarFase(idx + 1);
    }
  }, [iaFala, avancarFase]);

  // Iniciar simulação
  useEffect(() => {
    setMsgs([{ de: "ia", texto: `Olá! Aqui é o ${nomeDr || "Dr. Maicon"}. Como posso ajudar?` }]);
    addLog("🟢 Simulação iniciada");
    setTimeout(() => avancarFase(0), 600);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const responder = () => {
    if (!input.trim() || typing) return;
    const resp = input.trim();
    setInput("");
    setMsgs(prev => [...prev, { de: "lead", texto: resp }]);

    // Verificar exclusões
    const exclusoesAtivas = fase.exclusoes;
    const excluido = exclusoesAtivas.find(e => e.condicao && resp.toLowerCase().includes(e.condicao.toLowerCase().split(" ")[0]));
    if (excluido) {
      addLog(`❌ Exclusão: ${excluido.condicao}`);
      setTimeout(() => {
        iaFala(`Entendo. Infelizmente, ${excluido.motivo}. Obrigado pelo contato!`);
        setEtapa("fim");
      }, 600);
      return;
    }

    if (etapa === "pergunta") {
      const proximo = perguntaIdx + 1;
      if (proximo < fase.perguntas.length) {
        setPerguntaIdx(proximo);
        setTimeout(() => iaFala(fase.perguntas[proximo]), 600);
      } else if (fase.camposColeta.length > 0) {
        setEtapa("coleta");
        const c = CAMPOS.find(x => x.key === fase.camposColeta[0]);
        setTimeout(() => iaFala(`Precisarei de alguns dados para abrir o caso. Qual é o seu ${c?.label ?? fase.camposColeta[0]}?`), 600);
      } else {
        setEtapa("acao");
        setTimeout(() => processarAcao(fase, faseIdx), 600);
      }
    } else if (etapa === "coleta") {
      const campo = fase.camposColeta[campoIdx];
      setDados(prev => ({ ...prev, [campo]: resp }));
      addLog(`📝 ${campo}: ${resp}`);
      const proximo = campoIdx + 1;
      if (proximo < fase.camposColeta.length) {
        setCampoIdx(proximo);
        const c = CAMPOS.find(x => x.key === fase.camposColeta[proximo]);
        setTimeout(() => iaFala(`Obrigado! E o seu ${c?.label ?? fase.camposColeta[proximo]}?`), 600);
      } else {
        setEtapa("acao");
        setTimeout(() => processarAcao(fase, faseIdx), 600);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl h-[85vh] flex gap-4 overflow-hidden">

        {/* Chat */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden border border-border shadow-2xl" style={{ background: "#111b21" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#202c33" }}>
            <div className="h-9 w-9 rounded-full bg-[#25d366]/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-[#25d366]" />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{nomeDr || "Dr. Maicon"}</p>
              <p className="text-[#8696a0] text-xs flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#25d366] inline-block" />
                Simulação em andamento
              </p>
            </div>
            <button onClick={onClose} className="text-[#8696a0] hover:text-white p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.de === "ia" ? "justify-start" : "justify-end")}>
                {m.de === "ia" && (
                  <div className="h-7 w-7 rounded-full shrink-0 mr-2 mt-1 flex items-center justify-center" style={{ background: "#2a3942" }}>
                    <Bot className="h-3.5 w-3.5 text-[#25d366]" />
                  </div>
                )}
                <div className={cn("max-w-[70%] px-3 py-2 rounded-xl text-sm leading-relaxed",
                  m.de === "ia" ? "rounded-tl-none" : "rounded-tr-none")}
                  style={{ background: m.de === "ia" ? "#202c33" : "#005c4b" }}>
                  {m.tipo === "video" && <div className="flex items-center gap-1.5 mb-1 text-blue-400 text-xs"><Video className="h-3.5 w-3.5" /> Vídeo enviado</div>}
                  {m.tipo === "audio" && <div className="flex items-center gap-1.5 mb-1 text-violet-400 text-xs"><Mic className="h-3.5 w-3.5" /> Áudio enviado</div>}
                  {m.tipo === "contrato" && <div className="flex items-center gap-1.5 mb-1 text-emerald-400 text-xs"><FileSignature className="h-3.5 w-3.5" /> Contrato gerado</div>}
                  {m.tipo === "grupo" && <div className="flex items-center gap-1.5 mb-1 text-cyan-400 text-xs"><Users className="h-3.5 w-3.5" /> Grupo criado</div>}
                  <p className="text-white whitespace-pre-line">{m.texto}</p>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="h-7 w-7 rounded-full shrink-0 mr-2 flex items-center justify-center" style={{ background: "#2a3942" }}>
                  <Bot className="h-3.5 w-3.5 text-[#25d366]" />
                </div>
                <div className="px-4 py-3 rounded-xl rounded-tl-none" style={{ background: "#202c33" }}>
                  <div className="flex gap-1">
                    {[0,1,2].map(i => <div key={i} className="h-2 w-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 shrink-0" style={{ background: "#202c33" }}>
            {etapa === "fim" ? (
              <div className="text-center text-[#8696a0] text-sm py-2">Simulação encerrada ✅</div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && responder()}
                  placeholder="Digite a resposta do lead..."
                  className="flex-1 bg-[#2a3942] rounded-lg px-3 py-2 text-white text-sm placeholder-[#8696a0] outline-none"
                  disabled={typing}
                />
                <button onClick={responder} disabled={typing || !input.trim()}
                  className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-40"
                  style={{ background: "#25d366" }}>
                  <ArrowRight className="h-4 w-4 text-black" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Log lateral */}
        <div className="w-64 shrink-0 flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> Log de ações
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {log.map((l, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-2">{l}</p>
            ))}
            {log.length === 0 && <p className="text-xs text-muted-foreground italic">Aguardando...</p>}
          </div>
          {/* Dados coletados */}
          {Object.keys(dados).length > 0 && (
            <div className="border-t border-border p-3">
              <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Dados coletados
              </p>
              {Object.entries(dados).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground capitalize">{k}:</span>
                  <span className="text-foreground font-medium truncate ml-2 max-w-[100px]">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card de fase ───────────────────────────────────────────────
function FaseCard({ fase, active, onClick, onChange, hasConfig }: {
  fase: Fase; active: boolean; onClick: () => void;
  onChange: (f: Fase) => void; hasConfig: boolean;
}) {
  const patch = (fields: Partial<Fase>) => onChange({ ...fase, ...fields });
  const addPergunta = () => patch({ perguntas: [...fase.perguntas, ""] });
  const setPerg = (i: number, v: string) => { const a = [...fase.perguntas]; a[i] = v; patch({ perguntas: a }); };
  const rmPerg = (i: number) => patch({ perguntas: fase.perguntas.filter((_,j) => j !== i) });
  const addExcl = () => patch({ exclusoes: [...fase.exclusoes, { condicao: "", motivo: "" }] });
  const setExcl = (i: number, f: "condicao"|"motivo", v: string) => { const a = [...fase.exclusoes]; a[i] = { ...a[i], [f]: v }; patch({ exclusoes: a }); };
  const rmExcl = (i: number) => patch({ exclusoes: fase.exclusoes.filter((_,j) => j !== i) });
  const addMidia = () => patch({ midias: [...fase.midias, { chave: "", script: "", momento: "" }] });
  const setMidia = (i: number, f: "chave"|"script"|"momento", v: string) => { const a = [...fase.midias]; a[i] = { ...a[i], [f]: v }; patch({ midias: a }); };
  const rmMidia = (i: number) => patch({ midias: fase.midias.filter((_,j) => j !== i) });
  const toggleCampo = (key: string) => patch({ camposColeta: fase.camposColeta.includes(key) ? fase.camposColeta.filter(k => k !== key) : [...fase.camposColeta, key] });

  return (
    <div className={cn("rounded-xl border transition-all duration-200", active ? "border-primary/50 shadow-md" : "border-border hover:border-primary/30")}>
      {/* Header clicável */}
      <button onClick={onClick} className="w-full flex items-center gap-3 p-3.5 text-left">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center text-lg shrink-0 border"
          style={{ borderColor: fase.cor + "40", background: fase.cor + "15" }}>
          {fase.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{fase.label}</span>
            {hasConfig && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: fase.cor + "20", color: fase.cor }}>configurado</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {fase.midias.length > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{fase.midias.length}</span>}
            {fase.perguntas.length > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{fase.perguntas.length}</span>}
            {fase.camposColeta.length > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{fase.camposColeta.length} campos</span>}
            {fase.acao !== "nenhuma" && <span className="text-[10px] flex items-center gap-0.5" style={{ color: fase.cor }}><Zap className="h-2.5 w-2.5" />{ACOES.find(a => a.val === fase.acao)?.label}</span>}
          </div>
        </div>
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", active && "rotate-90")} />
      </button>

      {/* Config expandida */}
      {active && (
        <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">

          {/* MÍDIAS */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <Label className="text-xs font-medium flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-blue-500" />Mídias</Label>
              <button onClick={addMidia} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Adicionar</button>
            </div>
            {fase.midias.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma mídia nesta fase.</p>}
            {fase.midias.map((m, i) => (
              <div key={i} className="mb-3 rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 p-2 bg-muted/30">
                  {m.chave.startsWith("audio_") ? <Mic className="h-3.5 w-3.5 text-violet-500 shrink-0" /> : <Video className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                  <Input value={m.chave} onChange={e => setMidia(i, "chave", e.target.value)}
                    placeholder="video_abertura ou audio_fechamento"
                    className="flex-1 text-xs h-7 font-mono bg-transparent border-0 shadow-none focus-visible:ring-0" />
                  <button onClick={() => rmMidia(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {m.chave && (
                  <div className="p-2.5 space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">
                        {m.chave.startsWith("audio_") ? "🎤 Script do áudio" : "🎬 Script do vídeo"}
                      </p>
                      <Textarea value={m.script} onChange={e => setMidia(i, "script", e.target.value)} rows={2}
                        className="text-xs resize-none" placeholder="O que você vai falar..." />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">⏱ Momento de envio</p>
                      <Input value={m.momento} onChange={e => setMidia(i, "momento", e.target.value)}
                        className="text-xs h-7" placeholder="Ex: Primeira mensagem do lead" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {fase.midias.length > 0 && (
              <div>
                <Label className="text-xs">Mensagem após as mídias</Label>
                <Input value={fase.textoAposMidia} onChange={e => patch({ textoAposMidia: e.target.value })}
                  className="mt-1 text-xs" placeholder='Ex: "Me conta o que está acontecendo."' />
              </div>
            )}
          </div>

          {/* PERGUNTAS */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <Label className="text-xs font-medium flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-emerald-500" />Perguntas</Label>
              <button onClick={addPergunta} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Adicionar</button>
            </div>
            {fase.perguntas.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma pergunta.</p>}
            {fase.perguntas.map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground w-4 shrink-0 font-mono">{i+1}.</span>
                <Input value={p} onChange={e => setPerg(i, e.target.value)} className="flex-1 text-xs h-8" placeholder="Ex: Qual o nome da criança?" />
                <button onClick={() => rmPerg(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          {/* EXCLUSÕES */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <Label className="text-xs font-medium flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-red-500" />Exclusões</Label>
              <button onClick={addExcl} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Adicionar</button>
            </div>
            {fase.exclusoes.map((ex, i) => (
              <div key={i} className="mb-2 p-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/40 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Input value={ex.condicao} onChange={e => setExcl(i, "condicao", e.target.value)} className="text-xs h-7" placeholder="Se o lead tiver / disser... (ex: mais de 6 anos)" />
                    <Input value={ex.motivo} onChange={e => setExcl(i, "motivo", e.target.value)} className="text-xs h-7" placeholder="Motivo do encerramento (ex: só atendemos até 5 anos)" />
                  </div>
                  <button onClick={() => rmExcl(i)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* COLETA */}
          {fase.id === "coleta" && (
            <div>
              <Label className="text-xs font-medium flex items-center gap-1.5 mb-2.5"><FileText className="h-3.5 w-3.5 text-purple-500" />Dados para o contrato</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CAMPOS.map(({ key, label }) => {
                  const sel = fase.camposColeta.includes(key);
                  return (
                    <button key={key} onClick={() => toggleCampo(key)}
                      className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs text-left transition-all",
                        sel ? "border-primary/50 bg-primary/5 text-primary" : "border-border hover:bg-muted/50 text-muted-foreground")}>
                      <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors", sel ? "bg-primary border-primary" : "border-muted-foreground")}>
                        {sel && <CheckCheck className="h-2.5 w-2.5 text-white" />}
                      </div>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* AÇÃO */}
          <div>
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-2.5"><Zap className="h-3.5 w-3.5 text-amber-500" />Ação ao completar</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {ACOES.map(({ val, label, icon: Icon, desc }) => (
                <button key={val} onClick={() => patch({ acao: val as AcaoTipo })}
                  className={cn("p-2.5 rounded-lg border text-left transition-all",
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
  const navigate  = useNavigate();
  const [fases, setFases]           = useState<Fase[]>(FASES_PADRAO.map(f => ({ ...f })));
  const [activeId, setActiveId]     = useState<string | null>("abertura");
  const [nomeFunil, setNomeFunil]   = useState("");
  const [nomeDr, setNomeDr]         = useState("Dr. Maicon Matos");
  const [descricao, setDescricao]   = useState("");
  const [descLivre, setDescLivre]   = useState("");
  const [simOpen, setSimOpen]       = useState(false);
  const [gerandoFluxo, setGerandoFluxo] = useState(false);
  const [gerandoScripts, setGerandoScripts] = useState(false);
  const [salvando, setSalvando]     = useState(false);

  const patchFase = (id: string, f: Fase) => setFases(prev => prev.map(x => x.id === id ? f : x));

  const totalConfig = fases.reduce((a, f) =>
    a + f.perguntas.length + f.midias.length + f.exclusoes.length + f.camposColeta.length +
    (f.acao !== "nenhuma" ? 1 : 0), 0);

  const gerarFluxo = async () => {
    if (!descLivre.trim()) { toast.error("Descreva o caso primeiro"); return; }
    setGerandoFluxo(true);
    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Você é especialista em funis de atendimento jurídico via WhatsApp.
Com base na descrição, gere configuração JSON. Retorne APENAS JSON válido:
{
  "nome": "string",
  "fases": [
    { "id": "abertura|triagem|conexao|fechamento|coleta|assinatura|encerrado",
      "perguntas": ["..."],
      "exclusoes": [{"condicao":"...","motivo":"..."}],
      "midias": [{"chave":"video_abertura","script":"...","momento":"..."}],
      "textoAposMidia": "...",
      "acao": "nenhuma|contrato|agendamento|criar_grupo|handoff",
      "camposColeta": ["nome","cpf","rg","endereco","municipio","nomeCrianca","idadeCrianca","protocolo","dataNascimento","temPrescricao","nomeMedico","email"] }
  ]
}
REGRAS: video_abertura na abertura, video_conexao na conexão, audio_fechamento no fechamento, video_documentos na assinatura. acao "contrato" só na coleta. acao "criar_grupo" só na assinatura. Inclua todas as 7 fases.`,
          userMsg: descLivre,
        }),
      });
      const { prompt: json } = await res.json();
      const data = JSON.parse(json.replace(/```json|```/g, "").trim());
      if (data.nome) setNomeFunil(data.nome);
      if (data.fases) {
        setFases(prev => prev.map(fase => {
          const g = data.fases.find((f: any) => f.id === fase.id);
          if (!g) return fase;
          return { ...fase, perguntas: g.perguntas ?? [], exclusoes: g.exclusoes ?? [],
            midias: g.midias ?? [], textoAposMidia: g.textoAposMidia ?? "",
            acao: g.acao ?? "nenhuma", camposColeta: g.camposColeta ?? [] };
        }));
      }
      toast.success("Fluxo gerado! Revise e ajuste cada fase.");
      setActiveId("triagem");
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setGerandoFluxo(false); }
  };

  const gerarScripts = async () => {
    const todas = fases.flatMap(f => f.midias.filter(m => m.chave && !m.script));
    if (todas.length === 0) { toast.info("Todas as mídias já têm script."); return; }
    setGerandoScripts(true);
    try {
      const lista = fases.flatMap(f => f.midias.map(m => `${f.label}: ${m.chave.startsWith("audio_") ? "áudio" : "vídeo"} "${m.chave}"`)).join("\n");
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Gere scripts para mídias de advocacia WhatsApp. JSON apenas: {"scripts":{"chave":{"script":"...","momento":"..."}}}`,
          userMsg: `Funil: ${nomeFunil || descLivre}\nAdvogado: ${nomeDr}\nMídias:\n${lista}`,
        }),
      });
      const { prompt: json } = await res.json();
      const data = JSON.parse(json.replace(/```json|```/g, "").trim());
      if (data.scripts) {
        setFases(prev => prev.map(f => ({
          ...f, midias: f.midias.map(m => data.scripts[m.chave]
            ? { ...m, script: data.scripts[m.chave].script || m.script, momento: data.scripts[m.chave].momento || m.momento }
            : m)
        })));
        toast.success("Scripts gerados para " + Object.keys(data.scripts).length + " mídias!");
      }
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setGerandoScripts(false); }
  };

  const salvar = async () => {
    if (!nomeFunil.trim()) { toast.error("Defina o nome do funil"); return; }
    if (!user) return;
    setSalvando(true);
    try {
      const fasesDesc = fases.map(f => {
        const partes = [];
        f.midias.forEach(m => partes.push(`Enviar ${m.chave.startsWith("audio_") ? "áudio" : "vídeo"} ${m.chave}`));
        if (f.textoAposMidia) partes.push(`Após mídias: "${f.textoAposMidia}"`);
        f.perguntas.forEach(p => partes.push(`Perguntar: "${p}"`));
        f.exclusoes.forEach(e => partes.push(`Excluir se: ${e.condicao} → ${e.motivo}`));
        if (f.camposColeta.length) partes.push(`Coletar: ${f.camposColeta.join(", ")}`);
        if (f.acao !== "nenhuma") partes.push(`Ação: ${f.acao}`);
        return `${f.emoji} ${f.label}: ${partes.join(" | ") || "Avançar fase"}`;
      }).join("\n");

      const promptRes = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Crie um prompt operacional para agente de IA de advocacia WhatsApp.
CRÍTICO: campo "texto" SEMPRE termina com pergunta ou call-to-action. Nunca responda só "Entendido." sem continuar.
Retorne APENAS o texto do prompt, sem markdown.`,
          userMsg: `Advogado: ${nomeDr}\nFunil: ${nomeFunil}\n${descricao}\n\nFluxo:\n${fasesDesc}`,
        }),
      });
      const { prompt } = await promptRes.json();
      const { error } = await supabase.from("funnels").insert({
        user_id: user.id, name: nomeFunil, description: descricao,
        persona_prompt: prompt, is_active: true, medias: {},
      });
      if (error) throw error;
      toast.success("Funil salvo com sucesso!");
      setTimeout(() => navigate({ to: "/funis" }), 1200);
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Toaster />
      {simOpen && <Simulador fases={fases} nomeDr={nomeDr} onClose={() => setSimOpen(false)} />}

      {/* ── Coluna esquerda: timeline de fases ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border bg-muted/20">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" /> Fases do funil
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{totalConfig} itens configurados</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {fases.map((fase, idx) => {
            const hasConfig = fase.perguntas.length > 0 || fase.midias.length > 0 || fase.exclusoes.length > 0 || fase.camposColeta.length > 0 || fase.acao !== "nenhuma";
            return (
              <div key={fase.id} className="relative">
                {idx < fases.length - 1 && (
                  <div className="absolute left-5 top-11 bottom-0 w-0.5 -mb-1.5" style={{ background: fase.cor + "30" }} />
                )}
                <button onClick={() => setActiveId(activeId === fase.id ? null : fase.id)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                    activeId === fase.id ? "shadow-sm border" : "hover:bg-muted/50 border border-transparent")}
                  style={activeId === fase.id ? { borderColor: fase.cor + "40", background: fase.cor + "08" } : {}}>
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center text-base shrink-0"
                    style={{ background: fase.cor + "20" }}>
                    {fase.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{fase.label}</p>
                    <p className="text-[10px] text-muted-foreground">{hasConfig ? `${[fase.midias.length > 0 && `${fase.midias.length} míd`, fase.perguntas.length > 0 && `${fase.perguntas.length} perg`, fase.acao !== "nenhuma" && fase.acao].filter(Boolean).join(" · ")}` : "não configurado"}</p>
                  </div>
                  {hasConfig && <div className="h-2 w-2 rounded-full shrink-0" style={{ background: fase.cor }} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Botões de ação */}
        <div className="p-3 border-t border-border space-y-2">
          <Button onClick={() => setSimOpen(true)} variant="outline" className="w-full gap-2 text-sm">
            <Play className="h-3.5 w-3.5 text-green-500" /> Simular conversa
          </Button>
          <Button onClick={salvar} disabled={salvando || !nomeFunil.trim()} className="w-full gap-2 text-sm">
            <Save className="h-3.5 w-3.5" />
            {salvando ? "Salvando..." : "Gerar e salvar funil"}
          </Button>
        </div>
      </div>

      {/* ── Coluna direita: config ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-lg">
              <input value={nomeFunil} onChange={e => setNomeFunil(e.target.value)}
                placeholder="Nome do funil (ex: Vaga em Creche — Porto Alegre)"
                className="w-full text-lg font-bold bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground" />
              <input value={nomeDr} onChange={e => setNomeDr(e.target.value)}
                placeholder="Nome do advogado"
                className="w-full text-sm bg-transparent border-0 outline-none text-muted-foreground placeholder-muted-foreground/50" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={gerarScripts} disabled={gerandoScripts} className="gap-1.5 text-xs">
                <Mic className="h-3.5 w-3.5" />
                {gerandoScripts ? "Gerando..." : "Scripts com IA"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!activeId ? (
            /* Tela inicial — descreva para IA gerar */
            <div className="max-w-2xl mx-auto p-6 space-y-6">
              <div className="rounded-2xl border-2 border-dashed border-primary/30 p-6 space-y-4 bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Deixe a IA montar o fluxo</h3>
                    <p className="text-xs text-muted-foreground">Descreva o caso e ela configura todas as fases</p>
                  </div>
                </div>
                <Textarea value={descLivre} onChange={e => setDescLivre(e.target.value)} rows={5}
                  className="resize-none text-sm"
                  placeholder={`Ex: "Atendo famílias com vaga em creche negada em Porto Alegre. A criança tem que ter até 5a11m e os pais precisam ter feito o pedido formal na prefeitura com protocolo. Serviço gratuito. Preciso coletar: nome, CPF, RG, endereço, nome da criança, data de nascimento e protocolo."`} />
                <Button onClick={gerarFluxo} disabled={gerandoFluxo || !descLivre.trim()} className="w-full gap-2">
                  <Sparkles className="h-4 w-4" />
                  {gerandoFluxo ? "Analisando e configurando cada fase..." : "Gerar fluxo completo com IA"}
                </Button>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">ou clique em uma fase na esquerda para configurar manualmente</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: "🎬", title: "Vídeo automático", desc: "Enviado na primeira mensagem" },
                  { icon: "🤖", title: "IA qualifica", desc: "Pergunta a pergunta, sem travar" },
                  { icon: "📄", title: "Contrato + grupo", desc: "Gerados automaticamente" },
                ].map(card => (
                  <div key={card.title} className="rounded-xl border border-border p-4 text-center">
                    <div className="text-2xl mb-2">{card.icon}</div>
                    <p className="text-sm font-medium text-foreground">{card.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Config da fase ativa */
            <div className="max-w-2xl mx-auto p-6">
              {fases.filter(f => f.id === activeId).map(fase => (
                <FaseCard key={fase.id} fase={fase} active={true}
                  onClick={() => {}} hasConfig={fase.perguntas.length > 0 || fase.midias.length > 0 || fase.exclusoes.length > 0 || fase.camposColeta.length > 0 || fase.acao !== "nenhuma"}
                  onChange={f => patchFase(fase.id, f)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
