import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { updateCaseStage } from "@/server/kanban.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MessageSquare, FileText, Calendar, Clock, Bot, AlertTriangle, Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kanban")({
  head: () => ({ meta: [{ title: "Kanban — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <KanbanPage />
      </AppShell>
    </AuthGate>
  ),
});

const STAGES = [
  { id: "lead",         label: "Leads",          color: "#3b82f6", bg: "bg-blue-500/10",    border: "border-blue-500/20" },
  { id: "qualificacao", label: "Qualificação",   color: "#f97316", bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  { id: "proposta",     label: "Proposta",        color: "#8b5cf6", bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  { id: "em_andamento", label: "Em andamento",   color: "#22c55e", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { id: "concluido",    label: "Concluído",      color: "#10b981", bg: "bg-teal-500/10",    border: "border-teal-500/20" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${Math.floor(diff / 60000)}min`;
}

function ScoreBar({ score }: { score?: number | null }) {
  if (score == null) return null;
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{score}%</span>
    </div>
  );
}

function KanbanCard({ card, stage, onDragStart, leadScores, leadVariants, onClick }: any) {
  const stageInfo  = STAGES.find(s => s.id === stage)!;
  const score      = leadScores[card.client_id];
  const variant    = leadVariants[card.client_id];
  const stuckHours = Math.floor((Date.now() - new Date(card.updated_at).getTime()) / 3600000);
  const isStuck    = stuckHours > 24 && ["qualificacao","proposta"].includes(stage);
  const isUrgent   = stuckHours > 48;

  return (
    <div draggable onDragStart={() => onDragStart(card.id)}
      onClick={() => onClick(card)}
      className={cn(
        "rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg group",
        isUrgent ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/8" :
        isStuck  ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/8" :
                   "border-white/8 hover:border-white/15",
      )}
      style={{ background: isUrgent ? undefined : isStuck ? undefined : "#0d1424" }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: stageInfo.color + "40" }}>
            {(card.client_name || card.title || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{card.client_name || "Sem nome"}</p>
            <p className="text-[10px] text-slate-500 truncate">{card.funnel_name || card.area || ""}</p>
          </div>
        </div>
        {variant && variant !== "a" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-bold shrink-0">B</span>
        )}
      </div>

      {/* Score */}
      <ScoreBar score={score} />

      {/* Preview */}
      {card.title && (
        <p className="text-xs text-slate-500 mt-2 line-clamp-1">{card.title}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full",
          isUrgent ? "bg-red-500/20 text-red-400" :
          isStuck  ? "bg-amber-500/20 text-amber-400" :
                     "bg-white/5 text-slate-500")}>
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(card.updated_at)}
          {isStuck && " ⚠"}
        </div>
        {card.value > 0 && (
          <span className="text-[10px] text-emerald-400 font-medium">
            R$ {Number(card.value).toLocaleString("pt-BR")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {card.has_docs     && <FileText  className="h-3 w-3 text-slate-600" />}
          {card.has_meeting  && <Calendar  className="h-3 w-3 text-slate-600" />}
          {card.ai_handled   && <Bot       className="h-3 w-3 text-emerald-600" />}
        </div>
      </div>
    </div>
  );
}

function KanbanPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [cards, setCards]         = useState<Record<string, any[]>>({});
  const [clients, setClients]     = useState<any[]>([]);
  const [leadScores, setLeadScores]   = useState<Record<string, number>>({});
  const [leadVariants, setLeadVariants] = useState<Record<string, string>>({});
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [open, setOpen]           = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [form, setForm]           = useState({ title: "", client_id: "", area: "outro", priority: "media", description: "", value: "", stage: "lead" });
  const updateStageFn = useAuthServerFn(updateCaseStage);

  const load = useCallback(async () => {
    if (!user) return;

    const [casesRes, clientsRes, scoresRes] = await Promise.all([
      supabase.from("cases").select("*, clients(full_name, whatsapp)").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("funnel_states").select("conversation_id, lead_score, prompt_variant").not("lead_score", "is", null),
    ]);

    const cases = (casesRes.data ?? []) as any[];
    setClients((clientsRes.data ?? []) as any[]);

    // Scores por client_id via conversations
    const scoreMap: Record<string, number>  = {};
    const variantMap: Record<string, string> = {};
    if (scoresRes.data?.length) {
      const convIds = scoresRes.data.map((s: any) => s.conversation_id);
      const { data: convs } = await supabase.from("conversations").select("id, client_id").in("id", convIds);
      convs?.forEach((conv: any) => {
        const s = scoresRes.data?.find((x: any) => x.conversation_id === conv.id);
        if (s && conv.client_id) {
          scoreMap[conv.client_id]   = s.lead_score;
          variantMap[conv.client_id] = s.prompt_variant ?? "a";
        }
      });
    }
    setLeadScores(scoreMap);
    setLeadVariants(variantMap);

    // Agrupar por stage
    const grouped: Record<string, any[]> = {};
    STAGES.forEach(s => { grouped[s.id] = []; });
    cases.forEach(c => {
      const enriched = {
        ...c,
        client_name: (c.clients as any)?.full_name,
        client_phone: (c.clients as any)?.whatsapp,
      };
      if (grouped[c.stage]) grouped[c.stage].push(enriched);
    });
    setCards(grouped);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDrop = async (toStage: string) => {
    if (!draggedId || !user) return;
    try {
      await updateStageFn({ data: { id: draggedId, stage: toStage } });
      load();
    } catch (e: any) { toast.error(e.message); }
    setDraggedId(null);
  };

  const handleCreate = async () => {
    if (!form.title || !form.client_id) { toast.error("Título e cliente são obrigatórios"); return; }
    const { error } = await supabase.from("cases").insert({
      user_id:     user!.id,
      client_id:   form.client_id,
      title:       form.title,
      area:        form.area,
      priority:    form.priority,
      description: form.description,
      value:       form.value ? Number(form.value) : null,
      stage:       form.stage,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Lead criado!");
    setOpen(false);
    load();
  };

  return (
    <div className="flex flex-col h-full">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-slate-400" />
          <h1 className="text-lg font-bold text-white">Kanban</h1>
          <span className="text-xs text-slate-600">
            {Object.values(cards).flat().length} leads total
          </span>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"
          className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0">
          <Plus className="h-3.5 w-3.5" /> Novo lead
        </Button>
      </div>

      {/* Colunas */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 min-w-max h-full">
          {STAGES.map(stage => {
            const stageCards = cards[stage.id] || [];
            const totalValue = stageCards.reduce((a, c) => a + (Number(c.value) || 0), 0);
            return (
              <div key={stage.id} className="w-72 flex flex-col shrink-0"
                onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(stage.id)}>

                {/* Header da coluna */}
                <div className={cn("flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 border", stage.bg, stage.border)}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold text-white">{stage.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400">{stageCards.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalValue > 0 && (
                      <span className="text-[10px] text-emerald-400 font-medium">
                        R$ {totalValue.toLocaleString("pt-BR")}
                      </span>
                    )}
                    <button onClick={() => { setForm(f => ({ ...f, stage: stage.id })); setOpen(true); }}
                      className="h-5 w-5 rounded flex items-center justify-center hover:bg-white/10 text-slate-600 hover:text-white transition-colors">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {stageCards.map(card => (
                    <KanbanCard key={card.id} card={card} stage={stage.id}
                      onDragStart={setDraggedId}
                      leadScores={leadScores} leadVariants={leadVariants}
                      onClick={setSelectedCard} />
                  ))}
                  {stageCards.length === 0 && (
                    <div className="border-2 border-dashed border-white/5 rounded-xl p-6 text-center text-slate-600 text-xs">
                      Solte um card aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal criar lead */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-[#0d1424] border-white/10 text-white">
          <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-400 text-xs">Título *</Label>
              <Input className="bg-white/5 border-white/10 text-white mt-1" value={form.title}
                onChange={e => setForm({...form, title: e.target.value})} />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Cliente *</Label>
              <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1e293b] border-white/10">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white hover:bg-white/10">{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-400 text-xs">Coluna</Label>
                <Select value={form.stage} onValueChange={v => setForm({...form, stage: v})}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e293b] border-white/10">
                    {STAGES.map(s => <SelectItem key={s.id} value={s.id} className="text-white">{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Valor (R$)</Label>
                <Input type="number" className="bg-white/5 border-white/10 text-white mt-1"
                  value={form.value} onChange={e => setForm({...form, value: e.target.value})} />
              </div>
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Descrição</Label>
              <Textarea className="bg-white/5 border-white/10 text-white mt-1" rows={3}
                value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-white/10 text-slate-400">Cancelar</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer detalhes do card */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedCard(null)}>
          <div className="flex-1" />
          <div className="w-96 h-full border-l border-white/10 p-6 overflow-y-auto" style={{ background: "#0d1424" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-white">{selectedCard.client_name || "Lead"}</h2>
              <button onClick={() => setSelectedCard(null)} className="text-slate-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="space-y-4">
              <div><p className="text-xs text-slate-500 mb-1">Título</p><p className="text-sm text-white">{selectedCard.title}</p></div>
              <div><p className="text-xs text-slate-500 mb-1">Área</p><p className="text-sm text-white capitalize">{selectedCard.area}</p></div>
              <div><p className="text-xs text-slate-500 mb-1">Prioridade</p><p className="text-sm text-white capitalize">{selectedCard.priority}</p></div>
              {selectedCard.value && <div><p className="text-xs text-slate-500 mb-1">Valor</p><p className="text-sm text-emerald-400 font-bold">R$ {Number(selectedCard.value).toLocaleString("pt-BR")}</p></div>}
              {selectedCard.description && <div><p className="text-xs text-slate-500 mb-1">Descrição</p><p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedCard.description}</p></div>}
              <div className="pt-4">
                <Button onClick={() => { setSelectedCard(null); navigate({ to: "/inbox" }); }}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                  <MessageSquare className="h-4 w-4" /> Abrir no Inbox
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
