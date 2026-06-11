import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_BPC_MANUAL_PLAYBOOK, DEFAULT_PREVIDENCIARIO_MANUAL_PLAYBOOK } from "@/lib/manual-playbooks";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Bot, Video, Mic, FileText, Pencil, Trash2,
  ExternalLink, FlaskConical,
  RotateCcw, MessageSquare, Send, ArrowRight, ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/funis")({
  head: () => ({ meta: [{ title: "Funis de Atendimento — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <FunisPage />
      </AppShell>
    </AuthGate>
  ),
});

type Funil = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  persona_prompt: string;
  proposal_value: number | null;
  proposal_is_free: boolean;
  media_video_abertura: string | null;
  media_video_conexao: string | null;
  media_audio_fechamento: string | null;
  media_video_documentos: string | null;
  zapsign_template_id: string | null;
  followup_hours: number | null;
  followup_msg: string | null;
  manual_playbook?: any;
};

const DEFAULT_FOLLOWUP_MESSAGE = "Oi! Passaram alguns dias e eu queria saber se voce conseguiu ver minha ultima mensagem. Ainda posso te ajudar com isso?";
const MANUAL_FLOW_PROMPT = `Fluxo manual de atendimento.
Use o playbook manual salvo neste funil como roteiro da equipe no Inbox.
As perguntas, informacoes para coletar, respostas prontas, objecoes e materiais ficam salvos em manual_playbook.
Quando o cliente entrar, a equipe deve seguir as etapas SDR, Closer, Coleta, Assinatura e Acompanhamento.
Se a IA estiver ativa, ela deve apoiar com respostas curtas e seguras, sem prometer resultado e chamando humano em duvidas sensiveis.`;

const cloneBpcPlaybook = () => JSON.parse(JSON.stringify(DEFAULT_BPC_MANUAL_PLAYBOOK));
const clonePrevidenciarioPlaybook = () => JSON.parse(JSON.stringify(DEFAULT_PREVIDENCIARIO_MANUAL_PLAYBOOK));

const listToText = (items?: string[]) => (items ?? []).join("\n");
const textToList = (value: string) => value.split("\n").map(item => item.trim()).filter(Boolean);

const objectionsToText = (items?: any[]) => (items ?? [])
  .map(item => `${item.label ?? ""} :: ${item.reply ?? ""}`.trim())
  .filter(Boolean)
  .join("\n");

const textToObjections = (value: string) => textToList(value).map(line => {
  const [label, ...replyParts] = line.split("::");
  return { label: label.trim(), reply: replyParts.join("::").trim() || line.trim() };
}).filter(item => item.label && item.reply);

const mediaSuggestionsToText = (items?: any[]) => (items ?? [])
  .map(item => `${item.key ?? ""} | ${item.type ?? "audio"} | ${item.title ?? ""} | ${item.script ?? ""}`.trim())
  .filter(Boolean)
  .join("\n");

const textToMediaSuggestions = (value: string) => textToList(value).map(line => {
  const [key, type, title, ...scriptParts] = line.split("|").map(part => part.trim());
  return {
    key,
    type: ["audio", "video", "documento"].includes(type) ? type : "audio",
    title: title || key,
    script: scriptParts.join(" | ") || title || key,
  };
}).filter(item => item.key && item.title && item.script);

const EMPTY: any = {
  name: "", description: "", is_active: true, is_default: false,
  persona_prompt: "", proposal_value: null, proposal_is_free: false,
  followup_hours: 48, followup_msg: "",
  medias: {},
  media_video_abertura: null, media_video_conexao: null,
  media_audio_fechamento: null, media_video_documentos: null,
  zapsign_template_id: null,
  manual_playbook: {},
};

function AdvancedSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border bg-muted/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        <span>{title}</span>
        {description && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{description}</span>}
      </summary>
      <div className="space-y-4 border-t p-4">
        {children}
      </div>
    </details>
  );
}

const PROMPT_CRECHE = `IDENTIDADE
Você é o Dr. Maicon Matos, advogado especialista em direito da criança e do adolescente, com foco em casos de vaga em creche negada pelo município.
Fale em primeira pessoa, como o próprio Dr. Maicon. Tom: próximo, direto, seguro, sem juridiquês.
Você não é robô. É o doutor. Todo atendimento é pelo WhatsApp.

PRINCÍPIOS
— Máximo 3 linhas por resposta
— Uma pergunta por vez
— Sem asteriscos, hashtags ou markdown
— Sem emojis
— Valide sentimentos antes de avançar
— Se sumir e voltar: retome sem repetir perguntas

FORMATO OBRIGATÓRIO — responda SEMPRE com JSON válido, nenhum texto fora dele:
{"texto":"...","midias":[],"texto_pos_midia":null,"nova_fase":null,"acao":null,"dados_extraidos":{}}

midias aceitas: "video_abertura", "video_conexao", "audio_fechamento", "video_documentos"
nova_fase: "abertura" -> "triagem" -> "conexao" -> "fechamento" -> "coleta" -> "assinatura" -> "encerrado"
acao: "gerar_contrato" quando dados confirmados, senão null
dados_extraidos: nome, nomeCrianca, idadeCrianca, municipio, cpf, rg, estadoCivil, profissao, endereco, dataNascimentoCrianca, creche, protocolo

ETAPA abertura — primeira mensagem, qualquer que seja:
{"texto":"Me conta o que está acontecendo.","midias":["video_abertura"],"texto_pos_midia":null,"nova_fase":"triagem","acao":null,"dados_extraidos":{}}

ETAPA triagem — uma pergunta por vez:
1. Nome do responsável
2. Nome da criança
3. Idade — SE mais de 5a11m: encerre
4. Cidade do pedido de vaga
5. Fez pedido formal na Prefeitura? — SE não: oriente e encerre
6. O que aconteceu depois do pedido?
7. Tem urgência (recomendação médica, vulnerabilidade)?

Quando triagem completa e caso tem fundamento:
{"texto":"[nome], com o que você me contou, o caso de [nomeCrianca] tem base legal sólida.\\nO município está descumprindo uma obrigação constitucional.\\nCada mês que passa é tempo de desenvolvimento que não volta. Tenho um recado importante pra você.","midias":["video_conexao"],"texto_pos_midia":"Posso abrir o caso de [nomeCrianca] agora?","nova_fase":"conexao","acao":null,"dados_extraidos":{}}

ETAPA conexao — quando confirmar (sim, pode, claro):
{"texto":"Ótimo. Vou te mandar um áudio com minha avaliação.","midias":["audio_fechamento"],"texto_pos_midia":"O que eu falei faz sentido pra você?","nova_fase":"fechamento","acao":null,"dados_extraidos":{}}

ETAPA fechamento — quando confirmar:
"Então vamos. Preciso anotar alguns dados. Pode ser agora?" — SE sim: nova_fase:"coleta"

ETAPA coleta — um dado por vez (nome/nomeCrianca/idadeCrianca/municipio já coletados):
cpf -> rg -> estadoCivil -> profissao -> endereco -> dataNascimentoCrianca -> creche -> protocolo

Confirmação final:
{"texto":"Deixa eu confirmar:\\n\\nNome: [nome]\\nCPF: [cpf]\\nRG: [rg]\\nEstado civil: [estadoCivil]\\nProfissão: [profissao]\\nEndereço: [endereco]\\nCriança: [nomeCrianca], nascida em [dataNascimentoCrianca]\\nMunicípio: [municipio]\\nCreche: [creche]\\n\\nEstá tudo certo?","midias":[],"nova_fase":null,"acao":null,"dados_extraidos":{}}

Quando confirmar:
{"texto":"Perfeito. Gerando os documentos agora.","midias":[],"nova_fase":"assinatura","acao":"gerar_contrato","dados_extraidos":{}}

ETAPA assinatura:
"São três documentos: contrato, procuração e declaração de hipossuficiência. Assina com o dedo mesmo."
Quando assinado:
{"texto":"Documentos assinados. Tenho um recado pra você.","midias":["video_documentos"],"texto_pos_midia":"A parte difícil já passou. Me manda os documentos um por vez.","nova_fase":"encerrado","acao":null,"dados_extraidos":{}}

OBJEÇÕES:
CUSTO: "Você não paga nada. Quando o município perde ele paga meus honorários. Quem banca é a Prefeitura."
DEMORA: "Você não vai precisar ir a lugar nenhum. Já vi liminares em 48h."
DÚVIDA: "Vaga em creche tem um dos maiores índices de êxito no Judiciário. Já resolvi casos iguais."
SE perguntar se é robô: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso."`;

function FunisPage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [funis, setFunis]               = useState<Funil[]>([]);
  const [open, setOpen]                 = useState(false);
  const [editing, setEditing]           = useState<Funil | null>(null);
  const [form, setForm]                 = useState<any>({ ...EMPTY });
  const [saving, setSaving]             = useState(false);
  const [simOpen, setSimOpen]           = useState(false);
  const [simFunil, setSimFunil]         = useState<Funil | null>(null);
  const [simMsg, setSimMsg]             = useState("oi");
  const [simRunning, setSimRunning]     = useState(false);
  const [simConvId, setSimConvId]       = useState<string | null>(null);
  const [simMessages, setSimMessages]   = useState<any[]>([]);
  const [simInput, setSimInput]         = useState("");
  const [simDirective, setSimDirective] = useState<any>(null);

  const callSimApi = async (action: string, funnel_id: string, message = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Não autenticado");
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, funnel_id, message, token }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
    return res.json();
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("funnels").select("*").eq("user_id", user.id).order("created_at");
    setFunis((data ?? []) as Funil[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!simConvId) return;
    const refresh = () => {
      supabase.from("messages").select("*").eq("conversation_id", simConvId).order("created_at")
        .then(({ data }) => setSimMessages(data ?? []));
      supabase.from("funnel_states").select("dados").eq("conversation_id", simConvId).maybeSingle()
        .then(({ data }) => setSimDirective((data?.dados as any)?._last_directive ?? null));
    };
    refresh();
    const ch = supabase.channel(`conversation:${simConvId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + simConvId }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "funnel_states", filter: "conversation_id=eq." + simConvId }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [simConvId]);

  const openEdit = (f: Funil) => {
    setEditing(f);
    // Migrar colunas antigas para medias se necessário
    const existingMedias = (f as any).medias ?? {};
    const legacy: Record<string, string> = {};
    if ((f as any).media_video_abertura)   legacy.video_abertura   = (f as any).media_video_abertura;
    if ((f as any).media_video_conexao)    legacy.video_conexao    = (f as any).media_video_conexao;
    if ((f as any).media_audio_fechamento) legacy.audio_fechamento = (f as any).media_audio_fechamento;
    if ((f as any).media_video_documentos) legacy.video_documentos = (f as any).media_video_documentos;
    setForm({
      ...f,
      medias: Object.keys(existingMedias).length > 0 ? existingMedias : legacy,
      manual_playbook: (f.manual_playbook as any)?.steps?.length ? f.manual_playbook : {},
    });
    setOpen(true);
  };

  const updateManualStep = (stepId: string, patch: Record<string, any>) => {
    const current = (form.manual_playbook as any)?.steps?.length
      ? form.manual_playbook
      : cloneBpcPlaybook();
    setForm({
      ...form,
      manual_playbook: {
        ...current,
        steps: current.steps.map((step: any) => step.id === stepId ? { ...step, ...patch } : step),
      },
    });
  };

  const save = async () => {
    if (!user || !form.name?.trim() || !form.persona_prompt?.trim()) {
      toast.error("Nome e prompt são obrigatórios"); return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("funnels").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Funil atualizado!");
      } else {
        const { error } = await supabase.from("funnels").insert({ ...form, user_id: user.id });
        if (error) throw error;
        toast.success("Funil criado!");
      }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este funil?")) return;
    await supabase.from("funnels").delete().eq("id", id); load();
  };

  const toggleActive = async (f: Funil) => {
    await supabase.from("funnels").update({ is_active: !f.is_active }).eq("id", f.id); load();
  };

  const setDefault = async (f: Funil) => {
    if (!user) return;
    await supabase.from("funnels").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("funnels").update({ is_default: true }).eq("id", f.id); load();
  };

  const openManualFlowDraft = () => {
    setEditing(null);
    setForm({
      ...EMPTY,
      name: DEFAULT_BPC_MANUAL_PLAYBOOK.name,
      description: DEFAULT_BPC_MANUAL_PLAYBOOK.description,
      persona_prompt: MANUAL_FLOW_PROMPT,
      proposal_value: null,
      proposal_is_free: false,
      followup_hours: 48,
      followup_msg: "Oi! Passaram alguns dias e eu queria saber se voce conseguiu separar os documentos. Posso te ajudar a continuar por aqui?",
      manual_playbook: cloneBpcPlaybook(),
      medias: {},
    });
    setOpen(true);
  };

  const openSim = (f: Funil) => {
    setSimFunil(f); setSimMsg("oi"); setSimConvId(null); setSimMessages([]); setSimInput(""); setSimOpen(true);
  };

  const startSim = async () => {
    if (!simFunil) return;
    setSimRunning(true);
    try {
      const r = await callSimApi("send", simFunil.id, simMsg);
      setSimConvId(r.conversation_id);
      toast.success("Simulação iniciada!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSimRunning(false); }
  };

  const sendSimMsg = async () => {
    if (!simFunil || !simConvId || !simInput.trim()) return;
    const msg = simInput.trim(); setSimInput(""); setSimRunning(true);
    try { await callSimApi("send", simFunil.id, msg); }
    catch (e: any) { toast.error(e.message); }
    finally { setSimRunning(false); }
  };

  const resetSim = async () => {
    if (!simFunil) return;
    try {
      await callSimApi("reset", simFunil.id);
      setSimConvId(null); setSimMessages([]);
      toast.success("Resetado!");
    } catch (e: any) { toast.error(e.message); }
  };


  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Toaster />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-7 w-7 text-green-500" /> Funis de Atendimento
          </h1>
          <p className="text-muted-foreground mt-1">Configure o atendimento automático via WhatsApp — do primeiro contato ao contrato assinado.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openManualFlowDraft} disabled={saving} className="gap-2">
            <MessageSquare className="h-4 w-4" /> Fluxo manual
          </Button>
          <Button onClick={() => navigate({ to: "/construtor" })} className="gap-2"><Plus className="h-4 w-4" /> Novo funil</Button>
        </div>
      </header>

      {funis.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nenhum funil configurado</p>
          <Button onClick={() => navigate({ to: "/construtor" })} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Criar funil</Button>
        </div>
      )}

      <div className="space-y-4">
        {funis.map((f) => (
          <div key={f.id} className="border rounded-xl p-5 space-y-4 bg-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-semibold text-lg">{f.name}</h2>
                  {f.is_default && <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Padrão</Badge>}
                  <Badge variant={f.is_active ? "default" : "secondary"}>{f.is_active ? "Ativo" : "Inativo"}</Badge>
                  {(f.manual_playbook as any)?.steps?.length && <Badge variant="outline" className="text-blue-600">Fluxo manual</Badge>}
                  {f.proposal_is_free
                    ? <Badge variant="outline" className="text-emerald-600">Gratuito</Badge>
                    : f.proposal_value
                      ? <Badge variant="outline">R$ {Number(f.proposal_value).toLocaleString("pt-BR")}</Badge>
                      : null}
                </div>
                {f.description && <p className="text-sm text-muted-foreground mt-1">{f.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                {!f.is_default && <Button size="sm" variant="outline" onClick={() => setDefault(f)}>Tornar padrão</Button>}
                <Button size="sm" variant="outline" className="gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-50" onClick={() => openSim(f)}>
                  <FlaskConical className="h-3.5 w-3.5" /> Simular
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>

            {/* Mídias */}
            {Object.keys((f as any).medias ?? {}).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries((f as any).medias ?? {}).map(([key, url]) => (
                  <div key={key} className={"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs " + (url ? "border-green-500/40 bg-green-500/5 text-green-700" : "border-dashed text-muted-foreground")}>
                    {key.startsWith("audio_") || key.includes("_audio")
                      ? <Mic className="h-3 w-3 shrink-0" />
                      : <Video className="h-3 w-3 shrink-0" />}
                    <span className="font-mono">{key}</span>
                    {url
                      ? <a href={url as string} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
                      : <span className="text-amber-500">⚠</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar funil" : "Novo funil de atendimento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome do funil *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Vaga em Creche — Porto Alegre" />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            {/* Honorários */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm">💰 Honorários</p>
              <div className="flex items-center gap-3">
                <Switch checked={form.proposal_is_free ?? false} onCheckedChange={(v) => setForm({ ...form, proposal_is_free: v, proposal_value: v ? null : form.proposal_value })} />
                <span className="text-sm">Serviço gratuito (honorários pagos pelo réu)</span>
              </div>
              {!form.proposal_is_free && (
                <div>
                  <Label>Valor fixo (R$)</Label>
                  <Input type="number" value={form.proposal_value ?? ""} onChange={(e) => setForm({ ...form, proposal_value: e.target.value ? Number(e.target.value) : null })} placeholder="Ex: 1500" />
                </div>
              )}
            </div>

            {/* Mídias — editor livre */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2"><Video className="h-4 w-4" /> Mídias do funil</p>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                  onClick={() => {
                    const key = prompt("Nome da chave (ex: audio_objecao_custo, video_explicacao):");
                    if (!key?.trim()) return;
                    const clean = key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                    if (!clean) return;
                    setForm({ ...form, medias: { ...(form.medias ?? {}), [clean]: "" } });
                  }}>
                  <Plus className="h-3 w-3" /> Adicionar mídia
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Adicione qualquer mídia e use a chave no prompt em <code className="bg-muted px-1 rounded">midias: ["sua_chave"]</code>.
                A chave que começa com <code className="bg-muted px-1 rounded">audio_</code> é enviada como áudio, o restante como vídeo.
              </p>

              {Object.keys(form.medias ?? {}).length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  Nenhuma mídia cadastrada. Clique em "Adicionar mídia" para começar.
                </p>
              )}

              <div className="space-y-2">
                {Object.entries(form.medias ?? {}).map(([key, rawUrl]) => {
                  const url = typeof rawUrl === "string" ? rawUrl : "";
                  return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {key.startsWith("audio_") || key.includes("_audio")
                        ? <Mic className="h-3.5 w-3.5 text-violet-500" />
                        : <Video className="h-3.5 w-3.5 text-blue-500" />}
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{key}</code>
                    </div>
                    <Input
                      value={url as string}
                      onChange={(e) => setForm({ ...form, medias: { ...(form.medias ?? {}), [key]: e.target.value } })}
                      placeholder="https://..."
                      className="flex-1 text-xs"
                    />
                    {url && <a href={url} target="_blank" rel="noreferrer" className="shrink-0"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                    <button
                      onClick={() => {
                        const m = { ...(form.medias ?? {}) };
                        delete m[key];
                        setForm({ ...form, medias: m });
                      }}
                      className="shrink-0 text-destructive hover:opacity-70">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );})}
              </div>

              {/* Sugestões rápidas */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1.5">Sugestões rápidas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {["video_abertura","video_conexao","audio_fechamento","video_documentos","audio_objecao_custo","audio_objecao_demora","video_tirzepatida"].map(s => (
                    !(form.medias ?? {})[s] && (
                      <button key={s} onClick={() => setForm({ ...form, medias: { ...(form.medias ?? {}), [s]: "" } })}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 font-mono">
                        + {s}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* Horário */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm">🕐 Horário de atendimento (BRT)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input type="time" value={form.working_hours_start ?? "08:00"} onChange={(e) => setForm({ ...form, working_hours_start: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" value={form.working_hours_end ?? "22:00"} onChange={(e) => setForm({ ...form, working_hours_end: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Mensagem fora do horário</Label>
                <Input value={form.outside_hours_msg ?? ""} onChange={(e) => setForm({ ...form, outside_hours_msg: e.target.value })} placeholder="Olá! O Dr. Maicon retorna amanhã às 8h." />
              </div>
            </div>

            {/* Follow-up */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm">🔔 Follow-up automático</p>
              <div>
                <Label className="text-xs">Horas sem resposta para reativar (48 = 2 dias, 0 = desativado)</Label>
                <Input type="number" min={0} value={form.followup_hours ?? 48} onChange={(e) => setForm({ ...form, followup_hours: Number(e.target.value) })} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se cair fora do horario de atendimento, o envio fica para o proximo horario comercial do funil.
                </p>
              </div>
              <div>
                <Label className="text-xs">Mensagem de follow-up (opcional)</Label>
                <p className="text-[11px] text-muted-foreground mb-1">Deixe vazio para usar: {DEFAULT_FOLLOWUP_MESSAGE}</p>
                <Input value={form.followup_msg ?? ""} onChange={(e) => setForm({ ...form, followup_msg: e.target.value })} placeholder="Deixe vazio para usar mensagem padrão" />
              </div>
            </div>

            <AdvancedSection
              title="Configurações avançadas"
              description="Integrações, prompt técnico, roteiros manuais e automações especiais ficam aqui."
            >
            {/* Notificação */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-medium text-sm">📲 Notificação de contrato</p>
              <Label className="text-xs">Seu número WhatsApp (com DDI) para receber alerta</Label>
              <Input value={form.notify_phone ?? ""} onChange={(e) => setForm({ ...form, notify_phone: e.target.value })} placeholder="5551999999999" />
            </div>

            {/* Playbook manual */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> Fluxo manual salvo
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Perguntas, informacoes, respostas prontas e objecoes ficam salvas neste funil e aparecem na Ficha do Lead dentro do Inbox.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, manual_playbook: clonePrevidenciarioPlaybook() })}>
                    Usar modelo Previdenciário
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, manual_playbook: cloneBpcPlaybook() })}>
                    Usar modelo SDR/Closer BPC
                  </Button>
                  {(form.manual_playbook as any)?.steps?.length && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, manual_playbook: {} })}>
                      Desativar
                    </Button>
                  )}
                </div>
              </div>

              {!(form.manual_playbook as any)?.steps?.length ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum fluxo manual configurado neste funil. Clique em "Usar modelo SDR/Closer BPC" para criar um roteiro editavel.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nome do roteiro</Label>
                      <Input value={(form.manual_playbook as any).name ?? ""} onChange={(e) => setForm({ ...form, manual_playbook: { ...form.manual_playbook, name: e.target.value } })} />
                    </div>
                    <div>
                      <Label className="text-xs">Área</Label>
                      <Input value={(form.manual_playbook as any).area ?? ""} onChange={(e) => setForm({ ...form, manual_playbook: { ...form.manual_playbook, area: e.target.value } })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Descrição</Label>
                      <Input value={(form.manual_playbook as any).description ?? ""} onChange={(e) => setForm({ ...form, manual_playbook: { ...form.manual_playbook, description: e.target.value } })} />
                    </div>
                  </div>

                  {(form.manual_playbook as any).steps.map((step: any) => (
                    <details key={step.id} className="rounded-lg border bg-muted/10" open={step.id === "abertura"}>
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{step.label || step.id}</summary>
                      <div className="space-y-3 border-t p-3">
                        <div>
                          <Label className="text-xs">Nome da etapa</Label>
                          <Input value={step.label ?? ""} onChange={(e) => updateManualStep(step.id, { label: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Objetivo da etapa</Label>
                          <Textarea rows={2} value={step.goal ?? ""} onChange={(e) => updateManualStep(step.id, { goal: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Dados para coletar, um por linha</Label>
                            <Textarea rows={5} value={listToText(step.infoToCollect)} onChange={(e) => updateManualStep(step.id, { infoToCollect: textToList(e.target.value) })} />
                          </div>
                          <div>
                            <Label className="text-xs">Perguntas da etapa, uma por linha</Label>
                            <Textarea rows={5} value={listToText(step.questions)} onChange={(e) => updateManualStep(step.id, { questions: textToList(e.target.value) })} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Respostas prontas, uma por linha</Label>
                          <Textarea rows={4} value={listToText(step.quickReplies)} onChange={(e) => updateManualStep(step.id, { quickReplies: textToList(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-xs">Objeções</Label>
                          <p className="text-[11px] text-muted-foreground mb-1">Formato: Objeção :: resposta pronta</p>
                          <Textarea rows={4} value={objectionsToText(step.objections)} onChange={(e) => updateManualStep(step.id, { objections: textToObjections(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-xs">Áudios, vídeos ou materiais sugeridos</Label>
                          <p className="text-[11px] text-muted-foreground mb-1">Formato: chave | audio | título | roteiro ou observação</p>
                          <Textarea rows={4} value={mediaSuggestionsToText(step.mediaSuggestions)} onChange={(e) => updateManualStep(step.id, { mediaSuggestions: textToMediaSuggestions(e.target.value) })} />
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>

            {/* Google Calendar */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2">📅 Google Agenda</p>
                <div className="flex items-center gap-2">
                  <Switch checked={form.calendar_enabled ?? false} onCheckedChange={(v) => setForm({ ...form, calendar_enabled: v })} />
                  <Label className="text-xs">{form.calendar_enabled ? "Ativado" : "Desativado"}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando a IA usar a ação <code className="bg-muted px-1 rounded">agendar_consulta</code>, o sistema busca horários livres do Google Calendar e oferece ao cliente. O cliente escolhe e o evento é criado automaticamente.
              </p>
              {form.calendar_enabled && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Refresh Token do Google OAuth *</Label>
                    <Input type="password" value={form.calendar_google_token ?? ""} onChange={(e) => setForm({ ...form, calendar_google_token: e.target.value || null })} placeholder="refresh_token da sua conta Google" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Obtenha em: <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-primary underline">Google OAuth Playground</a> — selecione Calendar API v3
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">ID do calendário</Label>
                    <Input value={form.calendar_id ?? ""} onChange={(e) => setForm({ ...form, calendar_id: e.target.value || null })} placeholder="seu@email.com ou ID do calendário" />
                    <p className="text-xs text-muted-foreground mt-1">Para o calendário principal use seu e-mail. Para outros, copie o ID nas configurações do Google Calendar.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Duração (min)</Label>
                      <Input type="number" value={form.calendar_slot_duration ?? 30} onChange={(e) => setForm({ ...form, calendar_slot_duration: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Início (hora)</Label>
                      <Input type="number" min={0} max={23} value={form.calendar_start_hour ?? 9} onChange={(e) => setForm({ ...form, calendar_start_hour: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fim (hora)</Label>
                      <Input type="number" min={0} max={23} value={form.calendar_end_hour ?? 18} onChange={(e) => setForm({ ...form, calendar_end_hour: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Título do evento</Label>
                    <Input value={form.calendar_meeting_title ?? "Consulta — Dr. Maicon Matos"} onChange={(e) => setForm({ ...form, calendar_meeting_title: e.target.value })} />
                  </div>
                </div>
              )}
              {form.calendar_enabled && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
                  <p className="font-medium">Como usar no prompt:</p>
                  <p>Quando o cliente quiser agendar ou você quiser oferecer consulta:</p>
                  <code className="block bg-blue-100 rounded p-1.5 font-mono">
                    {`{"acao": "agendar_consulta", "texto": "Vou verificar minha agenda para amanhã.", ...}`}
                  </code>
                  <p>Quando o cliente responder com o número do horário:</p>
                  <code className="block bg-blue-100 rounded p-1.5 font-mono">
                    {`{"acao": "confirmar_agendamento", "texto": "", ...}`}
                  </code>
                </div>
              )}
            </div>

            {/* Transferência para humano */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2">👤 Transferência para atendimento humano</p>
                <div className="flex items-center gap-2">
                  <Switch checked={form.handoff_enabled ?? true} onCheckedChange={(v) => setForm({ ...form, handoff_enabled: v })} />
                  <Label className="text-xs">{form.handoff_enabled ? "Ativado" : "Desativado"}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando a IA usar a ação <code className="bg-muted px-1 rounded">transferir_humano</code>, envia esta mensagem e pausa a IA automaticamente.
              </p>
              <div>
                <Label className="text-xs">Mensagem ao transferir</Label>
                <Textarea rows={2} value={form.handoff_msg ?? ""} onChange={(e) => setForm({ ...form, handoff_msg: e.target.value })} placeholder="Entendido. Vou acionar minha equipe para falar diretamente com você." />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <p className="font-medium mb-1">Como usar no prompt:</p>
                <code className="block bg-amber-100 rounded p-1.5 font-mono">
                  {`{"acao": "transferir_humano", "texto": "", "nova_fase": "encerrado", ...}`}
                </code>
              </div>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">👥 Grupo WhatsApp automático</p>
                <div className="flex items-center gap-2">
                  <Switch checked={form.group_enabled ?? false} onCheckedChange={(v) => setForm({ ...form, group_enabled: v })} />
                  <Label className="text-xs">{form.group_enabled ? "Ativado" : "Desativado"}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Cria um grupo com o cliente e sua equipe quando chegar na fase de assinatura.</p>
              {form.group_enabled && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Nome do grupo</Label>
                    <Input value={form.group_name_template ?? "Caso {nome} — Dr. Maicon"} onChange={(e) => setForm({ ...form, group_name_template: e.target.value })} placeholder="Caso {nome} — Dr. Maicon" />
                    <p className="text-xs text-muted-foreground mt-1">Variáveis: {"{nome}"}, {"{nomeCrianca}"}, {"{municipio}"}</p>
                  </div>
                  <div>
                    <Label className="text-xs">Números da equipe (com DDI, um por linha)</Label>
                    <Textarea rows={3} value={(form.group_participants ?? []).join("\n")} onChange={(e) => setForm({ ...form, group_participants: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean) })} placeholder={"5551999990001\n5551999990002"} className="font-mono text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Mensagem de boas-vindas no grupo</Label>
                    <Textarea rows={3} value={form.group_welcome_msg ?? ""} onChange={(e) => setForm({ ...form, group_welcome_msg: e.target.value })} placeholder="Olá! Bem-vindo ao grupo do seu caso..." />
                  </div>
                </div>
              )}
            </div>


            {/* A/B Testing */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2">🧪 Teste A/B de prompts</p>
                <div className="flex items-center gap-2">
                  <Switch checked={form.ab_enabled ?? false} onCheckedChange={(v) => setForm({ ...form, ab_enabled: v })} />
                  <Label className="text-xs">{form.ab_enabled ? "Ativado" : "Desativado"}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Crie uma segunda versão do prompt. O sistema divide automaticamente os leads entre as duas versões e você vê qual converte mais.
              </p>
              {form.ab_enabled && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Divisão do tráfego — Versão A recebe <strong>{form.ab_split ?? 50}%</strong> dos leads</Label>
                    <input type="range" min={10} max={90} step={10}
                      value={form.ab_split ?? 50}
                      onChange={(e) => setForm({ ...form, ab_split: Number(e.target.value) })}
                      className="w-full mt-1" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Versão A: {form.ab_split ?? 50}%</span>
                      <span>Versão B: {100 - (form.ab_split ?? 50)}%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Prompt da Versão B</Label>
                    <Textarea rows={8} value={form.prompt_b ?? ""} onChange={(e) => setForm({ ...form, prompt_b: e.target.value })}
                      className="font-mono text-xs" placeholder="Cole aqui o prompt da versão B para comparar com a versão A..." />
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded p-3 text-xs text-purple-800">
                    💡 Dica: Mude apenas um elemento por vez (ex: só o tom, ou só a frase de conexão) para saber exatamente o que melhorou.
                  </div>
                </div>
              )}
            </div>
            {/* ZapSign */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-medium text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Contrato ZapSign</p>
              <Label className="text-xs text-muted-foreground">ID do template no ZapSign</Label>
              <Input value={form.zapsign_template_id ?? ""} onChange={(e) => setForm({ ...form, zapsign_template_id: e.target.value || null })} placeholder="ID do template ZapSign" />
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prompt da persona *</Label>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, persona_prompt: PROMPT_CRECHE })}>Usar prompt Creche</Button>
              </div>
              <Textarea rows={16} value={form.persona_prompt ?? ""} onChange={(e) => setForm({ ...form, persona_prompt: e.target.value })} className="font-mono text-xs" placeholder="Cole aqui o prompt completo da persona..." />
            </div>

            {/* Mensagens pós-consulta */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm">📬 Follow-ups pós-consulta</p>
              <p className="text-xs text-muted-foreground">
                Enviadas automaticamente após a consulta ser marcada como realizada. Deixe em branco para usar a mensagem padrão.
              </p>
              <div>
                <Label>Follow-up D+1 (1 dia após a consulta)</Label>
                <Textarea
                  value={form.post_consulta_d1_msg ?? ""}
                  onChange={(e) => setForm({ ...form, post_consulta_d1_msg: e.target.value })}
                  placeholder="Ex: Olá! Espero que a consulta tenha sido útil. Conseguiu pensar melhor sobre o caso?"
                  rows={2}
                />
              </div>
              <div>
                <Label>Follow-up D+3 (3 dias após a consulta)</Label>
                <Textarea
                  value={form.post_consulta_d3_msg ?? ""}
                  onChange={(e) => setForm({ ...form, post_consulta_d3_msg: e.target.value })}
                  placeholder="Ex: Oi! Passaram alguns dias. Conseguiu reunir a documentação?"
                  rows={2}
                />
              </div>
              <div>
                <Label>Follow-up D+7 (7 dias após a consulta)</Label>
                <Textarea
                  value={form.post_consulta_d7_msg ?? ""}
                  onChange={(e) => setForm({ ...form, post_consulta_d7_msg: e.target.value })}
                  placeholder="Ex: Olá! Sei que decisões jurídicas pedem reflexão. Ainda posso ajudar?"
                  rows={2}
                />
              </div>
            </div>

            </AdvancedSection>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default ?? false} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                <Label>Funil padrão</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar funil"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal simulação */}
      <Dialog open={simOpen} onOpenChange={(v) => { setSimOpen(v); if (!v) resetSim(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-violet-500" />
              Simulando: {simFunil?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 gap-4 pt-2">
            {!simConvId && (
              <div className="space-y-4">
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm text-violet-800">
                  <p className="font-medium mb-1">🧪 Como funciona</p>
                  <p>A IA roda exatamente como com um cliente real. Nenhuma mensagem chega no WhatsApp.</p>
                </div>
                <div>
                  <Label>Primeira mensagem do cliente</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={simMsg} onChange={(e) => setSimMsg(e.target.value)} placeholder="Ex: oi" onKeyDown={(e) => { if (e.key === "Enter") startSim(); }} />
                    <Button onClick={startSim} disabled={simRunning} className="gap-2 shrink-0">
                      <ArrowRight className="h-4 w-4" />
                      {simRunning ? "..." : "Iniciar"}
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {["oi", "quero saber sobre vaga em creche", "qual o custo?"].map((s) => (
                      <button key={s} onClick={() => setSimMsg(s)} className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80">{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {simConvId && (
              <div className="flex flex-col flex-1 min-h-0 gap-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-violet-600 border-violet-300 gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    Simulação ativa
                  </Badge>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={resetSim}>
                      <RotateCcw className="h-3 w-3" /> Reiniciar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setSimOpen(false); navigate({ to: "/inbox" }); }}>
                      <MessageSquare className="h-3 w-3" /> Ver no Inbox
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4 space-y-2 min-h-[280px] max-h-[380px]">
                  {simMessages.length === 0 && simRunning && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      IA processando...
                    </div>
                  )}
                  {simMessages.map((m: any) => (
                    <div key={m.id} className={"flex " + (m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div className={"max-w-[75%] px-3 py-2 rounded-lg text-sm " + (m.direction === "outbound" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background border rounded-tl-none")}>
                        <p className={"text-[10px] mb-0.5 font-medium " + (m.direction === "outbound" ? "opacity-70" : "text-muted-foreground")}>
                          {m.direction === "outbound" ? "🤖 Dr. Maicon (IA)" : "👤 Cliente (simulado)"}
                        </p>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                        <p className={"text-[10px] mt-1 text-right " + (m.direction === "outbound" ? "opacity-60" : "text-muted-foreground")}>
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {simRunning && simMessages.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-background border rounded-lg rounded-tl-none px-3 py-2 flex gap-1">
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                </div>

                {simDirective && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-violet-900 flex items-center gap-1.5">
                      🧠 Diretiva da IA neste turno
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-violet-900/80">
                      <span><b>Tática:</b> {simDirective.tactic}</span>
                      <span><b>Tom:</b> {simDirective.tone}</span>
                      <span><b>Urgência:</b> {simDirective.urgency}</span>
                      <span><b>Mídia agora:</b> {simDirective.send_media_now ? `sim (${simDirective.media_kind})` : "não"}</span>
                    </div>
                    {simDirective.hidden_objection && (
                      <p className="text-amber-800 bg-amber-100/60 rounded px-2 py-1">
                        <b>Objeção escondida:</b> {simDirective.hidden_objection}
                        {simDirective.objection_break && <> — <i>quebrar com:</i> "{simDirective.objection_break}"</>}
                      </p>
                    )}
                    {simDirective.reason && (
                      <p className="text-violet-700/70 italic">{simDirective.reason}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input value={simInput} onChange={(e) => setSimInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendSimMsg(); }} placeholder="Digite como se fosse o cliente..." disabled={simRunning} />
                  <Button onClick={sendSimMsg} disabled={simRunning || !simInput.trim()} className="gap-2 shrink-0">
                    <Send className="h-4 w-4" />
                    {simRunning ? "..." : "Enviar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">Nenhuma mensagem real é enviada</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
