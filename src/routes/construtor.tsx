import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ChevronRight, ChevronUp, ChevronDown, Plus, Trash2, Video, Mic, FileText,
  MessageSquare, Calendar, CheckCheck, X, Sparkles, Image,
  Save, Bot, User, AlertCircle, Zap, Play, Users,
  FileSignature, ArrowRight, Settings, LayoutGrid,
  CheckCircle2, Circle, History, Copy, Wand2, Search, HelpCircle,
} from "lucide-react";
import {
  type AcaoTipo, type Fase, type Versao, type BriefingFunil, type AuditResult,
  type Step, type StepTipo, type MidiaTipo,
  BRIEFING_PADRAO, AREAS_JURIDICAS, REGRAS_GLOBAIS_PADRAO, CHECKLIST_QUALIDADE,
  TESTES_SIMULACAO, SUGESTOES_PERGUNTAS, FASES_PADRAO, CAMPOS, ACOES, TEMPLATES,
  fasePct, uid,
} from "@/lib/construtor-data";
import { Simulador } from "@/components/construtor/Simulador";

export const Route = createFileRoute("/construtor")({
  head: () => ({ meta: [{ title: "Construtor — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell noPadding><ConstrutorPage /></AppShell></AuthGate>
  ),
});

// ── Visão geral do funil ───────────────────────────────────────
function VisaoGeral({ fases, onSelectFase }: { fases: Fase[]; onSelectFase: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {fases.map((f, idx) => {
        const pct = fasePct(f);
        return (
          <button key={f.id} onClick={() => onSelectFase(f.id)}
            className="w-full flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left group">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: f.cor + "15" }}>{f.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-foreground">{f.label}</span>
                <span className={cn("text-xs font-bold", pct === 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-400")}>{pct}%</span>
              </div>
              {/* Barra de progresso */}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : pct >= 50 ? f.cor : "#f87171" }} />
              </div>
              {/* Resumo */}
              <div className="flex flex-wrap gap-2">
                {(f.steps ?? []).length > 0 ? (
                  <>
                    {(f.steps ?? []).filter(s => s.tipo === "midia").length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{(f.steps ?? []).filter(s => s.tipo === "midia").length} mídia</span>}
                    {(f.steps ?? []).filter(s => s.tipo === "pergunta").length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 flex items-center gap-0.5"><HelpCircle className="h-2.5 w-2.5" />{(f.steps ?? []).filter(s => s.tipo === "pergunta").length} perg.</span>}
                    {(f.steps ?? []).filter(s => s.tipo === "ia").length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />IA livre</span>}
                  </>
                ) : (
                  <>
                    {f.midias.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-0.5"><Video className="h-2.5 w-2.5" />{f.midias.length} mídia{f.midias.length > 1 ? "s" : ""}</span>}
                    {f.perguntas.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{f.perguntas.length} perg.</span>}
                  </>
                )}
                {f.exclusoes.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" />{f.exclusoes.length} exclus.</span>}
                {f.camposColeta.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{f.camposColeta.length} campos</span>}
                {f.acao !== "nenhuma" && <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium" style={{ background: f.cor + "15", color: f.cor }}><Zap className="h-2.5 w-2.5" />{ACOES.find(a => a.val === f.acao)?.label}</span>}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 mt-1 transition-colors" />
          </button>
        );
      })}
    </div>
  );
}

// ── Upload de mídia por step ───────────────────────────────────
const ACCEPT_MIDIA = "video/mp4,audio/mpeg,audio/mp4,audio/ogg,audio/wav,image/jpeg,image/png,image/webp,application/pdf";

function MidiaUploadBlock({ step, patch }: {
  step: { midiaTipo?: MidiaTipo; midiaChave?: string; midiaUrl?: string; midiaFileName?: string; midiaScript?: string; midiaDelaySegundos?: number };
  patch: (fields: Partial<Step>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const form = new FormData();
      form.append("file", file);
      form.append("slug", "funil-midias");

      const res = await fetch("/api/lead-magnet-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Erro no upload");

      const inferredTipo: MidiaTipo =
        file.type.startsWith("video/") ? "video" :
        file.type.startsWith("audio/") ? "audio" :
        file.type.startsWith("image/") ? "imagem" : "documento";

      const safeName = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
      const autoChave = step.midiaChave || `${inferredTipo}_${safeName}`;

      patch({ midiaUrl: json.url, midiaFileName: file.name, midiaTipo: inferredTipo, midiaChave: autoChave });
      toast.success("Arquivo enviado!");
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2.5">
      {/* Tipo selector */}
      <div className="flex gap-1.5 flex-wrap">
        {MIDIA_META.map(mt => (
          <button key={mt.val} onClick={() => patch({ midiaTipo: mt.val })}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all",
              step.midiaTipo === mt.val ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground hover:bg-muted/50")}>
            <mt.icon className="h-3 w-3" />{mt.label}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      {step.midiaUrl ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="flex-1 text-xs text-emerald-800 truncate">{step.midiaFileName ?? "Arquivo enviado"}</span>
          <button onClick={() => patch({ midiaUrl: undefined, midiaFileName: undefined })}
            className="text-emerald-400 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-5 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <input ref={fileRef} type="file" accept={ACCEPT_MIDIA} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          {uploading ? (
            <p className="text-xs text-muted-foreground">Enviando...</p>
          ) : (
            <>
              <p className="text-xs font-medium text-foreground">Arraste o arquivo ou clique para enviar</p>
              <p className="text-[10px] text-muted-foreground mt-1">Vídeo, áudio, imagem ou PDF</p>
            </>
          )}
        </div>
      )}

      {/* Chave de referência */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-semibold">Chave de referência</p>
        <Input value={step.midiaChave ?? ""} onChange={e => patch({ midiaChave: e.target.value })}
          className="text-xs h-7 font-mono" placeholder={`Ex: ${step.midiaTipo ?? "video"}_abertura`} />
      </div>

      {/* Delay */}
      <div className="flex items-center gap-2">
        <Input type="number" min={0} max={600}
          value={step.midiaDelaySegundos ?? ""}
          onChange={e => patch({ midiaDelaySegundos: e.target.value ? Number(e.target.value) : undefined })}
          className="text-xs h-7 w-24" placeholder="60" />
        <span className="text-xs text-muted-foreground">seg. aguardar antes da próxima mensagem</span>
      </div>
    </div>
  );
}

// ── Step helpers ───────────────────────────────────────────────
const STEP_META: Record<StepTipo, { label: string; icon: React.ElementType; border: string; header: string }> = {
  mensagem: { label: "Mensagem",      icon: MessageSquare, border: "border-blue-200",   header: "bg-blue-50 text-blue-700" },
  ia:       { label: "Instrução IA",  icon: Sparkles,      border: "border-violet-200", header: "bg-violet-50 text-violet-700" },
  midia:    { label: "Mídia",         icon: Video,         border: "border-emerald-200",header: "bg-emerald-50 text-emerald-700" },
  pergunta: { label: "Pergunta",      icon: HelpCircle,    border: "border-amber-200",  header: "bg-amber-50 text-amber-700" },
};

const MIDIA_META: { val: MidiaTipo; label: string; icon: React.ElementType }[] = [
  { val: "video",     label: "Vídeo",     icon: Video },
  { val: "audio",     label: "Áudio",     icon: Mic },
  { val: "imagem",    label: "Imagem",    icon: Image },
  { val: "documento", label: "Documento", icon: FileText },
];

function StepCard({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown }: {
  step: Step; index: number; total: number;
  onChange: (s: Step) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const patch = (fields: Partial<Step>) => onChange({ ...step, ...fields });
  const meta = STEP_META[step.tipo];

  return (
    <div className={cn("rounded-xl border overflow-hidden", meta.border)}>
      <div className={cn("flex items-center gap-2 px-3 py-2", meta.header)}>
        <meta.icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-semibold flex-1">{meta.label}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0}
            className="p-1 rounded hover:bg-black/10 disabled:opacity-30 transition-opacity">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="p-1 rounded hover:bg-black/10 disabled:opacity-30 transition-opacity">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-100 hover:text-red-600 ml-1 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 bg-card space-y-2.5">
        {step.tipo === "mensagem" && (
          <>
            <div className="flex gap-1.5 mb-1">
              <button onClick={() => patch({ usarIA: false })}
                className={cn("text-[10px] px-2.5 py-1 rounded-full border transition-all",
                  !step.usarIA ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold" : "border-border text-muted-foreground")}>
                Texto fixo
              </button>
              <button onClick={() => patch({ usarIA: true })}
                className={cn("text-[10px] px-2.5 py-1 rounded-full border flex items-center gap-1 transition-all",
                  step.usarIA ? "bg-violet-100 border-violet-300 text-violet-700 font-semibold" : "border-border text-muted-foreground")}>
                <Sparkles className="h-3 w-3" />IA gera
              </button>
            </div>
            {step.usarIA ? (
              <Textarea value={step.instrucaoIA ?? ""} onChange={e => patch({ instrucaoIA: e.target.value })}
                rows={2} className="text-xs resize-none"
                placeholder="Ex: Envie uma mensagem de boas-vindas calorosa e mencione que o serviço é gratuito." />
            ) : (
              <Textarea value={step.texto ?? ""} onChange={e => patch({ texto: e.target.value })}
                rows={2} className="text-xs resize-none"
                placeholder='Ex: "Me conta o que está acontecendo."' />
            )}
          </>
        )}

        {step.tipo === "ia" && (
          <Textarea value={step.instrucaoIA ?? ""} onChange={e => patch({ instrucaoIA: e.target.value })}
            rows={3} className="text-xs resize-none"
            placeholder="Ex: Faça perguntas de triagem uma por vez. Verifique se o caso se enquadra no escopo. Seja empático e não force a venda." />
        )}

        {step.tipo === "midia" && (
          <MidiaUploadBlock step={step} patch={patch} />
        )}

        {step.tipo === "pergunta" && (
          <>
            <Textarea value={step.texto ?? ""} onChange={e => patch({ texto: e.target.value })}
              rows={2} className="text-xs resize-none"
              placeholder='Ex: "Qual é o nome completo da criança?"' />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Botões de resposta rápida</p>
                <button onClick={() => patch({ botoes: [...(step.botoes ?? []), ""] })}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  <Plus className="h-3 w-3" />Adicionar
                </button>
              </div>
              {(step.botoes ?? []).length === 0 && (
                <div className="flex gap-1.5">
                  <button onClick={() => patch({ botoes: ["Sim", "Não"] })} className="text-[10px] px-2 py-1 rounded-md bg-muted hover:bg-muted/80">Sim / Não</button>
                  <button onClick={() => patch({ botoes: ["Tenho tudo", "Tenho parte", "Não tenho"] })} className="text-[10px] px-2 py-1 rounded-md bg-muted hover:bg-muted/80">Documentos</button>
                </div>
              )}
              {(step.botoes ?? []).map((btn, bi) => (
                <div key={bi} className="flex items-center gap-2 mb-1">
                  <Input value={btn}
                    onChange={e => { const b = [...(step.botoes ?? [])]; b[bi] = e.target.value; patch({ botoes: b }); }}
                    className="flex-1 text-xs h-7" placeholder={bi === 0 ? "Sim" : bi === 1 ? "Não" : "Opção..."} />
                  <button onClick={() => patch({ botoes: (step.botoes ?? []).filter((_, j) => j !== bi) })}
                    className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepsEditor({ fase, onChange }: { fase: Fase; onChange: (f: Fase) => void }) {
  const patch = (fields: Partial<Fase>) => onChange({ ...fase, ...fields });
  const steps = fase.steps ?? [];

  const addStep = (tipo: StepTipo) => {
    const base: Step = { id: uid(), tipo };
    if (tipo === "midia") { base.midiaTipo = "video"; base.midiaChave = ""; base.midiaDelaySegundos = 60; }
    patch({ steps: [...steps, base] });
  };

  const updateStep = (i: number, s: Step) => {
    const a = [...steps]; a[i] = s; patch({ steps: a });
  };

  const deleteStep = (i: number) => patch({ steps: steps.filter((_, j) => j !== i) });

  const moveStep = (i: number, dir: -1 | 1) => {
    const a = [...steps];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    patch({ steps: a });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-primary" />Fluxo de mensagens
        </Label>
      </div>

      {steps.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground mb-3">
          Adicione passos para montar o fluxo desta etapa
        </div>
      )}

      <div className="space-y-2.5 mb-3">
        {steps.map((step, i) => (
          <StepCard key={step.id} step={step} index={i} total={steps.length}
            onChange={s => updateStep(i, s)}
            onDelete={() => deleteStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([
          { tipo: "mensagem" as StepTipo, label: "Mensagem",    icon: MessageSquare, cls: "hover:border-blue-300 hover:text-blue-700" },
          { tipo: "ia"       as StepTipo, label: "IA livre",    icon: Sparkles,      cls: "hover:border-violet-300 hover:text-violet-700" },
          { tipo: "midia"    as StepTipo, label: "Mídia",       icon: Video,         cls: "hover:border-emerald-300 hover:text-emerald-700" },
          { tipo: "pergunta" as StepTipo, label: "Pergunta",    icon: HelpCircle,    cls: "hover:border-amber-300 hover:text-amber-700" },
        ] as const).map(({ tipo, label, icon: Icon, cls }) => (
          <button key={tipo} onClick={() => addStep(tipo)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors", cls)}>
            <Plus className="h-3.5 w-3.5" /><Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Config de fase ─────────────────────────────────────────────
type FluxoVisualProps = {
  fases: Fase[];
  onSelectFase: (id: string) => void;
  onChangeFase: (id: string, fase: Fase) => void;
};

function FluxoVisual({ fases, onSelectFase, onChangeFase }: FluxoVisualProps) {
  const patch = (fase: Fase, fields: Partial<Fase>) => onChangeFase(fase.id, { ...fase, ...fields });
  const abrirFase = (id: string) => onSelectFase(id);

  const adicionarPergunta = (fase: Fase) => {
    const sugestao = SUGESTOES_PERGUNTAS[fase.id]?.find(s => !(fase.steps ?? []).some(st => st.tipo === "pergunta" && st.texto === s)) ?? "";
    const newStep: Step = { id: uid(), tipo: "pergunta", texto: sugestao, botoes: [] };
    patch(fase, { steps: [...(fase.steps ?? []), newStep] });
    abrirFase(fase.id);
  };

  const adicionarMidia = (fase: Fase) => {
    const midiaTipo: MidiaTipo = fase.id === "fechamento" ? "audio" : "video";
    const midiaChave = `${midiaTipo}_${fase.id}`;
    const newStep: Step = { id: uid(), tipo: "midia", midiaTipo, midiaChave, midiaScript: "", midiaDelaySegundos: midiaTipo === "audio" ? 30 : 60 };
    patch(fase, { steps: [...(fase.steps ?? []), newStep] });
    abrirFase(fase.id);
  };

  const blocoVazio = (fase: Fase) => (fase.steps ?? []).length === 0 && fase.midias.length === 0 && fase.perguntas.length === 0 && fase.camposColeta.length === 0 && fase.acao === "nenhuma";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Fluxo visual do atendimento</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Monte a IA em blocos: perguntas, arquivos, coleta de dados e acoes. Clique em qualquer fase para editar os detalhes.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3 text-emerald-500" />Pergunta</span>
            <span className="inline-flex items-center gap-1"><Video className="h-3 w-3 text-blue-500" />Arquivo</span>
            <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" />Acao</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {fases.map((fase, idx) => {
          const pct = fasePct(fase);
          const acao = ACOES.find(a => a.val === fase.acao);
          return (
            <div key={fase.id} className="relative">
              {idx < fases.length - 1 && <div className="hidden xl:block absolute left-full top-1/2 z-0 h-px w-4 bg-border" />}
              <button
                type="button"
                onClick={() => abrirFase(fase.id)}
                className="relative z-10 w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: fase.cor + "18" }}>
                    {fase.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">{fase.label}</p>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Etapa {idx + 1}</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", pct === 100 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700")}>
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : fase.cor }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {/* Steps preview */}
                  {(fase.steps ?? []).map((step) => {
                    const m = STEP_META[step.tipo];
                    const Icon = m.icon;
                    const preview =
                      step.tipo === "midia" ? (step.midiaChave || step.midiaTipo) :
                      step.tipo === "ia" ? step.instrucaoIA :
                      step.texto ?? "";
                    return (
                      <div key={step.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", m.border, m.header.split(" ")[0], "bg-opacity-40")}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{preview || m.label}</span>
                        {step.tipo === "midia" && step.midiaDelaySegundos &&
                          <span className="ml-auto shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold">{step.midiaDelaySegundos}s</span>}
                        {step.tipo === "pergunta" && (step.botoes ?? []).length > 0 &&
                          <span className="ml-auto shrink-0 text-[10px] opacity-70">{step.botoes!.length} btn</span>}
                      </div>
                    );
                  })}

                  {/* Legacy midias fallback (templates sem steps) */}
                  {(fase.steps ?? []).length === 0 && fase.midias.map((m, i) => (
                    <div key={`${m.chave}-${i}`} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      {m.chave.startsWith("audio_") ? <Mic className="h-3.5 w-3.5 shrink-0" /> : <Video className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate font-medium">{m.chave || "arquivo sem nome"}</span>
                      {m.delayAposSegundos ? <span className="ml-auto shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold">{m.delayAposSegundos}s</span> : null}
                    </div>
                  ))}
                  {(fase.steps ?? []).length === 0 && fase.perguntas.map((p, i) => (
                    <div key={`${p}-${i}`} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2">{p || "Nova pergunta"}</span>
                      </div>
                    </div>
                  ))}

                  {fase.camposColeta.length > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{fase.camposColeta.length} dados para contrato</span>
                    </div>
                  )}

                  {acao && fase.acao !== "nenhuma" && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      <span>{acao.label}</span>
                    </div>
                  )}

                  {blocoVazio(fase) && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Clique nos botoes abaixo para comecar esta fase.
                    </div>
                  )}
                </div>
              </button>

              <div className="relative z-20 mt-2 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => adicionarPergunta(fase)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-emerald-300 hover:text-emerald-700">
                  <MessageSquare className="h-3.5 w-3.5" />Pergunta
                </button>
                <button type="button" onClick={() => adicionarMidia(fase)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-blue-300 hover:text-blue-700">
                  <Video className="h-3.5 w-3.5" />Arquivo
                </button>
                <button type="button" onClick={() => abrirFase(fase.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-amber-300 hover:text-amber-700">
                  <Zap className="h-3.5 w-3.5" />Acao
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaseConfig({ fase, onChange }: { fase: Fase; onChange: (f: Fase) => void }) {
  const patch = (fields: Partial<Fase>) => onChange({ ...fase, ...fields });
  const sugestoes = SUGESTOES_PERGUNTAS[fase.id] ?? [];

  return (
    <div className="space-y-6">
      {/* Indicador de completude */}
      {(() => {
        const pct = fasePct(fase);
        return (
          <div className={cn("rounded-xl p-3 flex items-center gap-3", pct === 100 ? "bg-emerald-50 border border-emerald-200" : pct >= 50 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200")}>
            {pct === 100 ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> : <Circle className="h-5 w-5 text-amber-500 shrink-0" />}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className={cn("text-xs font-semibold", pct === 100 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-red-700")}>
                  {pct === 100 ? "Fase completa ✓" : `${pct}% configurado`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#f87171" }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* STEPS — fluxo ManyChat */}
      <StepsEditor fase={fase} onChange={onChange} />

      {/* Sugestões de perguntas */}
      {sugestoes.length > 0 && (
        <div className="rounded-xl border border-dashed border-primary/30 p-3">
          <p className="text-[10px] text-primary font-semibold mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" />Sugestões de perguntas para esta fase</p>
          {sugestoes.filter(s => !(fase.steps ?? []).some(st => st.tipo === "pergunta" && st.texto === s)).slice(0, 4).map(s => (
            <button key={s} onClick={() => patch({ steps: [...(fase.steps ?? []), { id: uid(), tipo: "pergunta", texto: s, botoes: [] }] })}
              className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground py-1.5 hover:bg-muted/50 px-2 rounded-lg transition-colors">
              <Plus className="h-3 w-3 text-primary shrink-0" />{s}
            </button>
          ))}
        </div>
      )}

      {/* EXCLUSÕES */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-red-500" />Critérios de exclusão</Label>
          <button onClick={() => patch({ exclusoes: [...fase.exclusoes, { condicao: "", motivo: "" }] })}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Adicionar</button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">Descreva livremente quando a IA deve encerrar o atendimento com uma explicação gentil.</p>
        {fase.exclusoes.map((ex, i) => (
          <div key={i} className="mb-2.5 flex gap-2 items-start">
            <Textarea
              value={ex.condicao || ex.motivo}
              onChange={e => { const a = [...fase.exclusoes]; a[i] = { condicao: e.target.value, motivo: e.target.value }; patch({ exclusoes: a }); }}
              rows={2}
              className="flex-1 text-xs resize-none bg-red-50 border-red-200 focus-visible:ring-red-300 placeholder:text-red-300"
              placeholder="Ex: Se a criança tiver mais de 6 anos, encerre explicando que só atendemos até 5 anos e 11 meses."
            />
            <button onClick={() => patch({ exclusoes: fase.exclusoes.filter((_,j) => j !== i) })}
              className="mt-1.5 text-red-400 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {/* COLETA */}
      {fase.id === "coleta" && (
        <div>
          <Label className="text-xs font-semibold flex items-center gap-1.5 mb-3"><FileText className="h-3.5 w-3.5 text-purple-500" />Dados para o contrato</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {CAMPOS.map(({ key, label }) => {
              const sel = fase.camposColeta.includes(key);
              return (
                <button key={key} onClick={() => patch({ camposColeta: sel ? fase.camposColeta.filter(k => k !== key) : [...fase.camposColeta, key] })}
                  className={cn("flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs text-left transition-all",
                    sel ? "border-primary/50 bg-primary/5 text-primary" : "border-border hover:bg-muted/50 text-muted-foreground")}>
                  <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-all", sel ? "bg-primary border-primary" : "border-muted-foreground")}>
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
        <Label className="text-xs font-semibold flex items-center gap-1.5 mb-3"><Zap className="h-3.5 w-3.5 text-amber-500" />Ação ao completar esta fase</Label>
        <div className="grid grid-cols-2 gap-2">
          {ACOES.map(({ val, label, icon: Icon, desc }) => (
            <button key={val} onClick={() => patch({ acao: val as AcaoTipo })}
              className={cn("p-3 rounded-xl border text-left transition-all",
                fase.acao === val ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/50")}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={cn("h-3.5 w-3.5", fase.acao === val ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-xs font-semibold", fase.acao === val ? "text-primary" : "text-foreground")}>{label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────
const DRAFT_KEY = "lex_crm_construtor_draft";

function ConstrutorPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [fases, setFases]             = useState<Fase[]>(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) {
        const parsed = JSON.parse(d);
        return (parsed.fases as Fase[]).map(f => ({ ...f, steps: f.steps ?? [] }));
      }
      return FASES_PADRAO.map(f => ({ ...f }));
    } catch { return FASES_PADRAO.map(f => ({ ...f })); }
  });
  const [nomeFunil, setNomeFunil]     = useState(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}").nome || ""; } catch { return ""; } });
  const [briefing, setBriefing]       = useState<BriefingFunil>(() => { try { return { ...BRIEFING_PADRAO, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}").briefing ?? {}) }; } catch { return BRIEFING_PADRAO; } });
  const [regrasGlobais, setRegrasGlobais] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}").regrasGlobais ?? REGRAS_GLOBAIS_PADRAO; } catch { return REGRAS_GLOBAIS_PADRAO; } });
  const [nomeDr, setNomeDr]           = useState("Dr. Maicon Matos");
  const [descricao, setDescricao]     = useState("");
  const [descLivre, setDescLivre]     = useState("");
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [tab, setTab]                 = useState<"briefing"|"ia"|"visao"|"fase">("visao");
  const [simOpen, setSimOpen]         = useState(false);
  const [gerandoFluxo, setGerandoFluxo]       = useState(false);
  const [gerandoScripts, setGerandoScripts]   = useState(false);
  const [analisando, setAnalisando]   = useState(false);
  const [analise, setAnalise]         = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [melhorando, setMelhorando]   = useState(false);
  const [simTeste, setSimTeste]       = useState(TESTES_SIMULACAO[0].id);
  const [salvando, setSalvando]       = useState(false);
  const [versoes, setVersoes]         = useState<Versao[]>(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY + "_hist") || "[]"); } catch { return []; } });
  const [showVersoes, setShowVersoes] = useState(false);
  const hasDraft = nomeFunil || fases.some(f => fasePct(f) > 0);
  const completude = Math.round(fases.reduce((a, f) => a + fasePct(f), 0) / fases.length);

  // Autosave
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ fases, nome: nomeFunil, briefing, regrasGlobais, ts: Date.now() })); } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [fases, nomeFunil, briefing, regrasGlobais]);

  const briefingTexto = () => [
    `Area juridica: ${briefing.area}`,
    `Objetivo do funil: ${briefing.objetivo || "nao informado"}`,
    `Publico/cliente ideal: ${briefing.publico || "nao informado"}`,
    `Cidade/regiao: ${briefing.cidade || "nao informado"}`,
    `Documentos importantes: ${briefing.documentos || "nao informado"}`,
    `Urgencias e gatilhos: ${briefing.urgencias || "nao informado"}`,
    `Tom de voz: ${briefing.tom || "nao informado"}`,
    `Honorarios/condicao comercial: ${briefing.honorarios || "nao informado"}`,
    `Proibicoes: ${briefing.proibicoes || "nao informado"}`,
    `Quando chamar humano: ${briefing.chamarHumano || "nao informado"}`,
    `Regras globais:\n- ${regrasGlobais.join("\n- ")}`,
  ].join("\n");

  const checklistStatus = () => {
    const textoFases = JSON.stringify(fases).toLowerCase();
    return [
      !!briefing.area && !!briefing.objetivo.trim() && !!briefing.publico.trim(),
      fases.some(f => f.id === "triagem" && f.perguntas.length >= 2 && f.exclusoes.length >= 1),
      fases.some(f => f.id === "coleta" && f.camposColeta.length >= 4),
      !!briefing.chamarHumano.trim() || fases.some(f => f.acao === "handoff"),
      fases.some(f => f.textoAposMidia.includes("?") || f.perguntas.some(q => q.includes("?"))),
      !/(garant|certeza que ganha|100%|prazo garantido)/i.test(textoFases + briefing.proibicoes),
    ];
  };

  const scoreLocal = () => Math.round((checklistStatus().filter(Boolean).length / CHECKLIST_QUALIDADE.length) * 100);

  const patchBriefing = (fields: Partial<BriefingFunil>) => setBriefing(p => ({ ...p, ...fields }));

  const salvarVersao = (label: string) => {
    const v: Versao = { ts: Date.now(), label, fases: JSON.parse(JSON.stringify(fases)), nomeFunil };
    const novas = [v, ...versoes].slice(0, 10);
    setVersoes(novas);
    try { localStorage.setItem(DRAFT_KEY + "_hist", JSON.stringify(novas)); } catch {}
  };

  const restaurarVersao = (v: Versao) => {
    setFases(v.fases); setNomeFunil(v.nomeFunil);
    setShowVersoes(false); toast.success("Versão restaurada!");
  };

  const patchFase = (id: string, f: Fase) => setFases(p => p.map(x => x.id === id ? f : x));

  const aplicarTemplate = (tpl: typeof TEMPLATES[0]) => {
    setNomeFunil(tpl.label);
    setFases(p => p.map(fase => {
      const t = tpl.fases.find(tf => tf.id === fase.id);
      if (!t) return fase;
      const merged = { ...fase, ...t } as Fase;
      if (!(merged.steps ?? []).length) merged.steps = legacyToSteps(merged);
      return merged;
    }));
    setTab("visao");
    toast.success(`Template "${tpl.label}" aplicado!`);
  };

  const legacyToSteps = (g: any): Step[] => {
    const steps: Step[] = [];
    for (const m of g.midias ?? []) {
      const midiaTipo: MidiaTipo = (m.chave ?? "").startsWith("audio_") ? "audio" : "video";
      steps.push({ id: uid(), tipo: "midia", midiaTipo, midiaChave: m.chave, midiaScript: m.script ?? "", midiaDelaySegundos: m.delayAposSegundos ?? 60 });
    }
    if (g.textoAposMidia) steps.push({ id: uid(), tipo: "mensagem", texto: g.textoAposMidia });
    for (const [i, q] of (g.perguntas ?? []).entries()) {
      const botoes = ((g.opcoesPergunta ?? g.opcoes_pergunta ?? {})[i] ?? []).filter(Boolean);
      steps.push({ id: uid(), tipo: "pergunta", texto: q, botoes });
    }
    return steps;
  };

  const aplicarFasesGeradas = (data: any) => {
    if (data.nome) setNomeFunil(data.nome);
    if (data.descricao) setDescricao(data.descricao);
    if (data.fases?.length) {
      setFases(p => p.map(fase => {
        const g = data.fases.find((f: any) => f.id === fase.id);
        if (!g) return fase;
        return {
          ...fase,
          steps: legacyToSteps(g),
          perguntas: g.perguntas ?? [], opcoesPergunta: g.opcoesPergunta ?? g.opcoes_pergunta ?? {},
          exclusoes: g.exclusoes ?? [], midias: g.midias ?? [],
          textoAposMidia: g.textoAposMidia ?? "", acao: g.acao ?? "nenhuma", camposColeta: g.camposColeta ?? [],
        };
      }));
    }
  };

  const gerarFluxo = async () => {
    if (!descLivre.trim() && !briefing.objetivo.trim()) { toast.error("Preencha o briefing ou descreva o caso primeiro"); return; }
    setGerandoFluxo(true);
    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Você é especialista em funis de atendimento jurídico via WhatsApp.
Retorne APENAS JSON válido (sem markdown):
{"nome":"string","fases":[{"id":"abertura|triagem|conexao|fechamento|coleta|assinatura|encerrado","perguntas":[],"opcoesPergunta":{"0":["Sim","Não"]},"exclusoes":[{"condicao":"","motivo":""}],"midias":[{"chave":"","script":"","momento":"","delayAposSegundos":60}],"textoAposMidia":"","acao":"nenhuma|contrato|agendamento|criar_grupo|handoff","camposColeta":[]}]}
REGRAS: video_abertura na abertura, video_conexao na conexão, audio_fechamento no fechamento, video_documentos na assinatura. delayAposSegundos deve representar a duração aproximada da mídia antes da próxima mensagem. acao contrato só na coleta. criar_grupo só na assinatura. Inclua todas as 7 fases. Use opcoesPergunta nas perguntas objetivas de triagem, com 2 ou 3 opções curtas.`,
          userMsg: `BRIEFING E REGRAS:\n${briefingTexto()}\n\nDESCRICAO LIVRE COMPLEMENTAR:\n${descLivre || "sem complemento"}`,
        }),
      });
      const { prompt: json } = await res.json();
      const data = JSON.parse(json.replace(/```json|```/g, "").trim());
      if (data.nome) setNomeFunil(data.nome);
      if (data.fases?.length) {
        setFases(p => p.map(fase => {
          const g = data.fases.find((f: any) => f.id === fase.id);
          if (!g) return fase;
          return { ...fase, perguntas: g.perguntas ?? [], opcoesPergunta: g.opcoesPergunta ?? g.opcoes_pergunta ?? {}, exclusoes: g.exclusoes ?? [],
            midias: g.midias ?? [], textoAposMidia: g.textoAposMidia ?? "",
            acao: g.acao ?? "nenhuma", camposColeta: g.camposColeta ?? [] };
        }));
      }
      salvarVersao("Gerado pela IA");
      setTab("visao"); toast.success("Fluxo gerado! Revise cada fase.");
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setGerandoFluxo(false); }
  };

  const gerarScripts = async () => {
    const semScript = fases.flatMap(f => f.midias.filter(m => m.chave && !m.script));
    if (semScript.length === 0) { toast.info("Todas as mídias já têm script."); return; }
    setGerandoScripts(true);
    try {
      const lista = fases.flatMap(f => f.midias.map(m => `${f.label}: ${m.chave.startsWith("audio_") ? "áudio" : "vídeo"} "${m.chave}"`)).join("\n");
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Gere scripts para mídias jurídicas WhatsApp. JSON apenas: {"scripts":{"chave":{"script":"...","momento":"..."}}}`,
          userMsg: `Funil: ${nomeFunil || descLivre}\nAdvogado: ${nomeDr}\nMídias:\n${lista}`,
        }),
      });
      const { prompt: json } = await res.json();
      const data = JSON.parse(json.replace(/```json|```/g, "").trim());
      if (data.scripts) {
        setFases(p => p.map(f => ({ ...f, midias: f.midias.map(m => data.scripts[m.chave] ? { ...m, ...data.scripts[m.chave] } : m) })));
        toast.success("Scripts gerados!");
      }
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setGerandoScripts(false); }
  };

  const analisarFunil = async () => {
    setAnalisando(true); setAnalise(null); setAuditResult(null);
    try {
      const desc = fases.map(f => `${f.emoji} ${f.label}: perguntas=${f.perguntas.length}, exclusoes=${f.exclusoes.length}, midias=${f.midias.length}, campos=${f.camposColeta.length}, acao=${f.acao}`).join("\n");
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Analise o funil juridico e retorne APENAS JSON valido:
{"score":0,"clareza":0,"seguranca":0,"coleta":0,"conversao":0,"humanizacao":0,"problemas":[""],"sugestoes":[""]}
Notas de 0 a 100. Problemas e sugestoes devem ser praticos, curtos e acionaveis. Avalie risco de promessa juridica, falta de criterios, excesso de perguntas e falta de handoff humano.`,
          userMsg: `BRIEFING:\n${briefingTexto()}\n\nFunil: ${nomeFunil}\n\n${desc}\n\nDetalhes completos:\n${JSON.stringify(fases)}`,
        }),
      });
      const { prompt } = await res.json();
      try {
        const data = JSON.parse(prompt.replace(/```json|```/g, "").trim());
        setAuditResult(data);
        setAnalise([
          `Nota geral: ${data.score ?? 0}/100`,
          ...(data.problemas ?? []).map((p: string) => `Problema: ${p}`),
          ...(data.sugestoes ?? []).map((s: string) => `Sugestao: ${s}`),
        ].join("\n"));
      } catch {
        setAnalise(prompt);
      }
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setAnalisando(false); }
  };

  const melhorarFunil = async () => {
    setMelhorando(true);
    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Melhore um funil juridico de WhatsApp. Retorne APENAS JSON valido:
{"nome":"string","descricao":"string","fases":[{"id":"abertura|triagem|conexao|fechamento|coleta|assinatura|encerrado","perguntas":[],"opcoesPergunta":{"0":["Sim","Não"]},"exclusoes":[{"condicao":"","motivo":""}],"midias":[{"chave":"","script":"","momento":"","delayAposSegundos":60}],"textoAposMidia":"","acao":"nenhuma|contrato|agendamento|criar_grupo|handoff","camposColeta":[]}]}
Mantenha todas as 7 fases. Corrija riscos juridicos, adicione criterios de exclusao, perguntas melhores, scripts de midia, delayAposSegundos realista e handoff humano quando necessario. Use opcoesPergunta em perguntas objetivas de triagem. Nao prometa resultado.`,
          userMsg: `BRIEFING:\n${briefingTexto()}\n\nANALISE ATUAL:\n${analise || "sem analise"}\n\nFUNIL ATUAL:\n${JSON.stringify(fases)}`,
        }),
      });
      const { prompt: json } = await res.json();
      const data = JSON.parse(json.replace(/```json|```/g, "").trim());
      salvarVersao("Antes da melhoria IA");
      aplicarFasesGeradas(data);
      setTab("visao");
      toast.success("Funil melhorado pela IA. Revise antes de salvar.");
    } catch (e: any) { toast.error("Erro: " + e.message); }
    finally { setMelhorando(false); }
  };

  const salvar = async () => {
    if (!nomeFunil.trim()) { toast.error("Defina o nome do funil"); return; }
    if (!user) return;
    salvarVersao("Antes de salvar");
    setSalvando(true);
    try {
      const fasesDesc = fases.map(f => {
        const p: string[] = [];
        const steps = f.steps ?? [];
        if (steps.length > 0) {
          for (const step of steps) {
            if (step.tipo === "mensagem") {
              if (step.usarIA && step.instrucaoIA) p.push(`IA gera mensagem: ${step.instrucaoIA}`);
              else if (step.texto) p.push(`Enviar: "${step.texto}"`);
            } else if (step.tipo === "ia") {
              if (step.instrucaoIA) p.push(`IA deve: ${step.instrucaoIA}`);
            } else if (step.tipo === "midia") {
              const chave = step.midiaChave || step.midiaTipo || "midia";
              p.push(`Enviar ${step.midiaTipo ?? "video"} ${chave}${step.midiaDelaySegundos ? ` | DELAY_APOS_MIDIA ${chave}=${step.midiaDelaySegundos}s` : ""}`);
              if (step.midiaScript) p.push(`Script: "${step.midiaScript}"`);
            } else if (step.tipo === "pergunta") {
              const bts = (step.botoes ?? []).filter(Boolean);
              p.push(`Perguntar: "${step.texto ?? ""}"${bts.length ? ` | Respostas rápidas: ${bts.join(" / ")}` : ""}`);
            }
          }
        } else {
          f.midias.forEach(m => p.push(`Enviar ${m.chave}${m.delayAposSegundos ? ` | DELAY_APOS_MIDIA ${m.chave}=${m.delayAposSegundos}s` : ""}`));
          if (f.textoAposMidia) p.push(`Após: "${f.textoAposMidia}"`);
          f.perguntas.forEach((q, i) => {
            const opcoes = f.opcoesPergunta?.[i]?.filter(Boolean) ?? [];
            p.push(`Perguntar: "${q}"${opcoes.length ? ` | Respostas rápidas: ${opcoes.join(" / ")}` : ""}`);
          });
        }
        f.exclusoes.forEach(e => p.push(`Excluir se ${e.condicao}: ${e.motivo}`));
        if (f.camposColeta.length) p.push(`Coletar: ${f.camposColeta.join(", ")}`);
        if (f.acao !== "nenhuma") p.push(`Ação: ${f.acao}`);
        return `${f.emoji} ${f.label}: ${p.join(" | ") || "Avançar"}`;
      }).join("\n");

      const promptRes = await fetch("/api/generate-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `Crie prompt operacional para agente IA de advocacia WhatsApp.
REGRA CRÍTICA: campo "texto" SEMPRE termina com pergunta ou call-to-action. Nunca "Entendido." sem continuar.
Quando fizer uma pergunta com "Respostas rápidas", retorne também "botoes":[{"id":"valor","titulo":"Texto"}] no JSON da resposta. Use no máximo 3 botões curtos. Para perguntas sem opções, use "botoes":null.
Preserve literalmente qualquer marcador DELAY_APOS_MIDIA chave=Ns no prompt final. Ele controla quantos segundos o sistema espera depois de enviar uma mídia antes da próxima mensagem.
Retorne APENAS o texto do prompt, sem markdown.`,
          userMsg: `Advogado: ${nomeDr}\nFunil: ${nomeFunil}\n${descricao}\n\nBRIEFING E REGRAS:\n${briefingTexto()}\n\nChecklist de qualidade: ${scoreLocal()}%\n\nFluxo:\n${fasesDesc}`,
        }),
      });
      const { prompt } = await promptRes.json();
      const { error } = await supabase.from("funnels").insert({
        user_id: user.id, name: nomeFunil, description: [descricao, "", "Briefing:", briefingTexto()].filter(Boolean).join("\n"),
        persona_prompt: prompt, is_active: true,
        medias: Object.fromEntries(
          fases.flatMap(f => (f.steps ?? []))
            .filter(s => s.tipo === "midia" && s.midiaChave && s.midiaUrl)
            .map(s => [s.midiaChave!, s.midiaUrl!])
        ),
      });
      if (error) throw error;
      localStorage.removeItem(DRAFT_KEY);
      toast.success("Funil salvo com sucesso!");
      setTimeout(() => navigate({ to: "/funis" }), 1200);
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Toaster />
      {simOpen && <Simulador fases={fases} nomeDr={nomeDr} onClose={() => setSimOpen(false)} />}

      {/* Histórico de versões */}
      {showVersoes && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-96 bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="font-semibold text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" />Histórico de versões</p>
              <button onClick={() => setShowVersoes(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {versoes.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhuma versão salva ainda</p>}
              {versoes.map((v, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.ts).toLocaleString("pt-BR")} — {v.nomeFunil || "sem nome"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restaurarVersao(v)}>Restaurar</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar esquerda ── */}
      <div className="w-64 shrink-0 flex flex-col border-r border-border bg-muted/10">
        {/* Header sidebar */}
        <div className="px-4 py-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" />Construtor</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowVersoes(true)} title="Histórico" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><History className="h-3.5 w-3.5" /></button>
              <button onClick={() => setSimOpen(true)} title="Simular" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Play className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {/* Barra de completude geral */}
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Completude</span>
              <span className="font-bold">{completude}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${completude}%`, background: completude >= 80 ? "#22c55e" : completude >= 50 ? "#f59e0b" : "#3b82f6" }} />
            </div>
          </div>
          {hasDraft && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Rascunho salvo automaticamente</p>}
        </div>

        {/* Fases */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {fases.map((fase) => {
            const pct = fasePct(fase);
            return (
              <button key={fase.id}
                onClick={() => { setActiveId(fase.id); setTab("fase"); }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all",
                  activeId === fase.id && tab === "fase" ? "border shadow-sm" : "hover:bg-muted/50 border border-transparent")}
                style={activeId === fase.id && tab === "fase" ? { borderColor: fase.cor + "40", background: fase.cor + "08" } : {}}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ background: fase.cor + "20" }}>{fase.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{fase.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : fase.cor }} />
                    </div>
                    <span className={cn("text-[9px] font-bold shrink-0", pct === 100 ? "text-emerald-500" : "text-muted-foreground")}>{pct}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Botões */}
        <div className="p-3 border-t border-border space-y-2">
          <Button onClick={() => setSimOpen(true)} variant="outline" className="w-full gap-2 text-xs h-9">
            <Play className="h-3.5 w-3.5 text-green-500" />Simular conversa
          </Button>
          <Button onClick={salvar} disabled={salvando || !nomeFunil.trim()} className="w-full gap-2 text-xs h-9">
            <Save className="h-3.5 w-3.5" />{salvando ? "Salvando..." : "Gerar e salvar funil"}
          </Button>
        </div>
      </div>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-4">
          <div className="flex-1">
            <input value={nomeFunil} onChange={e => setNomeFunil(e.target.value)}
              placeholder="Nome do funil (ex: Vaga em Creche — Porto Alegre)"
              className="w-full text-base font-bold bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground" />
            <input value={nomeDr} onChange={e => setNomeDr(e.target.value)}
              className="w-full text-xs bg-transparent border-0 outline-none text-muted-foreground placeholder-muted-foreground/50"
              placeholder="Nome do advogado" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={analisarFunil} disabled={analisando} className="gap-1.5 text-xs h-8">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />{analisando ? "Analisando..." : "Analisar funil"}
            </Button>
            <Button variant="outline" size="sm" onClick={melhorarFunil} disabled={melhorando} className="gap-1.5 text-xs h-8">
              <Wand2 className="h-3.5 w-3.5 text-primary" />{melhorando ? "Melhorando..." : "Melhorar"}
            </Button>
            <Button variant="outline" size="sm" onClick={gerarScripts} disabled={gerandoScripts} className="gap-1.5 text-xs h-8">
              <Mic className="h-3.5 w-3.5" />{gerandoScripts ? "Gerando..." : "Scripts IA"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-2 border-b border-border shrink-0">
          {[
            { id: "briefing", label: "Briefing",        icon: FileText },
            { id: "ia",    label: "IA gera tudo",    icon: Sparkles },
            { id: "visao", label: "Fluxo visual",     icon: LayoutGrid },
            { id: "fase",  label: activeId ? fases.find(f => f.id === activeId)?.label || "Fase" : "Configurar fase", icon: Settings },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                tab === t.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
          {/* Templates */}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Templates:</span>
            {TEMPLATES.map(tpl => (
              <button key={tpl.id} onClick={() => aplicarTemplate(tpl)} title={tpl.desc}
                className="text-sm px-2 py-1 rounded-lg hover:bg-muted transition-colors" >{tpl.emoji}</button>
            ))}
          </div>
        </div>

        {/* Conteúdo das tabs */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn("mx-auto p-6", tab === "visao" ? "max-w-5xl" : "max-w-2xl")}>

            {/* Análise da IA */}
            {analise && (
              <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-violet-800 flex items-center gap-2"><Sparkles className="h-4 w-4" />Análise do funil</p>
                  <button onClick={() => setAnalise(null)} className="text-violet-400 hover:text-violet-600"><X className="h-4 w-4" /></button>
                </div>
                {auditResult && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      ["Geral", auditResult.score],
                      ["Segurança", auditResult.seguranca],
                      ["Coleta", auditResult.coleta],
                      ["Conversão", auditResult.conversao],
                      ["Clareza", auditResult.clareza],
                      ["Humano", auditResult.humanizacao],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-white/70 border border-violet-100 px-2 py-1.5">
                        <p className="text-[10px] text-violet-500">{label}</p>
                        <p className="text-sm font-bold text-violet-800">{value ?? 0}%</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-violet-700 whitespace-pre-line leading-relaxed">{analise}</p>
              </div>
            )}

            {/* Tab: Briefing */}
            {tab === "briefing" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-foreground">Briefing inteligente do funil</h3>
                      <p className="text-xs text-muted-foreground mt-1">Essas respostas guiam a IA na criação, revisão e prompt final.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Qualidade</p>
                      <p className={cn("text-2xl font-bold", scoreLocal() >= 80 ? "text-emerald-600" : scoreLocal() >= 50 ? "text-amber-600" : "text-red-500")}>{scoreLocal()}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Área jurídica</Label>
                      <select value={briefing.area} onChange={e => patchBriefing({ area: e.target.value })}
                        className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-3 text-xs outline-none">
                        {AREAS_JURIDICAS.map(area => <option key={area} value={area}>{area}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Cidade/região</Label>
                      <Input value={briefing.cidade} onChange={e => patchBriefing({ cidade: e.target.value })} className="mt-1.5 text-xs h-9" placeholder="Ex: Porto Alegre e região" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Objetivo principal</Label>
                    <Textarea value={briefing.objetivo} onChange={e => patchBriefing({ objetivo: e.target.value })} rows={2} className="mt-1.5 text-xs resize-none"
                      placeholder="Ex: qualificar leads de BPC negado, coletar documentos e gerar contrato quando houver chance real." />
                  </div>
                  <div>
                    <Label className="text-xs">Cliente ideal / público</Label>
                    <Textarea value={briefing.publico} onChange={e => patchBriefing({ publico: e.target.value })} rows={2} className="mt-1.5 text-xs resize-none"
                      placeholder="Ex: mães com vaga em creche negada, idosos com BPC indeferido, pacientes com negativa do plano." />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Documentos e provas</Label>
                      <Textarea value={briefing.documentos} onChange={e => patchBriefing({ documentos: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" placeholder="RG, CPF, protocolo, negativa, laudo, comprovante..." />
                    </div>
                    <div>
                      <Label className="text-xs">Urgências e sinais de lead quente</Label>
                      <Textarea value={briefing.urgencias} onChange={e => patchBriefing({ urgencias: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" placeholder="Prazo curto, risco de saúde, audiência, criança sem vaga..." />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tom de voz</Label>
                      <Textarea value={briefing.tom} onChange={e => patchBriefing({ tom: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" />
                    </div>
                    <div>
                      <Label className="text-xs">Honorários / condição comercial</Label>
                      <Textarea value={briefing.honorarios} onChange={e => patchBriefing({ honorarios: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" placeholder="Ex: análise gratuita, só cobra ao final, entrada..." />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Proibições para a IA</Label>
                      <Textarea value={briefing.proibicoes} onChange={e => patchBriefing({ proibicoes: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" />
                    </div>
                    <div>
                      <Label className="text-xs">Quando chamar humano</Label>
                      <Textarea value={briefing.chamarHumano} onChange={e => patchBriefing({ chamarHumano: e.target.value })} rows={3} className="mt-1.5 text-xs resize-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Checklist de acerto</p>
                    <div className="space-y-2">
                      {CHECKLIST_QUALIDADE.map((item, i) => {
                        const ok = checklistStatus()[i];
                        return (
                          <div key={item} className="flex items-start gap-2 text-xs">
                            {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                            <span className={ok ? "text-foreground" : "text-muted-foreground"}>{item}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Settings className="h-3.5 w-3.5 text-primary" />Regras globais</p>
                    <div className="space-y-2">
                      {REGRAS_GLOBAIS_PADRAO.map(regra => {
                        const sel = regrasGlobais.includes(regra);
                        return (
                          <button key={regra} onClick={() => setRegrasGlobais(p => sel ? p.filter(r => r !== regra) : [...p, regra])}
                            className="flex items-start gap-2 w-full text-left text-xs">
                            {sel ? <CheckCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                            <span className={sel ? "text-foreground" : "text-muted-foreground"}>{regra}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Play className="h-3.5 w-3.5 text-green-500" />Cenários para testar o atendimento</p>
                  <div className="grid grid-cols-2 gap-2">
                    {TESTES_SIMULACAO.map(teste => (
                      <button key={teste.id} onClick={() => { setSimTeste(teste.id); setDescLivre(teste.msg); }}
                        className={cn("text-left rounded-lg border px-3 py-2 text-xs transition-all", simTeste === teste.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40")}>
                        <span className="font-semibold block">{teste.label}</span>
                        <span className="text-muted-foreground line-clamp-2">{teste.msg}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={gerarFluxo} disabled={gerandoFluxo || (!descLivre.trim() && !briefing.objetivo.trim())} className="flex-1 gap-2">
                      <Sparkles className="h-4 w-4" />{gerandoFluxo ? "Gerando..." : "Gerar fluxo com briefing"}
                    </Button>
                    <Button onClick={melhorarFunil} disabled={melhorando} variant="outline" className="flex-1 gap-2">
                      <Wand2 className="h-4 w-4" />{melhorando ? "Melhorando..." : "Melhorar este funil"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: IA gera tudo */}
            {tab === "ia" && (
              <div className="space-y-6">
                <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">Deixe a IA montar o fluxo</h3>
                      <p className="text-xs text-muted-foreground">Descreva o caso em linguagem natural — ela configura tudo</p>
                    </div>
                  </div>
                  <Textarea value={descLivre} onChange={e => setDescLivre(e.target.value)} rows={5} className="resize-none text-sm"
                    placeholder={`Ex: "Atendo famílias com vaga em creche negada em Porto Alegre. Criança até 5 anos e 11 meses, com protocolo da prefeitura. Serviço gratuito. Preciso coletar: nome, CPF, RG, endereço, nome e data de nascimento da criança, protocolo."`} />
                  <Button onClick={gerarFluxo} disabled={gerandoFluxo || !descLivre.trim()} className="w-full gap-2">
                    <Sparkles className="h-4 w-4" />{gerandoFluxo ? "Analisando e configurando cada fase..." : "Gerar fluxo completo com IA"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ou escolha um template pronto</p>
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.id} onClick={() => aplicarTemplate(tpl)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
                      <span className="text-3xl">{tpl.emoji}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-foreground">{tpl.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</p>
                      </div>
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        Usar template <ChevronRight className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Fluxo visual */}
            {tab === "visao" && (
              <FluxoVisual
                fases={fases}
                onSelectFase={id => { setActiveId(id); setTab("fase"); }}
                onChangeFase={patchFase}
              />
            )}

            {/* Tab: Configurar fase */}
            {tab === "fase" && activeId && (
              fases.filter(f => f.id === activeId).map(fase => (
                <FaseConfig key={fase.id} fase={fase} onChange={f => patchFase(fase.id, f)} />
              ))
            )}
            {tab === "fase" && !activeId && (
              <div className="text-center py-16 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Selecione uma fase na sidebar para configurar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
