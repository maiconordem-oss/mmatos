/* rebuild-1777216570 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { useAuth } from "@/hooks/use-auth";
import { Plus, Bot, Video, Mic, FileText, Pencil, Trash2, ChevronDown, ChevronUp, ExternalLink, FlaskConical, RotateCcw, MessageSquare, Send, ArrowRight } from "lucide-react";
import { simulateFunnel, resetSimulation } from "@/server/funnel-simulator.server";
import { useAuthServerFn } from "@/hooks/use-server-fn";

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
};

const EMPTY: Omit<Funil, "id"> = {
  name: "", description: "", is_active: true, is_default: false,
  persona_prompt: "", proposal_value: null, proposal_is_free: false,
  media_video_abertura: null, media_video_conexao: null,
  media_audio_fechamento: null, media_video_documentos: null,
  zapsign_template_id: null,
};

const PROMPT_CRECHE = `═══════════════════════════════════════════════════════════════
PROMPT — MAICON MATOS ADVOCACIA v3.0
═══════════════════════════════════════════════════════════════

IDENTIDADE
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
— Se mandar áudio: "Pode digitar aqui pra eu registrar certinho?"

FORMATO OBRIGATÓRIO — responda SEMPRE com JSON válido, nenhum texto fora dele:
{"texto":"...","midias":[],"texto_pos_midia":null,"nova_fase":null,"acao":null,"dados_extraidos":{}}

midias aceitas: "video_abertura", "video_conexao", "audio_fechamento", "video_documentos"
nova_fase: "abertura" → "triagem" → "conexao" → "fechamento" → "coleta" → "assinatura" → "encerrado"
acao: "gerar_contrato" quando dados confirmados, senão null
dados_extraidos: nome, nomeCrianca, idadeCrianca, municipio, cpf, rg, estadoCivil, profissao, endereco, dataNascimentoCrianca, creche, protocolo

ETAPA abertura — primeira mensagem, qualquer que seja:
{"texto":"Me conta o que está acontecendo.","midias":["video_abertura"],"texto_pos_midia":null,"nova_fase":"triagem","acao":null,"dados_extraidos":{}}

ETAPA triagem — uma pergunta por vez:
1. "Qual é o seu nome?"
2. "E o nome do seu filho ou filha?"
3. "Quantos anos e meses ele tem?" — SE >5a11m: encerre com explicação → nova_fase:"encerrado"
4. "Em qual cidade foi pedida a vaga?"
5. "Você já fez o pedido formal na Prefeitura ou Secretaria de Educação?" — SE não: oriente e encerre
6. "O que aconteceu depois — teve negativa formal ou não responderam?"
7. "Você trabalha? Tem alguma urgência — recomendação médica ou vulnerabilidade financeira?"

Quando triagem completa e caso tem fundamento:
{"texto":"[nome], com o que você me contou, o caso de [nomeCrianca] tem base legal sólida.\nO município está descumprindo uma obrigação constitucional.\nCada mês que passa é tempo de desenvolvimento que não volta. Tenho um recado importante pra você.","midias":["video_conexao"],"texto_pos_midia":"Posso abrir o caso de [nomeCrianca] agora?","nova_fase":"conexao","acao":null,"dados_extraidos":{}}

ETAPA conexao — quando confirmar (sim, pode, claro):
{"texto":"Ótimo. Vou te mandar um áudio com minha avaliação.","midias":["audio_fechamento"],"texto_pos_midia":"O que eu falei faz sentido pra você?","nova_fase":"fechamento","acao":null,"dados_extraidos":{}}

ETAPA fechamento — quando confirmar:
"Então vamos. Preciso anotar alguns dados seus. Pode ser agora?" → SE sim: nova_fase:"coleta"

ETAPA coleta — um dado por vez (nome/nomeCrianca/idadeCrianca/municipio já coletados, não repita):
CPF → rg → estadoCivil → profissao → endereco → dataNascimentoCrianca → creche → protocolo

Confirmação final:
{"texto":"Deixa eu confirmar:\n\nNome: [nome]\nCPF: [cpf]\nRG: [rg]\nEstado civil: [estadoCivil]\nProfissão: [profissao]\nEndereço: [endereco]\nCriança: [nomeCrianca], nascida em [dataNascimentoCrianca]\nMunicípio: [municipio]\nCreche: [creche]\n\nEstá tudo certo?","midias":[],"nova_fase":null,"acao":null,"dados_extraidos":{}}

Quando confirmar: {"texto":"Perfeito. Gerando os documentos agora.","midias":[],"nova_fase":"assinatura","acao":"gerar_contrato","dados_extraidos":{}}

ETAPA assinatura:
"São três documentos: contrato, procuração e declaração de hipossuficiência. Assina com o dedo mesmo."
Quando assinado: {"texto":"Documentos assinados. Tenho um recado pra você.","midias":["video_documentos"],"texto_pos_midia":"A parte difícil já passou. Me manda os documentos um por vez.","nova_fase":"encerrado","acao":null,"dados_extraidos":{}}

OBJEÇÕES (qualquer etapa):
CUSTO: "Você não paga nada. Quando o município perde — e na maioria dos casos perde — ele paga meus honorários. Quem banca é a Prefeitura."
DEMORA: "Você não vai precisar ir a lugar nenhum. Já vi liminares em 48h. Sua parte é só me mandar os documentos."
DÚVIDA: "Vaga em creche tem um dos maiores índices de êxito no Judiciário. Já resolvi casos iguais."
DEIXA PENSAR: "Sem pressão. Só saiba que enquanto não abrimos o processo, o município não tem obrigação de te responder."
SE perguntar se é robô: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso."`;

function FunisPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [funis, setFunis] = useState<Funil[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funil | null>(null);
  const [form, setForm] = useState<Omit<Funil, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  // Simulação
  const [simOpen, setSimOpen]       = useState(false);
  const [simFunil, setSimFunil]     = useState<Funil | null>(null);
  const [simMsg, setSimMsg]         = useState("oi");
  const [simRunning, setSimRunning] = useState(false);
  const [simConvId, setSimConvId]   = useState<string | null>(null);
  const [simMessages, setSimMessages] = useState<any[]>([]);
  const [simInput, setSimInput]     = useState("");

  const simulateFn = useAuthServerFn(simulateFunnel);
  const resetFn    = useAuthServerFn(resetSimulation);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("funnels").select("*").eq("user_id", user.id).order("created_at");
    setFunis((data ?? []) as Funil[]);
  };

  useEffect(() => { load(); }, [user]);

  // Carregar mensagens da simulação em tempo real
  useEffect(() => {
    if (!simConvId) return;
    supabase.from("messages").select("*").eq("conversation_id", simConvId).order("created_at")
      .then(({ data }) => setSimMessages(data ?? []));

    const ch = supabase.channel(`sim:${simConvId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages",
          filter: `conversation_id=eq.${simConvId}` },
        () => {
          supabase.from("messages").select("*").eq("conversation_id", simConvId).order("created_at")
            .then(({ data }) => setSimMessages(data ?? []));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [simConvId]);

  const openSim = (f: Funil) => {
    setSimFunil(f);
    setSimMsg("oi");
    setSimConvId(null);
    setSimMessages([]);
    setSimInput("");
    setSimOpen(true);
  };

  const startSim = async () => {
    if (!simFunil) return;
    setSimRunning(true);
    try {
      const r = await simulateFn({ data: { funnel_id: simFunil.id, message: simMsg } });
      setSimConvId(r.conversation_id);
      toast.success("Simulação iniciada!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSimRunning(false); }
  };

  const sendSimMsg = async () => {
    if (!simFunil || !simConvId || !simInput.trim()) return;
    const msg = simInput.trim();
    setSimInput("");
    setSimRunning(true);
    try {
      await simulateFn({ data: { funnel_id: simFunil.id, message: msg } });
    } catch (e: any) { toast.error(e.message); }
    finally { setSimRunning(false); }
  };

  const resetSim = async () => {
    if (!simFunil) return;
    try {
      await resetFn({ data: { funnel_id: simFunil.id } });
      setSimConvId(null);
      setSimMessages([]);
      toast.success("Simulação resetada — pode começar de novo");
    } catch (e: any) { toast.error(e.message); }
  };

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (f: Funil) => {
    setEditing(f);
    setForm({ ...f });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.name.trim() || !form.persona_prompt.trim()) {
      toast.error("Nome e prompt são obrigatórios");
      return;
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
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este funil?")) return;
    await supabase.from("funnels").delete().eq("id", id);
    load();
  };

  const toggleActive = async (f: Funil) => {
    await supabase.from("funnels").update({ is_active: !f.is_active }).eq("id", f.id);
    load();
  };

  const setDefault = async (f: Funil) => {
    if (!user) return;
    await supabase.from("funnels").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("funnels").update({ is_default: true }).eq("id", f.id);
    load();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Toaster />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-7 w-7 text-green-500" /> Funis de Atendimento
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure o atendimento automático via WhatsApp — do primeiro contato ao contrato assinado.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo funil
        </Button>
      </header>

      {funis.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nenhum funil configurado</p>
          <p className="text-sm mt-1">Crie seu primeiro funil para começar o atendimento automático.</p>
          <Button onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Criar funil</Button>
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
                  {f.proposal_is_free
                    ? <Badge variant="outline" className="text-emerald-600">Gratuito</Badge>
                    : f.proposal_value
                      ? <Badge variant="outline">R$ {Number(f.proposal_value).toLocaleString("pt-BR")}</Badge>
                      : null}
                </div>
                {f.description && <p className="text-sm text-muted-foreground mt-1">{f.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                {!f.is_default && (
                  <Button size="sm" variant="outline" onClick={() => setDefault(f)}>Tornar padrão</Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-50" onClick={() => openSim(f)}>
                  <FlaskConical className="h-3.5 w-3.5" /> Simular
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>

            {/* Mídias */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "media_video_abertura",   label: "Vídeo abertura",   icon: Video, field: "media_video_abertura" as const },
                { key: "media_video_conexao",    label: "Vídeo conexão",    icon: Video, field: "media_video_conexao" as const },
                { key: "media_audio_fechamento", label: "Áudio fechamento", icon: Mic,   field: "media_audio_fechamento" as const },
                { key: "media_video_documentos", label: "Vídeo documentos", icon: Video, field: "media_video_documentos" as const },
              ].map(({ label, icon: Icon, field }) => (
                <div key={field} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${f[field] ? "border-green-500/40 bg-green-500/5 text-green-700" : "border-dashed text-muted-foreground"}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {f[field] && <a href={f[field]!} target="_blank" rel="noreferrer" className="ml-auto shrink-0"><ExternalLink className="h-3 w-3" /></a>}
                  {!f[field] && <span className="ml-auto text-amber-500">⚠</span>}
                </div>
              ))}
            </div>

            {/* Prompt preview */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
                onClick={() => setExpandedPrompt(expandedPrompt === f.id ? null : f.id)}
              >
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Prompt da persona</span>
                {expandedPrompt === f.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandedPrompt === f.id && (
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap bg-muted/20 max-h-60 overflow-y-auto">
                  {f.persona_prompt}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar funil" : "Novo funil de atendimento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome do funil *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Vaga em Creche — Porto Alegre" />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição interna" />
              </div>
            </div>

            {/* Honorários */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">💰 Honorários</p>
              <div className="flex items-center gap-3">
                <Switch checked={form.proposal_is_free} onCheckedChange={(v) => setForm({ ...form, proposal_is_free: v, proposal_value: v ? null : form.proposal_value })} />
                <span className="text-sm">Serviço gratuito (honorários pagos pelo réu)</span>
              </div>
              {!form.proposal_is_free && (
                <div>
                  <Label>Valor fixo dos honorários (R$)</Label>
                  <Input type="number" value={form.proposal_value ?? ""} onChange={(e) => setForm({ ...form, proposal_value: e.target.value ? Number(e.target.value) : null })} placeholder="Ex: 1500" />
                </div>
              )}
            </div>

            {/* Mídias */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2"><Video className="h-4 w-4" /> URLs das mídias</p>
              <p className="text-xs text-muted-foreground">Cole aqui os links diretos dos vídeos/áudios. Deixe em branco enquanto não tiver gravado — o sistema envia um placeholder.</p>
              {[
                { label: "🎬 Vídeo de abertura (apresentação)", field: "media_video_abertura" as const },
                { label: "🎬 Vídeo de conexão (urgência emocional)", field: "media_video_conexao" as const },
                { label: "🎙️ Áudio de fechamento (avaliação do Dr. Maicon)", field: "media_audio_fechamento" as const },
                { label: "🎬 Vídeo pós-assinatura (próximos passos)", field: "media_video_documentos" as const },
              ].map(({ label, field }) => (
                <div key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input value={form[field] ?? ""} onChange={(e) => setForm({ ...form, [field]: e.target.value || null })} placeholder="https://..." className="mt-1" />
                </div>
              ))}
            </div>

            {/* Horário de atendimento */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">🕐 Horário de atendimento</p>
              <p className="text-xs text-muted-foreground">Fora deste horário a IA responde uma mensagem e para. Deixe padrão para atender 24h.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Início (BRT)</Label>
                  <Input type="time" value={(form as any).working_hours_start ?? "08:00"} onChange={(e) => setForm({ ...form, working_hours_start: e.target.value } as any)} />
                </div>
                <div>
                  <Label className="text-xs">Fim (BRT)</Label>
                  <Input type="time" value={(form as any).working_hours_end ?? "22:00"} onChange={(e) => setForm({ ...form, working_hours_end: e.target.value } as any)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Mensagem fora do horário</Label>
                <Input value={(form as any).outside_hours_msg ?? ""} onChange={(e) => setForm({ ...form, outside_hours_msg: e.target.value } as any)} placeholder="Olá! O Dr. Maicon retorna amanhã às 8h." />
              </div>
            </div>

            {/* Follow-up */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">🔔 Follow-up automático</p>
              <p className="text-xs text-muted-foreground">Se o lead parar de responder, envia uma mensagem automaticamente após X horas.</p>
              <div>
                <Label className="text-xs">Enviar após (horas sem resposta)</Label>
                <Input type="number" min={0} value={(form as any).followup_hours ?? 3} onChange={(e) => setForm({ ...form, followup_hours: Number(e.target.value) } as any)} placeholder="3" />
                <p className="text-xs text-muted-foreground mt-1">Use 0 para desativar o follow-up.</p>
              </div>
              <div>
                <Label className="text-xs">Mensagem de follow-up (opcional)</Label>
                <Input value={(form as any).followup_msg ?? ""} onChange={(e) => setForm({ ...form, followup_msg: e.target.value } as any)} placeholder="Deixe vazio para usar mensagem padrão personalizada com o nome do lead" />
              </div>
            </div>

            {/* Notificação */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">📲 Notificação de contrato</p>
              <p className="text-xs text-muted-foreground">Quando um contrato for gerado, você recebe uma mensagem no WhatsApp.</p>
              <div>
                <Label className="text-xs">Seu número WhatsApp (com DDI)</Label>
                <Input value={(form as any).notify_phone ?? ""} onChange={(e) => setForm({ ...form, notify_phone: e.target.value } as any)} placeholder="5551999999999" />
              </div>
            </div>

            {/* Grupo WhatsApp */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm flex items-center gap-2">👥 Grupo WhatsApp automático</p>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={(form as any).group_enabled ?? false}
                    onCheckedChange={(v) => setForm({ ...form, group_enabled: v } as any)}
                  />
                  <Label className="text-xs">{(form as any).group_enabled ? "Ativado" : "Desativado"}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando o cliente chegar na fase de <strong>assinatura</strong>, o sistema cria automaticamente um grupo no WhatsApp com o cliente e os números da equipe.
              </p>

              {(form as any).group_enabled && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-xs">Nome do grupo</Label>
                    <Input
                      value={(form as any).group_name_template ?? "Caso {nome} — Dr. Maicon"}
                      onChange={(e) => setForm({ ...form, group_name_template: e.target.value } as any)}
                      placeholder="Caso {nome} — Dr. Maicon"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use <code>{"{nome}"}</code>, <code>{"{nomeCrianca}"}</code>, <code>{"{municipio}"}</code> como variáveis.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Números da equipe (com DDI, um por linha)</Label>
                    <Textarea
                      rows={3}
                      value={((form as any).group_participants ?? []).join("\n")}
                      onChange={(e) => setForm({
                        ...form,
                        group_participants: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean),
                      } as any)}
                      placeholder={"5551999990001\n5551999990002"}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Estes números serão adicionados ao grupo junto com o cliente.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Mensagem de boas-vindas no grupo (opcional)</Label>
                    <Textarea
                      rows={4}
                      value={(form as any).group_welcome_msg ?? ""}
                      onChange={(e) => setForm({ ...form, group_welcome_msg: e.target.value } as any)}
                      placeholder="Olá, {nome}! Bem-vindo ao grupo do seu caso. Aqui você receberá todas as atualizações..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar a mensagem padrão.</p>
                  </div>
                </div>
              )}
            </div>
              <Label className="text-xs text-muted-foreground">ID do template no ZapSign (para geração automática de contrato)</Label>
              <Input value={form.zapsign_template_id ?? ""} onChange={(e) => setForm({ ...form, zapsign_template_id: e.target.value || null })} placeholder="ID do template ZapSign" />
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prompt da persona *</Label>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, persona_prompt: PROMPT_CRECHE })}>
                  Usar prompt Creche
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O prompt define como a IA vai se comportar em toda a conversa. Inclua identidade, tom, fluxo de fases e formato JSON obrigatório.
              </p>
              <Textarea rows={16} value={form.persona_prompt} onChange={(e) => setForm({ ...form, persona_prompt: e.target.value })} className="font-mono text-xs" placeholder="Cole aqui o prompt completo da persona..." />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
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
      {/* Modal de Simulação */}
      <Dialog open={simOpen} onOpenChange={(v) => { setSimOpen(v); if (!v) resetSim(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-violet-500" />
              Simulando: {simFunil?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col flex-1 min-h-0 gap-4 pt-2">

            {/* Início da simulação */}
            {!simConvId && (
              <div className="space-y-4">
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm text-violet-800">
                  <p className="font-medium mb-1">🧪 Como funciona a simulação</p>
                  <p>A IA vai rodar exatamente como faria com um cliente real — mesmas fases, mesma lógica, mesmo prompt. A diferença é que as mensagens <strong>não chegam no WhatsApp</strong>, ficam só aqui.</p>
                </div>
                <div>
                  <Label>Primeira mensagem do cliente (simule o que ele mandaria)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={simMsg} onChange={e => setSimMsg(e.target.value)}
                      placeholder="Ex: oi, quero saber sobre vaga em creche"
                      onKeyDown={e => e.key === "Enter" && startSim()} />
                    <Button onClick={startSim} disabled={simRunning} className="gap-2 shrink-0">
                      <ArrowRight className="h-4 w-4" />
                      {simRunning ? "Iniciando..." : "Iniciar"}
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {["oi", "quero saber sobre vaga em creche", "qual o custo?", "como funciona?"].map(s => (
                      <button key={s} onClick={() => setSimMsg(s)}
                        className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chat de simulação */}
            {simConvId && (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-violet-600 border-violet-300 gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    Simulação ativa
                  </Badge>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={resetSim}>
                      <RotateCcw className="h-3 w-3" /> Reiniciar do zero
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                      onClick={() => { setSimOpen(false); navigate({ to: "/inbox" }); }}>
                      <MessageSquare className="h-3 w-3" /> Ver no Inbox
                    </Button>
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4 space-y-2 min-h-[300px] max-h-[400px]">
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
                    <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${
                        m.direction === "outbound"
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-background border rounded-tl-none"
                      }`}>
                        {m.direction === "inbound" && (
                          <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">👤 Cliente (simulado)</p>
                        )}
                        {m.direction === "outbound" && (
                          <p className="text-[10px] mb-0.5 font-medium opacity-70">🤖 Dr. Maicon (IA)</p>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                        <p className={`text-[10px] mt-1 text-right ${m.direction === "outbound" ? "opacity-60" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {simRunning && simMessages.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-background border rounded-lg rounded-tl-none px-3 py-2">
                        <div className="flex gap-1">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <Input
                    value={simInput}
                    onChange={e => setSimInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendSimMsg()}
                    placeholder="Digite como se fosse o cliente..."
                    disabled={simRunning}
                  />
                  <Button onClick={sendSimMsg} disabled={simRunning || !simInput.trim()} className="gap-2 shrink-0">
                    <Send className="h-4 w-4" />
                    {simRunning ? "..." : "Enviar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Nenhuma mensagem real é enviada — tudo fica neste simulador
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
