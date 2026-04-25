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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Save, Plus, MessageSquare, Video, Mic, Clock,
  HelpCircle, GitBranch, Sparkles, FileText, FileSignature, UserCheck, Flag, Play, FlaskConical,
  Bot, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getWorkflowGraph, saveWorkflowGraph, simulateWorkflow, updateWorkflow } from "@/server/workflow.functions";
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
  const simulateFn = useServerFn(simulateWorkflow);
  const listTpls = useServerFn(listTemplates);
  const updateWf = useServerFn(updateWorkflow);

  const [workflow, setWorkflow] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [simOpen, setSimOpen] = useState(false);
  const [simSteps, setSimSteps] = useState<any[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaForm, setPersonaForm] = useState({
    persona_prompt: "",
    proposal_value: "",
    proposal_is_free: false,
    video_url: "",
  });
  const [savingPersona, setSavingPersona] = useState(false);

  useEffect(() => { listTpls().then((r) => setTemplates(r.templates)).catch(() => {}); }, []);

  const runSimulation = async () => {
    setSimLoading(true); setSimOpen(true);
    try { const r = await simulateFn({ data: { id, leadName: "João Lead" } }); setSimSteps(r.steps); }
    catch (e: any) { toast.error(e.message); }
    finally { setSimLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const r = await getGraph({ data: { id } });
      setWorkflow(r.workflow);
      setPersonaForm({
        persona_prompt: r.workflow?.persona_prompt ?? "Você é o Dr. Maicon Matos, advogado inscrito na OAB/RS 136.221. Atenda o cliente com cordialidade, segurança jurídica e clareza. Fale sempre em primeira pessoa, como se fosse o próprio advogado.",
        proposal_value: r.workflow?.proposal_value?.toString() ?? "",
        proposal_is_free: r.workflow?.proposal_is_free ?? false,
        video_url: r.workflow?.video_url ?? "",
      });
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

  const handleSavePersona = async () => {
    setSavingPersona(true);
    try {
      await updateWf({ data: {
        id,
        persona_prompt: personaForm.persona_prompt,
        proposal_value: personaForm.proposal_is_free ? null : (personaForm.proposal_value ? Number(personaForm.proposal_value) : null),
        proposal_is_free: personaForm.proposal_is_free,
        video_url: personaForm.video_url || null,
      }});
      setWorkflow((w: any) => ({ ...w, ...personaForm }));
      toast.success("Persona salva!");
      setPersonaOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPersona(false); }
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPersonaOpen(true)}><Bot className="h-4 w-4 mr-2" /> Persona & Proposta</Button>
          <Button variant="outline" onClick={runSimulation}><FlaskConical className="h-4 w-4 mr-2" /> Simular</Button>
          <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}</Button>
        </div>
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
          {selected && <NodeConfig node={selected} templates={templates} onChange={updateSelected} onDelete={() => {
            setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
            setNodes((nds) => nds.filter((n) => n.id !== selected.id));
            setSelected(null);
          }} />}
        </SheetContent>
      </Sheet>

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Simulação do fluxo</DialogTitle></DialogHeader>
          {simLoading ? <p className="text-sm text-muted-foreground">Simulando...</p> : (
            <ol className="space-y-2">
              {simSteps.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etapa encontrada. Conecte as etapas a partir do nó Início.</p>}
              {simSteps.map((s, i) => (
                <li key={i} className="border rounded-md p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{i + 1}. {s.kind}</div>
                  <div className="text-sm font-medium">{s.label}</div>
                  {s.preview && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.preview}</div>}
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-muted-foreground">⚠️ Simulação segue apenas a primeira saída de cada etapa, sem enviar mensagens reais.</p>
        </DialogContent>
      </Dialog>

      {/* Dialog Persona & Proposta */}
      <Dialog open={personaOpen} onOpenChange={setPersonaOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-500" /> Persona & Proposta deste Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">

            {/* Persona prompt */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-500" /> Prompt da Persona (como a IA vai se comportar)
              </Label>
              <p className="text-xs text-muted-foreground">
                Escreva aqui quem é a IA, como ela deve falar, qual o tom, o que ela sabe e o que ela não deve dizer.
                A IA vai usar esse texto como base em todas as mensagens deste funil.
              </p>
              <Textarea
                rows={8}
                value={personaForm.persona_prompt}
                onChange={(e) => setPersonaForm({ ...personaForm, persona_prompt: e.target.value })}
                placeholder="Ex: Você é o Dr. Maicon Matos, advogado especialista em direito educacional em Porto Alegre. Atenda o cliente com cordialidade e segurança jurídica. Nunca prometa resultados. Sempre colete: nome da criança, idade, bairro e se já tem protocolo de solicitação na prefeitura."
                className="font-mono text-sm"
              />
            </div>

            {/* Vídeo de boas-vindas */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                🎥 URL do Vídeo de Boas-vindas (placeholder)
              </Label>
              <p className="text-xs text-muted-foreground">
                Cole aqui o link do vídeo que será enviado no início do atendimento. Deixe em branco se ainda não tiver.
              </p>
              <Input
                value={personaForm.video_url}
                onChange={(e) => setPersonaForm({ ...personaForm, video_url: e.target.value })}
                placeholder="https://youtube.com/... ou link direto do MP4"
              />
              {!personaForm.video_url && (
                <p className="text-xs text-amber-600">⚠️ Sem vídeo configurado — o nó de Vídeo enviará uma mensagem de texto no lugar.</p>
              )}
            </div>

            {/* Valor da proposta */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" /> Configuração da Proposta de Honorários
              </Label>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_free"
                  checked={personaForm.proposal_is_free}
                  onChange={(e) => setPersonaForm({ ...personaForm, proposal_is_free: e.target.checked, proposal_value: e.target.checked ? "" : personaForm.proposal_value })}
                  className="h-4 w-4"
                />
                <label htmlFor="is_free" className="text-sm font-medium cursor-pointer">
                  Este serviço é gratuito para o cliente (ex: ação de creche pública)
                </label>
              </div>

              {!personaForm.proposal_is_free && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Valor fixo dos honorários (R$)</Label>
                  <Input
                    type="number"
                    value={personaForm.proposal_value}
                    onChange={(e) => setPersonaForm({ ...personaForm, proposal_value: e.target.value })}
                    placeholder="Ex: 1500"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para a IA calcular automaticamente com base na qualificação do lead.
                  </p>
                </div>
              )}

              {personaForm.proposal_is_free && (
                <p className="text-xs text-emerald-700 font-medium">✅ A proposta será apresentada como serviço gratuito ao cliente.</p>
              )}
              {!personaForm.proposal_is_free && personaForm.proposal_value && (
                <p className="text-xs text-blue-700 font-medium">💰 Proposta com valor fixo de R$ {Number(personaForm.proposal_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              )}
              {!personaForm.proposal_is_free && !personaForm.proposal_value && (
                <p className="text-xs text-amber-600 font-medium">🤖 A IA vai gerar o valor da proposta com base nas informações do lead.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPersonaOpen(false)}>Cancelar</Button>
              <Button onClick={handleSavePersona} disabled={savingPersona}>
                {savingPersona ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

function NodeConfig({ node, onChange, onDelete, templates }:
  { node: Node; onChange: (p: any) => void; onDelete: () => void; templates: any[] }) {
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{kind === "question" ? "Pergunta" : "Mensagem"}</Label>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">IA gera livremente</span>
              <input
                type="checkbox"
                checked={cfg.use_ai === true}
                onChange={(e) => setCfg({ use_ai: e.target.checked })}
                className="h-3.5 w-3.5"
              />
            </div>
          </div>
          <Textarea
            rows={5}
            value={cfg.text ?? ""}
            onChange={(e) => setCfg({ text: e.target.value })}
            placeholder={
              cfg.use_ai
                ? "Contexto para a IA (ex: 'Pergunte o nome e a idade da criança de forma natural e acolhedora')"
                : "Texto fixo da mensagem. Use {{nome}} para o nome do lead."
            }
          />
          {cfg.use_ai && (
            <p className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded p-2">
              🤖 A IA vai gerar a mensagem com base no histórico da conversa e no prompt da persona.
              O texto acima é o contexto/instrução para ela — não será enviado literalmente.
            </p>
          )}
        </div>
      )}

      {(kind === "video" || kind === "audio") && (
        <>
          <div>
            <Label>URL do {kind === "video" ? "vídeo" : "áudio"}</Label>
            <Input value={cfg.url ?? ""} onChange={(e) => setCfg({ url: e.target.value })} placeholder="https://... (deixe vazio para usar o vídeo configurado na Persona)" />
            {!cfg.url && (
              <p className="text-xs text-amber-600 mt-1">Sem URL neste nó — usará o vídeo da configuração Persona & Proposta do workflow.</p>
            )}
          </div>
          <div>
            <Label>Legenda / mensagem junto ao vídeo</Label>
            <Textarea rows={3} value={cfg.caption ?? ""} onChange={(e) => setCfg({ caption: e.target.value })}
              placeholder="Ex: 👆 Assista ao vídeo acima para entender tudo sobre seus direitos!" />
          </div>
        </>
      )}

      {kind === "wait" && (
        <div>
          <Label>Aguardar (minutos)</Label>
          <Input type="number" min={1} value={cfg.minutes ?? 5} onChange={(e) => setCfg({ minutes: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground mt-1">O fluxo pausa por esse tempo antes de continuar para a próxima etapa.</p>
        </div>
      )}

      {kind === "condition" && (
        <>
          <div>
            <Label>Tipo de condição</Label>
            <Select value={cfg.kind ?? "contains"} onValueChange={(v) => setCfg({ kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Resposta do lead contém palavra</SelectItem>
                <SelectItem value="qualified">Lead foi qualificado pela IA</SelectItem>
                <SelectItem value="score_gte">Score de qualificação ≥</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor para comparar</Label>
            <Input value={cfg.value ?? ""} onChange={(e) => setCfg({ value: e.target.value })} placeholder="ex: sim, tenho, 70" />
          </div>
          <p className="text-xs text-muted-foreground bg-muted rounded p-2">
            💡 Conecte duas saídas deste nó com os rótulos <strong>sim</strong> e <strong>não</strong> para ramificar o fluxo.
          </p>
        </>
      )}

      {kind === "contract" && (
        <>
          <div>
            <Label>Template ZapSign</Label>
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ Nenhum template cadastrado. Vá em <strong>Agentes IA → Templates ZapSign</strong> para cadastrar.
              </p>
            ) : (
              <Select value={cfg.template_id ?? ""} onValueChange={(v) => {
                const tpl = templates.find((t) => t.id === v);
                setCfg({ template_id: v, template_name: tpl?.name ?? "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            ✅ Ao chegar aqui, o sistema gera o contrato automaticamente com os dados da proposta e envia o link de assinatura via WhatsApp.
          </p>
        </>
      )}

      {kind === "qualify" && (
        <div className="text-sm text-muted-foreground bg-violet-50 border border-violet-200 rounded p-3 space-y-1">
          <p className="font-medium text-violet-700">🤖 Etapa de Qualificação com IA</p>
          <p>A IA analisa toda a conversa até aqui e extrai automaticamente:</p>
          <ul className="list-disc ml-4 text-xs space-y-0.5">
            <li>Área jurídica do caso</li>
            <li>Urgência (baixa / média / alta)</li>
            <li>Resumo do caso</li>
            <li>Score de qualificação (0-100)</li>
          </ul>
          <p className="text-xs">Esses dados são usados pelo nó de Proposta para gerar os honorários.</p>
        </div>
      )}

      {kind === "proposal" && (
        <div className="text-sm text-muted-foreground bg-indigo-50 border border-indigo-200 rounded p-3 space-y-1">
          <p className="font-medium text-indigo-700">📋 Etapa de Geração de Proposta</p>
          <p>Usa o valor e as regras configuradas em <strong>Persona & Proposta</strong> deste workflow:</p>
          <ul className="list-disc ml-4 text-xs space-y-0.5">
            <li>Se gratuito → informa que não há custo</li>
            <li>Se valor fixo → usa o valor configurado</li>
            <li>Se sem valor → IA calcula com base na qualificação</li>
          </ul>
          <p className="text-xs">A proposta é enviada automaticamente ao cliente via WhatsApp.</p>
        </div>
      )}

      {kind === "handoff" && (
        <div className="text-sm text-muted-foreground bg-rose-50 border border-rose-200 rounded p-3">
          <p className="font-medium text-rose-700">👤 Passar para Atendimento Humano</p>
          <p className="text-xs mt-1">A IA para de responder e a conversa aparece no Inbox para você atender manualmente.</p>
        </div>
      )}

      {kind === "start" && (
        <div className="text-sm text-muted-foreground bg-emerald-50 border border-emerald-200 rounded p-3">
          <p className="font-medium text-emerald-700">▶️ Início do Fluxo</p>
          <p className="text-xs mt-1">Este é o ponto de entrada. Conecte ao próximo nó (geralmente um Vídeo ou Mensagem de boas-vindas).</p>
        </div>
      )}

      {kind !== "start" && (
        <Button variant="destructive" className="w-full" onClick={onDelete}>Excluir etapa</Button>
      )}
    </div>
  );
}
