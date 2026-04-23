import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange,
  Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Save, Plus, MessageSquare, Video, Mic, Clock,
  HelpCircle, GitBranch, Sparkles, FileText, FileSignature, UserCheck, Flag, Play, FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getWorkflowGraph, saveWorkflowGraph, simulateWorkflow } from "@/server/workflow.functions";
import { listTemplates } from "@/server/zapsign.functions";

export const Route = createFileRoute("/workflows/$id")({
  component: () => (
    <AuthGate>
      <Editor />
    </AuthGate>
  ),
});

const NODE_TYPES_META: Record<string, { label: string; icon: any; color: string }> = {
  start:    { label: "Início",       icon: Play,          color: "bg-emerald-500" },
  message:  { label: "Mensagem",     icon: MessageSquare, color: "bg-blue-500" },
  video:    { label: "Vídeo (URL)",  icon: Video,         color: "bg-purple-500" },
  audio:    { label: "Áudio (URL)",  icon: Mic,           color: "bg-pink-500" },
  wait:     { label: "Aguardar",     icon: Clock,         color: "bg-amber-500" },
  question: { label: "Pergunta",     icon: HelpCircle,    color: "bg-cyan-500" },
  condition:{ label: "Condição",     icon: GitBranch,     color: "bg-orange-500" },
  qualify:  { label: "Qualificar IA",icon: Sparkles,      color: "bg-violet-500" },
  proposal: { label: "Gerar Proposta",icon: FileText,     color: "bg-indigo-500" },
  contract: { label: "Enviar Contrato",icon: FileSignature,color: "bg-teal-500" },
  handoff:  { label: "Passar p/ Humano",icon: UserCheck,  color: "bg-rose-500" },
  end:      { label: "Encerrar",     icon: Flag,          color: "bg-slate-500" },
};

function StepNode({ data }: { data: any }) {
  const meta = NODE_TYPES_META[data.kind] ?? NODE_TYPES_META.message;
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border-2 border-border bg-card shadow-sm min-w-[180px]">
      {data.kind !== "start" && <Handle type="target" position={Position.Top} />}
      <div className={`flex items-center gap-2 px-3 py-2 ${meta.color} text-white rounded-t-md`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{meta.label}</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-medium truncate">{data.label || meta.label}</div>
        {data.preview && <div className="text-xs text-muted-foreground truncate">{data.preview}</div>}
      </div>
      {data.kind !== "end" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}

const nodeTypes = { step: StepNode };

function genId() {
  return crypto.randomUUID();
}

function Editor() {
  const { id } = Route.useParams();
  const getGraph = useServerFn(getWorkflowGraph);
  const saveGraph = useServerFn(saveWorkflowGraph);

  const [workflow, setWorkflow] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getGraph({ data: { id } });
      setWorkflow(r.workflow);
      setNodes(
        r.nodes.map((n: any) => ({
          id: n.id,
          type: "step",
          position: { x: n.position_x, y: n.position_y },
          data: {
            kind: n.type,
            label: n.label,
            config: n.config ?? {},
            preview: previewFor(n.type, n.config ?? {}),
          },
        })),
      );
      setEdges(
        r.edges.map((e: any) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label ?? undefined,
        })),
      );
    })();
  }, [id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, id: genId() }, eds)), []);

  const addNode = (kind: string) => {
    const newNode: Node = {
      id: genId(),
      type: "step",
      position: { x: 250 + Math.random() * 200, y: 250 + Math.random() * 200 },
      data: { kind, label: NODE_TYPES_META[kind].label, config: {}, preview: "" },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const updateSelected = (patch: any) => {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selected.id
          ? { ...n, data: { ...n.data, ...patch, preview: previewFor((patch.kind ?? n.data.kind) as string, { ...(n.data.config as any), ...(patch.config ?? {}) }) } }
          : n,
      ),
    );
    setSelected((s) => (s ? { ...s, data: { ...s.data, ...patch } } as Node : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGraph({
        data: {
          workflow_id: id,
          nodes: nodes.map((n) => ({
            id: n.id,
            type: (n.data as any).kind,
            label: (n.data as any).label ?? null,
            position_x: n.position.x,
            position_y: n.position.y,
            config: (n.data as any).config ?? {},
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source_node_id: e.source,
            target_node_id: e.target,
            label: (e.label as string) ?? null,
            condition: null,
          })),
        },
      });
      toast.success("Workflow salvo");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const palette = useMemo(() => Object.entries(NODE_TYPES_META).filter(([k]) => k !== "start"), []);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/workflows"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="font-semibold">{workflow?.name ?? "Carregando..."}</div>
            <div className="text-xs text-muted-foreground capitalize">{workflow?.legal_area ?? ""}</div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}</Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        <div className="w-56 border-r bg-card p-3 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Etapas</div>
          <div className="space-y-1.5">
            {palette.map(([k, m]) => {
              const Icon = m.icon;
              return (
                <button
                  key={k}
                  onClick={() => addNode(k)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-border hover:bg-accent text-sm text-left transition-colors"
                >
                  <div className={`h-6 w-6 rounded ${m.color} flex items-center justify-center text-white`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span>{m.label}</span>
                  <Plus className="h-3 w-3 ml-auto text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-[400px] sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Configurar etapa</SheetTitle></SheetHeader>
          {selected && <NodeConfig node={selected} onChange={updateSelected} onDelete={() => {
            setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
            setNodes((nds) => nds.filter((n) => n.id !== selected.id));
            setSelected(null);
          }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function previewFor(kind: string, cfg: any): string {
  switch (kind) {
    case "message": case "question": return cfg.text ?? "";
    case "video": case "audio": return cfg.url ?? "";
    case "wait": return cfg.minutes ? `${cfg.minutes} min` : "";
    case "condition": return cfg.expression ?? "";
    case "qualify": return "Extrair dados do lead";
    case "proposal": return "Gerar proposta IA";
    case "contract": return cfg.template_name ?? "Enviar via ZapSign";
    default: return "";
  }
}

function NodeConfig({ node, onChange, onDelete }: { node: Node; onChange: (p: any) => void; onDelete: () => void }) {
  const data = node.data as any;
  const kind = data.kind as string;
  const cfg = data.config ?? {};

  const setCfg = (patch: any) => onChange({ config: { ...cfg, ...patch } });

  return (
    <div className="space-y-4 mt-4">
      <div>
        <Label>Nome da etapa</Label>
        <Input value={data.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      {(kind === "message" || kind === "question") && (
        <div>
          <Label>{kind === "question" ? "Pergunta" : "Mensagem"}</Label>
          <Textarea rows={5} value={cfg.text ?? ""} onChange={(e) => setCfg({ text: e.target.value })} placeholder="Use {{nome}} para inserir o nome do lead" />
        </div>
      )}

      {(kind === "video" || kind === "audio") && (
        <>
          <div>
            <Label>URL do {kind === "video" ? "vídeo" : "áudio"}</Label>
            <Input value={cfg.url ?? ""} onChange={(e) => setCfg({ url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>Legenda (opcional)</Label>
            <Textarea rows={2} value={cfg.caption ?? ""} onChange={(e) => setCfg({ caption: e.target.value })} />
          </div>
        </>
      )}

      {kind === "wait" && (
        <div>
          <Label>Aguardar (minutos)</Label>
          <Input type="number" min={1} value={cfg.minutes ?? 5} onChange={(e) => setCfg({ minutes: Number(e.target.value) })} />
        </div>
      )}

      {kind === "condition" && (
        <>
          <div>
            <Label>Tipo de condição</Label>
            <Select value={cfg.kind ?? "contains"} onValueChange={(v) => setCfg({ kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Mensagem do lead contém</SelectItem>
                <SelectItem value="qualified">Lead foi qualificado</SelectItem>
                <SelectItem value="score_gte">Score ≥</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input value={cfg.value ?? ""} onChange={(e) => setCfg({ value: e.target.value })} placeholder="ex: sim, aceito" />
          </div>
          <p className="text-xs text-muted-foreground">Use os rótulos das conexões (sim/não) para ramificar.</p>
        </>
      )}

      {kind === "contract" && (
        <div>
          <Label>Nome do template ZapSign</Label>
          <Input value={cfg.template_name ?? ""} onChange={(e) => setCfg({ template_name: e.target.value })} placeholder="Ex: Honorários Padrão" />
        </div>
      )}

      {kind === "qualify" && (
        <p className="text-sm text-muted-foreground">Esta etapa roda o agente qualificador e armazena os dados extraídos (área, urgência, score).</p>
      )}

      {kind === "proposal" && (
        <p className="text-sm text-muted-foreground">Gera uma proposta de honorários a partir da última qualificação do lead.</p>
      )}

      {kind === "handoff" && (
        <p className="text-sm text-muted-foreground">Marca a conversa como atendimento humano e desativa a IA.</p>
      )}

      {kind !== "start" && (
        <Button variant="destructive" className="w-full" onClick={onDelete}>Excluir etapa</Button>
      )}
    </div>
  );
}
