import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Workflow as WfIcon, Pencil, Trash2, Copy, Activity } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listWorkflows, createWorkflow, deleteWorkflow, updateWorkflow, duplicateWorkflow, listExecutions } from "@/server/workflow.functions";

export const Route = createFileRoute("/workflows")({
  component: () => (
    <AuthGate>
      <WorkflowsPage />
    </AuthGate>
  ),
});

const AREAS = [
  { value: "trabalhista", label: "Trabalhista" },
  { value: "civil", label: "Civil" },
  { value: "criminal", label: "Criminal" },
  { value: "familia", label: "Família" },
  { value: "tributario", label: "Tributário" },
  { value: "empresarial", label: "Empresarial" },
  { value: "previdenciario", label: "Previdenciário" },
  { value: "consumidor", label: "Consumidor" },
  { value: "outro", label: "Outro" },
];

const STATUS_BADGE: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-700",
  completed: "bg-emerald-500/15 text-emerald-700",
  failed: "bg-destructive/15 text-destructive",
  waiting: "bg-amber-500/15 text-amber-700",
  paused: "bg-muted text-muted-foreground",
};

function WorkflowsPage() {
  const navigate = useNavigate();
  const list = useServerFn(listWorkflows);
  const create = useServerFn(createWorkflow);
  const del = useServerFn(deleteWorkflow);
  const upd = useServerFn(updateWorkflow);
  const dup = useServerFn(duplicateWorkflow);
  const listExec = useServerFn(listExecutions);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [execOpen, setExecOpen] = useState<string | null>(null);
  const [executions, setExecutions] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", description: "", legal_area: "trabalhista", is_default: false });

  const load = async () => {
    setLoading(true);
    try { const r = await list(); setItems(r.workflows); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error("Informe um nome");
    try {
      const r = await create({ data: form });
      toast.success("Workflow criado");
      setOpen(false);
      setForm({ name: "", description: "", legal_area: "trabalhista", is_default: false });
      navigate({ to: "/workflows/$id", params: { id: r.workflow.id } });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este workflow?")) return;
    try { await del({ data: { id } }); toast.success("Excluído"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (w: any) => {
    try { await upd({ data: { id: w.id, is_active: !w.is_active } }); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDuplicate = async (id: string) => {
    try { const r = await dup({ data: { id } }); toast.success("Duplicado"); navigate({ to: "/workflows/$id", params: { id: r.workflow.id } }); }
    catch (e: any) { toast.error(e.message); }
  };

  const openExecutions = async (id: string) => {
    setExecOpen(id);
    try { const r = await listExec({ data: { workflow_id: id } }); setExecutions(r.executions); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows de IA</h1>
          <p className="text-muted-foreground">Construa fluxos visuais para cada tipo de atendimento</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Workflow</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar workflow</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Atendimento Trabalhista" /></div>
              <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <Label>Área Jurídica (gatilho automático)</Label>
                <Select value={form.legal_area} onValueChange={(v) => setForm({ ...form, legal_area: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                <Label>Usar como padrão (fallback)</Label>
              </div>
              <Button onClick={handleCreate} className="w-full">Criar e abrir editor</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <WfIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum workflow criado ainda.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{w.name}</CardTitle>
                  <div className="flex gap-1">
                    {w.is_default && <Badge variant="secondary">Padrão</Badge>}
                    <Badge variant={w.is_active ? "default" : "outline"}>{w.is_active ? "Ativo" : "Inativo"}</Badge>
                  </div>
                </div>
                {w.legal_area && <Badge variant="outline" className="w-fit capitalize">{w.legal_area}</Badge>}
              </CardHeader>
              <CardContent>
                {w.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{w.description}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/workflows/$id" params={{ id: w.id }} className="col-span-2">
                    <Button variant="outline" size="sm" className="w-full"><Pencil className="h-3 w-3 mr-1" /> Editar canvas</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(w)}>{w.is_active ? "Desativar" : "Ativar"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => openExecutions(w.id)}><Activity className="h-3 w-3 mr-1" /> Execuções</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(w.id)}><Copy className="h-3 w-3 mr-1" /> Duplicar</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(w.id)}><Trash2 className="h-3 w-3 mr-1 text-destructive" /> Excluir</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!execOpen} onOpenChange={(v) => !v && setExecOpen(null)}>
        <SheetContent className="w-[480px] sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Execuções deste workflow</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {executions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>}
            {executions.map((e) => (
              <div key={e.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{e.conversations?.contact_name ?? e.conversations?.phone ?? "—"}</span>
                  <Badge className={STATUS_BADGE[e.status] ?? ""}>{e.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Iniciado: {new Date(e.started_at).toLocaleString("pt-BR")}</p>
                {e.last_error && <p className="text-xs text-destructive mt-1">{e.last_error}</p>}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
