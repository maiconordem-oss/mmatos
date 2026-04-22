import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/kanban")({
  head: () => ({ meta: [{ title: "Kanban — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <KanbanPage />
    </AuthGate>
  ),
});

const STAGES = [
  { id: "lead", label: "Leads" },
  { id: "qualificacao", label: "Qualificação" },
  { id: "proposta", label: "Proposta" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "aguardando", label: "Aguardando" },
  { id: "concluido", label: "Concluído" },
] as const;

const AREAS = ["civel", "trabalhista", "criminal", "tributario", "familia", "empresarial", "consumidor", "previdenciario", "outro"];
const PRIORITIES = [
  { id: "baixa", label: "Baixa", color: "bg-muted text-muted-foreground" },
  { id: "media", label: "Média", color: "bg-secondary text-secondary-foreground" },
  { id: "alta", label: "Alta", color: "bg-warning/20 text-warning-foreground" },
  { id: "urgente", label: "Urgente", color: "bg-destructive/15 text-destructive" },
] as const;

type Case = {
  id: string;
  title: string;
  stage: string;
  area: string;
  priority: string;
  client_id: string | null;
  value: number | null;
  description: string | null;
  process_number: string | null;
};

type Client = { id: string; full_name: string };

function KanbanPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    client_id: "",
    area: "outro",
    priority: "media",
    stage: "lead",
    value: "",
    process_number: "",
    description: "",
  });

  const load = async () => {
    const [cs, cl] = await Promise.all([
      supabase.from("cases").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]);
    setCases((cs.data ?? []) as Case[]);
    setClients((cl.data ?? []) as Client[]);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!user || !form.title) return;
    const { error } = await supabase.from("cases").insert({
      user_id: user.id,
      title: form.title,
      client_id: form.client_id || null,
      area: form.area as never,
      priority: form.priority as never,
      stage: form.stage as never,
      value: form.value ? Number(form.value) : null,
      process_number: form.process_number || null,
      description: form.description || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Caso criado");
    setOpen(false);
    setForm({ title: "", client_id: "", area: "outro", priority: "media", stage: "lead", value: "", process_number: "", description: "" });
    load();
  };

  const handleDrop = async (stage: string) => {
    if (!draggedId) return;
    const id = draggedId;
    setDraggedId(null);
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
    const { error } = await supabase.from("cases").update({ stage: stage as never }).eq("id", id);
    if (error) {
      toast.error("Erro ao mover");
      load();
    }
  };

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.full_name ?? "Sem cliente";

  return (
    <div className="p-8 h-full flex flex-col">
      <Toaster />
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kanban de Casos</h1>
          <p className="text-muted-foreground mt-1">Arraste os cards entre as colunas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Novo caso</Button>
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
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
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
                  <Label>Estágio</Label>
                  <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
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
      </header>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const items = cases.filter((c) => c.stage === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
              className="w-80 shrink-0 bg-muted/40 rounded-lg p-3 flex flex-col"
            >
              <div className="flex justify-between items-center mb-3 px-1">
                <h3 className="font-semibold text-sm">{stage.label}</h3>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {items.map((c) => {
                  const prio = PRIORITIES.find((p) => p.id === c.priority);
                  return (
                    <Card
                      key={c.id}
                      draggable
                      onDragStart={() => setDraggedId(c.id)}
                      className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
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
                          {c.value && <p className="text-xs text-gold mt-2 font-medium">R$ {c.value.toLocaleString("pt-BR")}</p>}
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
    </div>
  );
}
