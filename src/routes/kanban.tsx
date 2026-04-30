import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical, Settings2, Trash2, ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAuthServerFn as useServerFn } from "@/hooks/use-server-fn";
import { listStages, createStage, updateStage, deleteStage, reorderStages, updateCase, deleteCase } from "@/server/kanban.functions";
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

const AREAS = ["civel", "trabalhista", "criminal", "tributario", "familia", "empresarial", "consumidor", "previdenciario", "outro"];
const PRIORITIES = [
  { id: "baixa", label: "Baixa", color: "bg-muted text-muted-foreground" },
  { id: "media", label: "Média", color: "bg-secondary text-secondary-foreground" },
  { id: "alta", label: "Alta", color: "bg-warning/20 text-warning-foreground" },
  { id: "urgente", label: "Urgente", color: "bg-destructive/15 text-destructive" },
] as const;

const COLOR_MAP: Record<string, string> = {
  slate: "bg-slate-500", gray: "bg-gray-500", red: "bg-red-500", orange: "bg-orange-500",
  amber: "bg-amber-500", yellow: "bg-yellow-500", lime: "bg-lime-500", green: "bg-green-500",
  emerald: "bg-emerald-500", teal: "bg-teal-500", cyan: "bg-cyan-500", sky: "bg-sky-500",
  blue: "bg-blue-500", indigo: "bg-indigo-500", violet: "bg-violet-500", purple: "bg-purple-500",
  fuchsia: "bg-fuchsia-500", pink: "bg-pink-500", rose: "bg-rose-500",
};
const COLOR_OPTIONS = Object.keys(COLOR_MAP);

type Stage = {
  id: string; key: string; label: string; color: string;
  position: number; is_won: boolean; is_lost: boolean;
};

type Case = {
  id: string; title: string; stage: string; area: string; priority: string;
  client_id: string | null; value: number | null;
  description: string | null; process_number: string | null;
  next_action_date: string | null;
};

type Client = { id: string; full_name: string };

function KanbanPage() {
  const { user } = useAuth();
  const listStagesFn = useServerFn(listStages);

  const [stages, setStages] = useState<Stage[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [editCase, setEditCase] = useState<Case | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [leadScores, setLeadScores] = useState<Record<string, number>>({});
  const [leadVariants, setLeadVariants] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "", client_id: "", area: "outro", priority: "media", stage: "lead",
    value: "", process_number: "", description: "",
  });

  const load = async () => {
    try {
      const [stagesRes, cs, cl, scores] = await Promise.all([
        listStagesFn().catch(() => ({ stages: [] })),
        supabase.from("cases").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("id, full_name").order("full_name"),
        supabase.from("funnel_states").select("conversation_id, lead_score, prompt_variant").not("lead_score", "is", null),
      ]);
      // Mapear client_id → score via conversations
      const scoreMap: Record<string, number> = {};
      const variantMap: Record<string, string> = {};
      if (scores.data) {
        const convIds = scores.data.map((s: any) => s.conversation_id);
        if (convIds.length) {
          const { data: convs } = await supabase.from("conversations").select("id, client_id").in("id", convIds);
          convs?.forEach((conv: any) => {
            const s = scores.data?.find((x: any) => x.conversation_id === conv.id);
            if (s && conv.client_id) {
              scoreMap[conv.client_id] = s.lead_score ?? 0;
              variantMap[conv.client_id] = s.prompt_variant ?? "a";
            }
          });
        }
      }
      setLeadScores(scoreMap);
      setLeadVariants(variantMap);
      const s = stagesRes?.stages ?? [];
      setStages(s as Stage[]);
      setCases((cs.data ?? []) as Case[]);
      setClients((cl.data ?? []) as Client[]);
      if (s.length && !s.some((x: Stage) => x.key === form.stage)) {
        setForm((f) => ({ ...f, stage: s[0].key }));
      }
    } catch (e: any) {
      toast.error("Erro ao carregar kanban: " + (e?.message ?? e));
    }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const handleCreate = async () => {
    if (!user || !form.title) return;
    const { error } = await supabase.from("cases").insert({
      user_id: user.id, title: form.title,
      client_id: form.client_id || null,
      area: form.area as never,
      priority: form.priority as never,
      stage: form.stage,
      value: form.value ? Number(form.value) : null,
      process_number: form.process_number || null,
      description: form.description || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Caso criado");
    setOpen(false);
    setForm({ title: "", client_id: "", area: "outro", priority: "media", stage: stages[0]?.key ?? "lead", value: "", process_number: "", description: "" });
    load();
  };

  const handleDrop = async (stageKey: string) => {
    if (!draggedId) return;
    const id = draggedId;
    setDraggedId(null);
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, stage: stageKey } : c)));
    const { error } = await supabase.from("cases").update({ stage: stageKey }).eq("id", id);
    if (error) { toast.error("Erro ao mover"); load(); }
  };

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.full_name ?? "Sem cliente";

  return (
    <div className="p-8 h-full flex flex-col">
      <Toaster />
      <header className="flex justify-between items-center mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kanban de Casos</h1>
          <p className="text-muted-foreground mt-1">Arraste os cards entre as colunas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStagesOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" /> Gerenciar colunas
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo caso</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Novo caso</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Área</Label>
                    <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Coluna</Label>
                    <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Valor (R$)</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
                  <div><Label>Nº Processo</Label><Input value={form.process_number} onChange={(e) => setForm({ ...form, process_number: e.target.value })} /></div>
                </div>
                <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate}>Criar caso</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = cases.filter((c) => c.stage === stage.key);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.key)}
              className="w-80 shrink-0 bg-muted/40 rounded-lg p-3 flex flex-col"
            >
              <div className="flex justify-between items-center mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_MAP[stage.color] ?? "bg-slate-500")} />
                  <h3 className="font-semibold text-sm">{stage.label}</h3>
                </div>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {items.map((c) => {
                  const prio = PRIORITIES.find((p) => p.id === c.priority);
                  const clientId = c.client_id ?? "";
                  return (
                    <Card
                      key={c.id}
                      draggable
                      onDragStart={() => setDraggedId(c.id)}
                      onClick={() => setEditCase(c)}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{c.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{clientName(c.client_id)}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge variant="outline" className="text-xs capitalize">{c.area.replace("_", " ")}</Badge>
                            {prio && <Badge className={`text-xs ${prio.color}`}>{prio.label}</Badge>}
                          </div>
                          {c.value && <p className="text-xs text-gold mt-2 font-medium">R$ {Number(c.value).toLocaleString("pt-BR")}</p>}
                          {clientId && leadScores[clientId] !== undefined && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${leadScores[clientId] >= 80 ? "bg-green-500" : leadScores[clientId] >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                                  style={{ width: `${leadScores[clientId]}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">{leadScores[clientId]}%</span>
                              {leadVariants[clientId] && leadVariants[clientId] !== "a" && (
                                <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-600 font-bold">B</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <StagesManager open={stagesOpen} onOpenChange={setStagesOpen} stages={stages} onChange={load} />
      <CaseEditor
        editCase={editCase} onClose={() => setEditCase(null)}
        stages={stages} clients={clients} onSaved={load}
      />
    </div>
  );
}

/* ---------- Stages Manager ---------- */
function StagesManager({ open, onOpenChange, stages, onChange }:
  { open: boolean; onOpenChange: (v: boolean) => void; stages: Stage[]; onChange: () => void }) {
  const create = useServerFn(createStage);
  const update = useServerFn(updateStage);
  const reorder = useServerFn(reorderStages);
  const remove = useServerFn(deleteStage);

  const [label, setLabel] = useState("");
  const [color, setColor] = useState("slate");

  const handleAdd = async () => {
    if (!label.trim()) return;
    try { await create({ data: { label, color } }); setLabel(""); onChange(); toast.success("Coluna criada"); }
    catch (e: any) { toast.error(e.message); }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const newOrder = [...stages];
    const j = idx + dir;
    if (j < 0 || j >= newOrder.length) return;
    [newOrder[idx], newOrder[j]] = [newOrder[j], newOrder[idx]];
    await reorder({ data: { orderedIds: newOrder.map((s) => s.id) } });
    onChange();
  };

  const handleRename = async (s: Stage, newLabel: string) => {
    await update({ data: { id: s.id, label: newLabel } });
    onChange();
  };
  const handleColor = async (s: Stage, c: string) => {
    await update({ data: { id: s.id, color: c } });
    onChange();
  };

  const handleDelete = async (s: Stage) => {
    const others = stages.filter((x) => x.id !== s.id);
    if (!others.length) return toast.error("Mantenha ao menos uma coluna");
    const target = others[0].key;
    if (!confirm(`Excluir "${s.label}"? Os casos nessa coluna irão para "${others[0].label}".`)) return;
    try {
      await remove({ data: { id: s.id, moveCasesToStageKey: target } });
      onChange();
      toast.success("Coluna excluída");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Gerenciar colunas do Kanban</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
          {stages.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2 border rounded-md p-2">
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowLeft className="h-3 w-3 rotate-90" /></Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(idx, 1)} disabled={idx === stages.length - 1}><ArrowRight className="h-3 w-3 rotate-90" /></Button>
              </div>
              <Select value={s.color} onValueChange={(v) => handleColor(s, v)}>
                <SelectTrigger className="w-12 h-9 px-2"><span className={cn("h-3 w-3 rounded-full", COLOR_MAP[s.color])} /></SelectTrigger>
                <SelectContent>{COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}><div className="flex items-center gap-2"><span className={cn("h-3 w-3 rounded-full", COLOR_MAP[c])} /> <span className="capitalize">{c}</span></div></SelectItem>
                ))}</SelectContent>
              </Select>
              <Input defaultValue={s.label} onBlur={(e) => e.target.value !== s.label && handleRename(s, e.target.value)} className="flex-1" />
              <code className="text-xs text-muted-foreground">{s.key}</code>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 flex items-end gap-2">
          <div className="flex-1"><Label>Nova coluna</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Negociação" /></div>
          <Select value={color} onValueChange={setColor}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{COLOR_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}><div className="flex items-center gap-2"><span className={cn("h-3 w-3 rounded-full", COLOR_MAP[c])} /> <span className="capitalize">{c}</span></div></SelectItem>
            ))}</SelectContent>
          </Select>
          <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Case Editor ---------- */
function CaseEditor({ editCase, onClose, stages, clients, onSaved }:
  { editCase: Case | null; onClose: () => void; stages: Stage[]; clients: Client[]; onSaved: () => void }) {
  const upd = useServerFn(updateCase);
  const del = useServerFn(deleteCase);
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (editCase) setForm({
      ...editCase,
      value: editCase.value?.toString() ?? "",
      next_action_date: editCase.next_action_date ?? "",
      description: editCase.description ?? "",
      process_number: editCase.process_number ?? "",
      client_id: editCase.client_id ?? "",
    });
  }, [editCase]);

  if (!editCase || !form) return null;

  const save = async () => {
    try {
      await upd({ data: {
        id: editCase.id,
        title: form.title,
        client_id: form.client_id || null,
        area: form.area,
        priority: form.priority,
        stage: form.stage,
        value: form.value === "" ? null : Number(form.value),
        process_number: form.process_number || null,
        description: form.description || null,
        next_action_date: form.next_action_date || null,
      }});
      toast.success("Caso atualizado");
      onClose(); onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async () => {
    if (!confirm("Excluir este caso?")) return;
    try { await del({ data: { id: editCase.id } }); onClose(); onSaved(); toast.success("Excluído"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={!!editCase} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Editar caso</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Coluna</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Valor (R$)</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div><Label>Nº Processo</Label><Input value={form.process_number} onChange={(e) => setForm({ ...form, process_number: e.target.value })} /></div>
            <div className="col-span-2"><Label>Próxima ação</Label><Input type="date" value={form.next_action_date} onChange={(e) => setForm({ ...form, next_action_date: e.target.value })} /></div>
          </div>
          <div><Label>Descrição</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          <Button variant="destructive" onClick={remove}><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>
          <Button onClick={save}>Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
