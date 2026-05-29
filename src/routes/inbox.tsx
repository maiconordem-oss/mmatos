import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useNotification } from "@/hooks/use-notification";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import {
  avatar, formatTime, formatMsgTime, hoursUntil, playbookForPhase, groupByDate,
  manualQuestionsForPhase, phaseGuidance, FASES, FASE_LABELS, FASE_COLORS, DADO_LABELS,
} from "@/lib/inbox-helpers";
import { getManualPlaybook, getManualStep } from "@/lib/manual-playbooks";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Search, MoreVertical, Phone, Video, Smile, Paperclip, Mic, Bot, Sparkles, MessageSquare, CheckCheck, X, ChevronRight, User, FileText, FileSignature, Calendar, Clock, Wand2, Languages, Smile as SmileIcon, ListChecks, ScrollText, Loader2, Image, ExternalLink, Zap, AlertTriangle, UserCheck, RotateCcw, HeartPulse, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { normalizeBRPhone, formatBRPhone, phoneVariants } from "@/lib/phone";
import { qualifierReply, extractQualification, generateProposal } from "@/server/ai-agent.functions";
import {
  suggestReplies, rewriteMessage, summarizeConversation,
  extractTasks, translateText, analyzeSentiment, semanticSearch,
} from "@/server/inbox-ai.functions";
import {
  generateLegalBriefing, evaluateCaseViability,
  markConsultationAttended, sendHonorarioProposal,
} from "@/server/juridico.functions";
import { transcribeAudioMessage, generateTTS } from "@/server/elevenlabs.functions";
import { sendWhatsappMessage } from "@/server/whatsapp.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Atendimentos WhatsApp — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell noPadding>
        <InboxPage />
      </AppShell>
    </AuthGate>
  ),
});

type Conversation = {
  id: string; phone: string; contact_name: string | null;
  last_message_preview: string | null; last_message_at: string | null;
  unread_count: number; ai_paused: boolean; ai_handled: boolean;
  ticket_status: 'pending' | 'open' | 'resolved';
  assigned_to: string | null;
  tags: string[];
  instance_id: string | null;
  photo_url: string | null;
  blocked: boolean;
  sentiment?: string | null;
  priority_flag?: string | null;
  needs_human?: boolean;
  follow_up_required?: boolean;
  sla_due_at?: string | null;
  first_response_at?: string | null;
  ai_pause_reason?: string | null;
  briefing?: any | null;
  consulta_at?: string | null;
};

type QuickReply = { id: string; shortcut: string; message: string };
type ConvTag    = { id: string; name: string; color: string };
type FunnelOption = { id: string; name: string; is_active: boolean; persona_prompt?: string | null };
type QueueFilter = "all" | "novo" | "humano" | "followup" | "urgente" | "sla";
type AssignmentEvent = {
  id: string;
  event_type: string;
  note: string | null;
  assigned_to: string | null;
  created_at: string;
};

type Message = {
  id: string; direction: "inbound" | "outbound";
  conversation_id?: string;
  content: string | null; created_at: string; status?: string;
  media_type?: string | null; media_url?: string | null; media_mime?: string | null;
  delivered_at?: string | null; read_at?: string | null;
  transcription?: string | null;
  external_id?: string | null;
  last_error?: string | null;
};

const proxyUrl = (msg: Message, token: string | null) =>
  msg.media_url && token ? `/api/media-proxy?msg=${msg.id}&token=${encodeURIComponent(token)}` : null;

const storageUri = (path: string) => `whatsapp-media://${path}`;

async function createWhatsappMediaSignedUrl(path: string) {
  const { data, error } = await supabase.storage
    .from("whatsapp-media")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "URL de mídia não gerada");
  }
  return data.signedUrl;
}

function questionsFromFunnelPrompt(prompt?: string | null) {
  if (!prompt) return [];
  const seen = new Set<string>();
  return prompt
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(line => line.includes("?") && line.length >= 12 && line.length <= 180)
    .filter(line => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function mediaEntriesFromFunnel(funnel?: FunnelState["funnels"]) {
  if (!funnel) return [];
  const legacy = {
    video_abertura: funnel.media_video_abertura,
    video_conexao: funnel.media_video_conexao,
    audio_fechamento: funnel.media_audio_fechamento,
    video_documentos: funnel.media_video_documentos,
  };
  return Object.entries({ ...legacy, ...(funnel.medias ?? {}) })
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, url]) => ({
      key,
      url,
      label: key.replace(/^media_/, "").replace(/_/g, " "),
      type: key.includes("audio") ? "audio" : "video",
    }));
}

type FunnelState = {
  id?: string;
  funnel_id?: string | null;
  fase: string;
  dados: Record<string, any>;
  midias_enviadas: string[];
  funnels: {
    name: string;
    persona_prompt?: string | null;
    medias?: Record<string, string> | null;
    media_video_abertura?: string | null;
    media_video_conexao?: string | null;
    media_audio_fechamento?: string | null;
    media_video_documentos?: string | null;
    zapsign_template_id?: string | null;
    calendar_enabled?: boolean | null;
    manual_playbook?: any;
  } | null;
};

// ── Componentes auxiliares ─────────────────────────────────────
function ContactAvatar({ conv, size = "md" }: { conv: Conversation; size?: "sm" | "md" | "lg" }) {
  const av = avatar(conv.contact_name, conv.phone);
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };
  if (conv.photo_url) {
    return (
      <img src={conv.photo_url} alt={conv.contact_name || conv.phone}
        className={`${sizes[size]} rounded-full object-cover shrink-0`}
        onError={e => {
          // Se foto falhar, mostrar inicial
          const el = e.target as HTMLImageElement;
          el.style.display = "none";
          el.nextElementSibling?.removeAttribute("style");
        }} />
    );
  }
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: av.color }}>
      {av.label}
    </div>
  );
}


function calcSlaDue(conv: Conversation) {
  if (conv.sla_due_at) return conv.sla_due_at;
  if (!conv.last_message_at || conv.ticket_status === "resolved") return null;
  const base = new Date(conv.last_message_at).getTime();
  const hours = conv.priority_flag === "alta" || conv.needs_human ? 1 : conv.follow_up_required ? 4 : 2;
  return new Date(base + hours * 3600000).toISOString();
}

function queueKind(conv: Conversation): Exclude<QueueFilter, "all"> {
  if (conv.priority_flag === "alta") return "urgente";
  if (conv.needs_human || conv.ai_paused) return "humano";
  if (conv.follow_up_required) return "followup";
  if ((conv.ticket_status ?? "pending") === "pending") return "novo";
  const sla = hoursUntil(calcSlaDue(conv));
  return sla !== null && sla <= 0 ? "sla" : "novo";
}

function slaLabel(conv: Conversation) {
  const due = calcSlaDue(conv);
  const hours = hoursUntil(due);
  if (hours === null) return null;
  if (hours <= 0) return "Atrasado";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
  return `${Math.round(hours)}h`;
}


// ── Painel lateral do lead ─────────────────────────────────────
function LeadPanel({ conv, onClose, onConvUpdated, onUseText }: {
  conv: Conversation;
  onClose: () => void;
  onConvUpdated?: (id: string) => void;
  onUseText?: (text: string) => void;
}) {
  const { user } = useAuth();
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [clienteExiste, setClienteExiste] = useState<any>(null);
  const [form, setForm]             = useState({
    name: conv.contact_name || "",
    phone: conv.phone || "",
    email: "",
    cpf: "",
    notes: "",
  });

  // Verificar se já é cliente (por qualquer variante do número)
  useEffect(() => {
    if (!conv.phone) return;
    const variants = phoneVariants(conv.phone);
    supabase.from("clients")
      .select("id, full_name, email, document")
      .in("phone", variants.length ? variants : [conv.phone.replace(/\D/g, "")])
      .limit(1).maybeSingle()
      .then(({ data }) => setClienteExiste(data));
  }, [conv.phone]);

  // Preencher form com dados do funil
  useEffect(() => {
    if (!conv.id) return;
    supabase.from("funnel_states")
      .select("dados")
      .eq("conversation_id", conv.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.dados) return;
        const d = data.dados as any;
        setForm(prev => ({
          ...prev,
          name:  d.nome  || d.full_name || prev.name,
          email: d.email || prev.email,
          cpf:   d.cpf   || d.document  || prev.cpf,
        }));
      });
  }, [conv.id]);

  const cadastrarCliente = async () => {
    if (!form.name.trim() || !user) return;
    setSaving(true);
    try {
      const phone = normalizeBRPhone(form.phone) || form.phone.replace(/\D/g, "");
      // Upsert pelo telefone (verifica todas as variantes)
      const variants = phoneVariants(phone);
      const { data: existing } = await supabase.from("clients")
        .select("id").in("phone", variants.length ? variants : [phone])
        .eq("user_id", user.id).limit(1).maybeSingle();

      let data: any;
      if (existing?.id) {
        // Atualizar
        const { data: updated, error } = await supabase.from("clients").update({
          full_name: form.name.trim(),
          whatsapp:  phone,
          email:     form.email.trim()  || null,
          document:  form.cpf.trim()    || null,
          notes:     form.notes.trim()  || null,
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        data = updated;
      } else {
        // Inserir novo
        const { data: inserted, error } = await supabase.from("clients").insert({
          user_id:   user.id,
          full_name: form.name.trim(),
          phone:     phone,
          whatsapp:  phone,
          email:     form.email.trim()  || null,
          document:  form.cpf.trim()    || null,
          notes:     form.notes.trim()  || null,
        }).select().single();
        if (error) throw error;
        data = inserted;
      }
      setClienteExiste(data);
      setSaved(true);
      setShowForm(false);
      toast.success("Cliente cadastrado com sucesso!");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const [state, setState] = useState<FunnelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  // Juridico state
  const [briefing, setBriefing]                   = useState<any | null>(conv.briefing ?? null);
  const [viability, setViability]                 = useState<{ score: number; notes: string } | null>(null);
  const [appointment, setAppointment]             = useState<any | null>(null);
  const [juridicoLoading, setJuridicoLoading]     = useState<string | null>(null);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showAttendedModal, setShowAttendedModal] = useState(false);
  const [proposal, setProposal] = useState({ paymentType: "fixo" as "fixo"|"exito"|"mensalidade"|"misto", value: "", scope: "", details: "" });

  const genBriefingFn     = useAuthServerFn(generateLegalBriefing);
  const evalViabilityFn   = useAuthServerFn(evaluateCaseViability);
  const markAttendedFn    = useAuthServerFn(markConsultationAttended);
  const sendProposalFn    = useAuthServerFn(sendHonorarioProposal);

  // Load appointment and viability
  useEffect(() => {
    supabase.from("appointments")
      .select("id, title, start_at, attended")
      .eq("conversation_id", conv.id)
      .eq("attended", false)
      .order("start_at", { ascending: true })
      .limit(1).maybeSingle()
      .then(async ({ data, error }) => {
        if (!error) {
          setAppointment(data);
          return;
        }
        const fallback = await supabase.from("appointments")
          .select("id, title, start_at")
          .eq("conversation_id", conv.id)
          .order("start_at", { ascending: true })
          .limit(1).maybeSingle();
        setAppointment(fallback.data ? { ...fallback.data, attended: false } : null);
      });

    supabase.from("funnel_states")
      .select("viability_score, viability_notes")
      .eq("conversation_id", conv.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        if (data?.viability_score != null) {
          setViability({ score: data.viability_score, notes: data.viability_notes ?? "" });
        }
      });
  }, [conv.id]);

  const handleGenBriefing = async () => {
    setJuridicoLoading("briefing");
    try {
      const result = await genBriefingFn({ data: { conversationId: conv.id } });
      setBriefing(result.briefing);
      onConvUpdated?.(conv.id);
    } catch (e: any) { toast.error(e.message); }
    finally { setJuridicoLoading(null); }
  };

  const handleEvalViability = async () => {
    setJuridicoLoading("viability");
    try {
      const result = await evalViabilityFn({ data: { conversationId: conv.id } });
      setViability({ score: result.score, notes: result.notes });
    } catch (e: any) { toast.error(e.message); }
    finally { setJuridicoLoading(null); }
  };

  const handleMarkAttended = async () => {
    if (!appointment) return;
    setJuridicoLoading("attended");
    try {
      await markAttendedFn({ data: { appointmentId: appointment.id, conversationId: conv.id } });
      setAppointment(null);
      setShowAttendedModal(false);
      onConvUpdated?.(conv.id);
      toast.success("Consulta marcada como realizada! Follow-ups D+1/D+3/D+7 agendados.");
    } catch (e: any) { toast.error(e.message); }
    finally { setJuridicoLoading(null); }
  };

  const handleSendProposal = async () => {
    const value = parseFloat(proposal.value.replace(",", "."));
    if (!value || !proposal.scope) { toast.error("Preencha valor e escopo"); return; }
    setJuridicoLoading("proposal");
    try {
      await sendProposalFn({ data: {
        conversationId: conv.id,
        paymentType: proposal.paymentType,
        value,
        scope: proposal.scope,
        details: proposal.details || undefined,
      }});
      setShowProposalModal(false);
      setProposal({ paymentType: "fixo", value: "", scope: "", details: "" });
      toast.success("Proposta enviada via WhatsApp!");
    } catch (e: any) { toast.error(e.message); }
    finally { setJuridicoLoading(null); }
  };

  useEffect(() => {
    setLoading(true);
    supabase.from("funnel_states")
      .select("id, funnel_id, fase, dados, midias_enviadas, funnels(name, persona_prompt, medias, manual_playbook, media_video_abertura, media_video_conexao, media_audio_fechamento, media_video_documentos, zapsign_template_id, calendar_enabled)")
      .eq("conversation_id", conv.id).maybeSingle()
      .then(({ data }) => {
        setState(data as any);
        setSelectedPhase((data as any)?.fase ?? null);
        setLoading(false);
      });
  }, [conv.id]);

  const faseIdx = state ? FASES.indexOf(state.fase) : -1;
  const guidePhase = selectedPhase || state?.fase || "abertura";
  const dados = state?.dados ?? {};
  const dadosKeys = Object.keys(dados).filter(k => dados[k] && DADO_LABELS[k]);
  const funnel = state?.funnels as FunnelState["funnels"];
  const manualPlaybook = getManualPlaybook(funnel);
  const manualStep = getManualStep(manualPlaybook, guidePhase);
  const phaseQuestions = manualStep.questions.length ? manualStep.questions : manualQuestionsForPhase(guidePhase);
  const guidance = phaseGuidance(guidePhase);
  const mediaEntries = mediaEntriesFromFunnel(funnel);
  const sentMedia = new Set(state?.midias_enviadas ?? []);

  return (
    <div className="inbox-lead-panel absolute inset-y-0 right-0 z-30 flex w-full max-w-[min(640px,100vw)] flex-col border-l border-[#d1d7db] shadow-2xl" style={{ background: "#f0f2f5" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e9edef]" style={{ background: "#f0f2f5" }}>
        <span className="text-[#111b21] text-base font-semibold">Ficha do Lead</span>
        <button onClick={onClose} className="text-[#54656f] hover:text-[#111b21] p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Identidade */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ background: avatar(conv.contact_name, conv.phone).color }}>
            {avatar(conv.contact_name, conv.phone).label}
          </div>
          <div>
            <p className="text-[#111b21] font-semibold text-base">{conv.contact_name || conv.phone}</p>
            <p className="text-[#667781] text-sm">{formatBRPhone(conv.phone) || conv.phone}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {conv.ai_paused
                ? <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30">Você responde</Badge>
                : <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">IA responde</Badge>
              }
            </div>
          </div>
        </div>

        {/* Botão cadastrar cliente */}
        <div className="rounded-lg border border-[#e9edef] overflow-hidden bg-white">
          {clienteExiste ? (
            <div className="px-3 py-2.5 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#25d366] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide">Cliente cadastrado</p>
                <p className="text-[#111b21] text-sm font-medium truncate">{clienteExiste.full_name}</p>
                {clienteExiste.document && <p className="text-[#8696a0] text-[10px]">CPF: {clienteExiste.document}</p>}
              </div>
              <button onClick={() => setShowForm(!showForm)}
                className="text-[10px] text-[#25d366] hover:underline shrink-0">editar</button>
            </div>
          ) : (
            <button onClick={() => setShowForm(!showForm)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#f0f2f5] transition-colors text-left">
              <div className="h-7 w-7 rounded-full bg-[#25d366]/20 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-[#25d366]" />
              </div>
              <div>
                <p className="text-[#111b21] text-sm font-medium">Cadastrar como cliente</p>
                <p className="text-[#8696a0] text-[10px]">Salvar na base de clientes</p>
              </div>
            </button>
          )}

          {showForm && (
            <div className="border-t border-[#e9edef] px-3 py-3 space-y-2">
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Nome *</p>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] focus:border-[#25d366] placeholder-[#8696a0]"
                  placeholder="Nome completo" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Telefone</p>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0]"
                  placeholder="5551999999999" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">E-mail</p>
                <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0]"
                  placeholder="email@exemplo.com" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">CPF</p>
                <input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))}
                  className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0]"
                  placeholder="000.000.000-00" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Observações</p>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} maxLength={2000} className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0] resize-none"
                  placeholder="Anotações sobre o cliente..." />
                <p className="text-right text-[10px] text-[#8696a0] mt-0.5">{form.notes.length}/2000</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs text-[#54656f] hover:text-[#111b21] border border-[#e9edef] hover:bg-[#f0f2f5] transition-colors">
                  Cancelar
                </button>
                <button onClick={cadastrarCliente} disabled={saving || !form.name.trim()}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium text-black disabled:opacity-50 transition-colors"
                  style={{ background: "#25d366" }}>
                  {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar"}
                </button>
              </div>
            </div>
          )}
        </div>

        {loading && <p className="text-[#8696a0] text-xs text-center py-4">Carregando...</p>}

        {!loading && !state && (
          <div className="text-center py-4">
            <Bot className="h-8 w-8 mx-auto mb-2 text-[#8696a0] opacity-40" />
            <p className="text-[#667781] text-xs">Funil ainda não iniciado</p>
          </div>
        )}

        {!loading && state && (
          <>
            {/* Funil */}
            {(state.funnels as any)?.name && (
              <div className="rounded-lg p-3 border border-[#e9edef] bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-1">Funil assistido</p>
                    <p className="text-[#111b21] text-sm font-medium">{(state.funnels as any).name}</p>
                  </div>
                  <Badge className="text-[10px] px-1.5 py-0 bg-[#00a884]/10 text-[#007a60] border-[#00a884]/20">
                    {FASE_LABELS[state.fase] || state.fase}
                  </Badge>
                </div>
              </div>
            )}

            <details className="rounded-lg border border-[#e9edef] bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[#111b21]">
                <span>
                  <span className="block text-sm font-semibold">Funil e roteiro</span>
                  <span className="text-xs text-[#667781]">{manualStep.label || guidance.title}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#8696a0]" />
              </summary>
              <div className="space-y-3 border-t border-[#e9edef] p-3">

            <div className="rounded-lg p-4 border border-[#e9edef] bg-white">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <p className="text-[10px] text-[#8696a0] uppercase tracking-wide">Funil de atendimento</p>
                  <p className="text-sm font-semibold text-[#111b21]">{manualPlaybook.name}</p>
                </div>
                <span className="text-[10px] text-[#8696a0]">clique para consultar</span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {FASES.map((fase, i) => {
                  const done = i < faseIdx;
                  const current = i === faseIdx;
                  const selected = fase === guidePhase;
                  const color = FASE_COLORS[fase] || "#00a884";

                  return (
                    <button
                      key={fase}
                      type="button"
                      onClick={() => setSelectedPhase(fase)}
                      className="flex min-h-[74px] flex-col items-center justify-start gap-1 rounded-lg border px-2 py-2 text-center transition hover:bg-[#f0f2f5]"
                      style={{
                        borderColor: selected ? color : "#e9edef",
                        background: selected ? `${color}12` : done ? "#f8fffc" : "white",
                      }}
                      title={phaseGuidance(fase).title}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>
                        {done ? <CheckCheck className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="text-[10px] font-semibold leading-tight text-[#111b21]">{FASE_LABELS[fase]}</span>
                      <span className="text-[9px] font-medium" style={{ color: current || selected ? color : "#8696a0" }}>
                        {current ? "atual" : done ? "feito" : selected ? "visualizando" : "pendente"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Perguntas do funil */}
            <div className="rounded-lg p-4 border border-[#e9edef] bg-white">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-[10px] text-[#8696a0] uppercase tracking-wide">Roteiro da etapa</p>
                  <p className="text-base font-semibold text-[#111b21]">{manualStep.label || guidance.title}</p>
                </div>
                <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: (FASE_COLORS[guidePhase] || "#00a884") + "24", color: FASE_COLORS[guidePhase] || "#007a60" }}>
                  {FASE_LABELS[guidePhase] || "Atendimento"}
                </span>
              </div>
              <div className="mb-3 rounded-lg bg-[#f0f2f5] px-3 py-2.5">
                <p className="text-sm leading-relaxed text-[#54656f]">{manualStep.goal || guidance.goal}</p>
                <p className="mt-1 text-xs font-medium text-[#007a60]">{guidance.next}</p>
              </div>
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Dados para coletar</p>
                <div className="flex flex-wrap gap-1.5">
                  {(manualStep.infoToCollect.length ? manualStep.infoToCollect : playbookForPhase(guidePhase)).map(item => (
                    <span key={item} className="rounded-full bg-white/80 border border-emerald-200 px-2 py-1 text-[10px] font-medium text-emerald-800">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              {manualStep.quickReplies.length > 0 && (
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-sky-800">Respostas prontas</p>
                  <div className="space-y-1.5">
                    {manualStep.quickReplies.map(reply => (
                      <button
                        key={reply}
                        onClick={() => onUseText?.(reply)}
                        className="w-full rounded-lg border border-sky-200 bg-white/80 px-2.5 py-2 text-left text-xs leading-relaxed text-sky-950 hover:bg-white"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-teal-800">Perguntas da etapa</p>
                <div className="space-y-1.5">
                {phaseQuestions.map(question => (
                  <button
                    key={question}
                    onClick={() => onUseText?.(question)}
                    className="w-full rounded-lg border border-teal-200 bg-white/80 px-2.5 py-2 text-left text-xs leading-relaxed text-teal-900 hover:bg-white"
                  >
                    {question}
                  </button>
                ))}
                </div>
              </div>
              {manualStep.objections.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Quebra de objeções</p>
                  <div className="space-y-1.5">
                  {manualStep.objections.map(objection => (
                    <button
                      key={objection.label}
                      onClick={() => onUseText?.(objection.reply)}
                      className="w-full rounded-lg border border-amber-200 bg-white/70 px-2.5 py-2 text-left hover:bg-white"
                    >
                      <span className="block text-[11px] font-semibold text-amber-800">{objection.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-amber-900">{objection.reply}</span>
                    </button>
                  ))}
                  </div>
                </div>
              )}
              {manualStep.mediaSuggestions.length > 0 && (
                <div className="mt-3 space-y-1.5 rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-800">Áudios e materiais sugeridos</p>
                  {manualStep.mediaSuggestions.map(media => (
                    <button
                      key={media.key}
                      onClick={() => onUseText?.(media.script)}
                      className="w-full rounded-lg border border-violet-200 bg-white/80 px-2.5 py-2 text-left hover:bg-white"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#111b21]">
                        {media.type === "audio" ? <Mic className="h-3.5 w-3.5 text-violet-500" /> : <Video className="h-3.5 w-3.5 text-blue-500" />}
                        {media.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[#54656f]">{media.script}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {playbookForPhase(guidePhase).map(item => (
                  <span key={item} className="rounded-full bg-[#f0f2f5] px-2 py-1 text-[10px] text-[#54656f]">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Mídias do funil */}
            <div className="rounded-lg p-3 border border-[#e9edef] bg-white">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide">Áudios e vídeos</p>
                <span className="text-[10px] text-[#8696a0]">{mediaEntries.length}</span>
              </div>
              {mediaEntries.length === 0 ? (
                <p className="text-xs text-[#8696a0]">Nenhuma mídia configurada neste funil.</p>
              ) : (
                <div className="space-y-1.5">
                  {mediaEntries.map(media => {
                    const sent = sentMedia.has(media.key);
                    return (
                      <a
                        key={media.key}
                        href={media.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-[#e9edef] px-2.5 py-2 text-xs text-[#111b21] hover:bg-[#f0f2f5]"
                      >
                        {media.type === "audio" ? <Mic className="h-3.5 w-3.5 text-violet-500" /> : <Video className="h-3.5 w-3.5 text-blue-500" />}
                        <span className="min-w-0 flex-1 truncate capitalize">{media.label}</span>
                        {sent ? (
                          <span className="shrink-0 rounded-full bg-[#25d366]/15 px-1.5 py-0.5 text-[10px] text-[#128C7E]">enviado</span>
                        ) : (
                          <ExternalLink className="h-3 w-3 shrink-0 text-[#8696a0]" />
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progresso de fases */}
            <div className="hidden rounded-lg p-3 border border-[#e9edef] bg-white">
              <p className="hidden text-[10px] text-[#8696a0] uppercase tracking-wide mb-3">Progresso</p>
              <div className="space-y-1.5">
                {FASES.map((fase, i) => {
                  const done    = i < faseIdx;
                  const current = i === faseIdx;
                  const future  = i > faseIdx;
                  const selected = fase === guidePhase;
                  return (
                    <button
                      key={fase}
                      type="button"
                      onClick={() => setSelectedPhase(fase)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[#f0f2f5]",
                        selected && "bg-[#f0f2f5]"
                      )}
                    >
                      <div className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        done    && "bg-[#25d366] text-black",
                        current && "border-2",
                        future  && "bg-[#f0f2f5] text-[#667781]",
                      )} style={current ? { borderColor: FASE_COLORS[fase], color: FASE_COLORS[fase] } : {}}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span className={cn(
                        "text-xs",
                        done    && "text-[#25d366]",
                        current && "font-semibold",
                        future  && "text-[#8696a0]",
                      )} style={current ? { color: FASE_COLORS[fase] } : {}}>
                        {FASE_LABELS[fase]}
                      </span>
                      {current && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: FASE_COLORS[fase] + "30", color: FASE_COLORS[fase] }}>
                          atual
                        </span>
                      )}
                      {selected && !current && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8f5f1] text-[#007a60]">
                          vendo
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dados coletados */}
            {dadosKeys.length > 0 && (
              <div className="rounded-lg p-3 border border-[#e9edef] bg-white">
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-2">Dados coletados</p>
                <div className="space-y-1.5">
                  {dadosKeys.map(k => (
                    <div key={k} className="flex items-start gap-2">
                      <span className="text-[10px] text-[#8696a0] shrink-0 pt-0.5 w-24">{DADO_LABELS[k]}:</span>
                      <span className="text-xs text-[#111b21] break-words">{String(dados[k])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mídias enviadas */}
            {state.midias_enviadas.length > 0 && (
              <div className="rounded-lg p-3 border border-[#e9edef] bg-white">
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-2">Mídias enviadas</p>
                <div className="space-y-1">
                  {state.midias_enviadas.map(m => (
                    <div key={m} className="flex items-center gap-1.5 text-[11px] text-[#25d366]">
                      <CheckCheck className="h-3 w-3 shrink-0" />
                      {m.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg p-3 border border-[#e9edef] bg-white">
              <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-2">Contrato e agendamento</p>
              <div className="grid gap-1.5">
                <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-2.5 py-2">
                  <FileSignature className="h-3.5 w-3.5 text-[#54656f]" />
                  <span className="min-w-0 flex-1 text-xs text-[#111b21]">Template ZapSign</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", funnel?.zapsign_template_id ? "bg-[#25d366]/15 text-[#128C7E]" : "bg-slate-200 text-[#667781]")}>
                    {funnel?.zapsign_template_id ? "configurado" : "ausente"}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-2.5 py-2">
                  <Calendar className="h-3.5 w-3.5 text-[#54656f]" />
                  <span className="min-w-0 flex-1 text-xs text-[#111b21]">Agenda do funil</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", funnel?.calendar_enabled ? "bg-[#25d366]/15 text-[#128C7E]" : "bg-slate-200 text-[#667781]")}>
                    {funnel?.calendar_enabled ? "ativa" : "inativa"}
                  </span>
                </div>
              </div>
            </div>
              </div>
            </details>
          </>
        )}

        {/* ── PAINEL JURÍDICO ── */}
        <details className="rounded-lg border border-[#e9edef] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[#111b21]">
            <span>
              <span className="block text-sm font-semibold">JurÃ­dico</span>
              <span className="text-xs text-[#667781]">Briefing, viabilidade e proposta</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#8696a0]" />
          </summary>
          <div className="border-t border-[#e9edef] p-3">
        <div className="rounded-lg border border-[#e9edef] bg-white overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[#e9edef] flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-[#8696a0]" />
            <span className="text-[10px] text-[#8696a0] uppercase tracking-wide font-semibold">Jurídico</span>
          </div>

          <div className="p-3 space-y-3">
            {/* F2: Consulta pendente */}
            {appointment && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                <p className="text-[10px] text-amber-700 font-semibold mb-1">📅 Consulta agendada</p>
                <p className="text-xs text-amber-800">{appointment.title}</p>
                <p className="text-[10px] text-amber-600">{new Date(appointment.start_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                <button onClick={() => setShowAttendedModal(true)}
                  className="mt-2 w-full text-xs py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
                  ✅ Marcar como realizada
                </button>
              </div>
            )}

            {/* F3: Briefing */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-[#8696a0] font-semibold uppercase tracking-wide">Briefing do caso</p>
                <button onClick={handleGenBriefing} disabled={juridicoLoading === "briefing"}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#25d366]/20 text-[#128C7E] hover:bg-[#25d366]/30 transition-colors disabled:opacity-50">
                  {juridicoLoading === "briefing" ? "Gerando..." : briefing ? "Atualizar" : "Gerar"}
                </button>
              </div>
              {briefing && (
                <div className="space-y-1.5 text-[11px]">
                  {briefing.area && (
                    <div className="flex items-center gap-2">
                      <span className="text-[#8696a0] shrink-0 w-16">Área:</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium capitalize">{briefing.area}</span>
                    </div>
                  )}
                  {briefing.urgencia && (
                    <div className="flex items-center gap-2">
                      <span className="text-[#8696a0] shrink-0 w-16">Urgência:</span>
                      <span className={cn("px-1.5 py-0.5 rounded font-medium capitalize",
                        briefing.urgencia === "alta" ? "bg-red-100 text-red-700" :
                        briefing.urgencia === "media" ? "bg-amber-100 text-amber-700" :
                        "bg-green-100 text-green-700"
                      )}>{briefing.urgencia}</span>
                    </div>
                  )}
                  {briefing.resumo_caso && (
                    <p className="text-[#111b21] leading-snug">{briefing.resumo_caso}</p>
                  )}
                  {briefing.fatos_principais?.length > 0 && (
                    <div>
                      <p className="text-[#8696a0] mb-0.5">Fatos principais:</p>
                      <ul className="space-y-0.5">
                        {briefing.fatos_principais.map((f: string, i: number) => (
                          <li key={i} className="text-[#111b21] pl-2 border-l-2 border-[#25d366]/40">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {briefing.documentos_necessarios?.length > 0 && (
                    <div>
                      <p className="text-[#8696a0] mb-0.5">Documentos:</p>
                      <ul className="space-y-0.5">
                        {briefing.documentos_necessarios.map((d: string, i: number) => (
                          <li key={i} className="text-[#111b21] pl-2 border-l-2 border-blue-400/40">{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* F4: Viabilidade */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-[#8696a0] font-semibold uppercase tracking-wide">Viabilidade</p>
                <button onClick={handleEvalViability} disabled={juridicoLoading === "viability"}
                  className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50">
                  {juridicoLoading === "viability" ? "Avaliando..." : viability ? "Reavaliar" : "Avaliar"}
                </button>
              </div>
              {viability && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-[#f0f2f5]">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${viability.score}%`,
                        background: viability.score >= 70 ? "#25d366" : viability.score >= 40 ? "#f59e0b" : "#ef4444",
                      }} />
                    </div>
                    <span className="text-xs font-bold" style={{
                      color: viability.score >= 70 ? "#128C7E" : viability.score >= 40 ? "#d97706" : "#dc2626",
                    }}>{viability.score}%</span>
                  </div>
                  {viability.notes && (
                    <p className="text-[11px] text-[#667781] leading-snug">{viability.notes}</p>
                  )}
                </div>
              )}
            </div>

            {/* F6: Proposta de honorários */}
            <button onClick={() => setShowProposalModal(true)}
              className="w-full text-xs py-2 rounded-lg border border-[#e9edef] hover:bg-[#f0f2f5] text-[#111b21] font-medium transition-colors flex items-center justify-center gap-1.5">
              💰 Enviar Proposta de Honorários
            </button>
          </div>
        </div>
          </div>
        </details>

        {/* Modal: Consulta realizada */}
        {showAttendedModal && appointment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAttendedModal(false)}>
            <div className="bg-white rounded-xl shadow-xl p-5 w-80 mx-4" onClick={e => e.stopPropagation()}>
              <p className="font-semibold text-[#111b21] mb-1">Confirmar consulta realizada</p>
              <p className="text-sm text-[#667781] mb-4">Isso irá marcar a consulta como realizada e agendar follow-ups em D+1, D+3 e D+7.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowAttendedModal(false)}
                  className="flex-1 py-2 rounded-lg text-sm border border-[#e9edef] text-[#54656f] hover:bg-[#f0f2f5] transition-colors">
                  Cancelar
                </button>
                <button onClick={handleMarkAttended} disabled={juridicoLoading === "attended"}
                  className="flex-1 py-2 rounded-lg text-sm bg-[#25d366] text-white font-medium hover:bg-[#128C7E] transition-colors disabled:opacity-50">
                  {juridicoLoading === "attended" ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Proposta de honorários */}
        {showProposalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProposalModal(false)}>
            <div className="bg-white rounded-xl shadow-xl p-5 w-80 mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <p className="font-semibold text-[#111b21] mb-3">Proposta de Honorários</p>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-[#8696a0] mb-1">Tipo de cobrança</p>
                  <select value={proposal.paymentType}
                    onChange={e => setProposal(p => ({ ...p, paymentType: e.target.value as any }))}
                    className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef]">
                    <option value="fixo">Honorário fixo</option>
                    <option value="exito">Êxito (% sobre ganho)</option>
                    <option value="mensalidade">Mensalidade</option>
                    <option value="misto">Misto (fixo + êxito)</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-[#8696a0] mb-1">Valor (R$) *</p>
                  <input value={proposal.value}
                    onChange={e => setProposal(p => ({ ...p, value: e.target.value }))}
                    className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0]"
                    placeholder="Ex: 3500,00" inputMode="decimal" />
                </div>
                <div>
                  <p className="text-[10px] text-[#8696a0] mb-1">Escopo / serviços inclusos *</p>
                  <textarea value={proposal.scope}
                    onChange={e => setProposal(p => ({ ...p, scope: e.target.value }))}
                    rows={3}
                    className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0] resize-none"
                    placeholder="Ex: Ação trabalhista de rescisão indireta + FGTS + verbas rescisórias" />
                </div>
                <div>
                  <p className="text-[10px] text-[#8696a0] mb-1">Detalhes adicionais</p>
                  <textarea value={proposal.details}
                    onChange={e => setProposal(p => ({ ...p, details: e.target.value }))}
                    rows={2}
                    className="w-full bg-[#f0f2f5] text-[#111b21] text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#e9edef] placeholder-[#8696a0] resize-none"
                    placeholder="Prazo estimado, condições de pagamento, etc." />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowProposalModal(false)}
                  className="flex-1 py-2 rounded-lg text-xs border border-[#e9edef] text-[#54656f] hover:bg-[#f0f2f5] transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSendProposal} disabled={juridicoLoading === "proposal" || !proposal.value || !proposal.scope}
                  className="flex-1 py-2 rounded-lg text-xs bg-[#25d366] text-white font-medium hover:bg-[#128C7E] transition-colors disabled:opacity-50">
                  {juridicoLoading === "proposal" ? "Enviando..." : "Enviar via WhatsApp"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────
function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify, requestPermission } = useNotification();
  const recorder = useAudioRecorder();
  const [sendingAudio, setSendingAudio]   = useState(false);
  const [searchMsg, setSearchMsg]         = useState("");
  const [showSearchMsg, setShowSearchMsg] = useState(false);
  const [sortUnread, setSortUnread]       = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [historyConvs, setHistoryConvs]   = useState<any[]>([]);
  const [instances, setInstances]         = useState<any[]>([]);
  const [activeInstance, setActiveInstance] = useState<string | "all">("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [ticketFilter, setTicketFilter]   = useState<"all"|"pending"|"open"|"resolved">("all");
  const [queueFilter, setQueueFilter]     = useState<QueueFilter>("all");
  const [quickReplies, setQuickReplies]   = useState<QuickReply[]>([]);
  const [funnels, setFunnels]             = useState<FunnelOption[]>([]);
  const [tags, setTags]                   = useState<ConvTag[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickSearch, setQuickSearch]     = useState("");
  const [showTagMenu, setShowTagMenu]         = useState(false);
  const [showAtendMenu, setShowAtendMenu]     = useState(false);
  const [showMoreMenu, setShowMoreMenu]       = useState(false);
  const [businessHours, setBusinessHours] = useState<any>(null);
  const [healthOpen, setHealthOpen]       = useState(false);
  const [assignmentEvents, setAssignmentEvents] = useState<AssignmentEvent[]>([]);
  const [activeFunnelState, setActiveFunnelState] = useState<FunnelState | null>(null);
  const [metrics, setMetrics] = useState({
    avgFirstResponseMin: 0,
    unanswered: 0,
    hotLeads: 0,
    conversionRate: 0,
    funnelConversions: [] as Array<{ name: string; total: number; converted: number; rate: number }>,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [newConv, setNewConv] = useState({ phone: "", contact_name: "" });
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showLeadPanel, setShowLeadPanel] = useState(false);
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [savingFunnel, setSavingFunnel]   = useState(false);

  // IA — estados das ferramentas
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tone, setTone] = useState<"formal" | "casual" | "amigavel" | "persuasivo">("amigavel");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiTasks, setAiTasks] = useState<Array<{ tarefa: string; responsavel: string; prazo: string }>>([]);
  const [aiSentiment, setAiSentiment] = useState<{ sentiment: string; urgency: string; reason: string } | null>(null);
  const [aiSearchQ, setAiSearchQ] = useState("");
  const [aiSearchResults, setAiSearchResults] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const activeIdRef    = useRef<string | null>(null);

  const qualifierReplyFn      = useAuthServerFn(qualifierReply);
  const extractQualificationFn = useAuthServerFn(extractQualification);
  const generateProposalFn    = useAuthServerFn(generateProposal);
  const suggestRepliesFn      = useAuthServerFn(suggestReplies);
  const rewriteMessageFn      = useAuthServerFn(rewriteMessage);
  const summarizeFn           = useAuthServerFn(summarizeConversation);
  const extractTasksFn        = useAuthServerFn(extractTasks);
  const translateFn           = useAuthServerFn(translateText);
  const sentimentFn           = useAuthServerFn(analyzeSentiment);
  const searchFn              = useAuthServerFn(semanticSearch);
  const transcribeFn          = useAuthServerFn(transcribeAudioMessage);
  const generateTTSFn         = useAuthServerFn(generateTTS);
  const sendTextFn            = useAuthServerFn(sendWhatsappMessage);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [sendingFile, setSendingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsBlob, setTtsBlob] = useState<Blob | null>(null);
  const [ttsVoice, setTtsVoice] = useState("FGY2WhTYpPnrIDTdsKH5");

  const clearUnread = useCallback(async (conversationId: string) => {
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c));
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMediaToken(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setMediaToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Reset ao trocar de conversa
  useEffect(() => {
    activeIdRef.current = activeId;
    setMessages([]);
    setSuggestions([]); setAiSummary(null); setAiTasks([]); setAiSentiment(null);
    setAiSearchQ(""); setAiSearchResults([]);
    setAssignmentEvents([]);
    setActiveFunnelState(null);
    setShowAtendMenu(false); setShowMoreMenu(false); setShowTagMenu(false);
  }, [activeId]);

  // Helpers de IA
  const runWith = async (key: string, fn: () => Promise<void>) => {
    setAiBusy(key);
    try { await fn(); }
    catch (e: any) { toast.error(e.message ?? "Erro na IA"); }
    finally { setAiBusy(null); }
  };

  const doSuggest = (newTone?: typeof tone) => activeId && runWith("suggest", async () => {
    const t = newTone ?? tone;
    if (newTone) setTone(newTone);
    const r = await suggestRepliesFn({ data: { conversationId: activeId, tone: t } });
    setSuggestions(r.suggestions);
  });

  const doRewrite = (style: "curta" | "clara" | "profissional" | "persuasiva") => runWith("rewrite", async () => {
    if (!text.trim()) { toast.error("Digite algo para reescrever"); return; }
    const r = await rewriteMessageFn({ data: { text: text.trim(), style } });
    setText(r.rewritten);
    toast.success("Texto reescrito");
  });

  const doTranslate = () => runWith("translate", async () => {
    if (!text.trim()) { toast.error("Digite algo para traduzir"); return; }
    const r = await translateFn({ data: { text: text.trim(), targetLang: "Português (Brasil)" } });
    setText(r.translated);
    toast.success("Traduzido");
  });

  const doSummary = () => activeId && runWith("summary", async () => {
    const r = await summarizeFn({ data: { conversationId: activeId } });
    setAiSummary(r.summary);
  });

  const doTasks = () => activeId && runWith("tasks", async () => {
    const r = await extractTasksFn({ data: { conversationId: activeId } });
    setAiTasks(r.tasks);
    if (r.tasks.length === 0) toast.info("Nenhuma tarefa identificada");
  });

  const doSentiment = () => activeId && runWith("sentiment", async () => {
    const r = await sentimentFn({ data: { conversationId: activeId } });
    setAiSentiment(r);
  });

  const doSearch = () => activeId && aiSearchQ.trim() && runWith("search", async () => {
    const r = await searchFn({ data: { conversationId: activeId, query: aiSearchQ.trim() } });
    setAiSearchResults(r.matches);
    if (r.matches.length === 0) toast.info("Nada encontrado");
  });

  const loadInstances = useCallback(async () => {
    const { data } = await supabase.from("whatsapp_instances").select("*").order("instance_name");
    setInstances(data ?? []);
  }, []);

  const loadQuickReplies = useCallback(async () => {
    const { data } = await supabase.from("quick_replies").select("*").order("shortcut");
    setQuickReplies(data ?? []);
  }, []);

  const loadFunnels = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("funnels")
      .select("id, name, is_active, persona_prompt")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at");
    setFunnels((data ?? []) as FunnelOption[]);
  }, [user]);

  const loadTags = useCallback(async () => {
    const { data } = await supabase.from("conversation_tags").select("*").order("name");
    setTags(data ?? []);
  }, []);

  const loadBusinessHours = useCallback(async () => {
    const { data } = await supabase.from("business_hours").select("*").maybeSingle();
    setBusinessHours(data);
  }, []);

  const loadAssignmentEvents = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from("conversation_assignment_events" as any)
      .select("id, event_type, note, assigned_to, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8);
    setAssignmentEvents(((data ?? []) as unknown) as AssignmentEvent[]);
  }, []);

  const logAssignmentEvent = async (conversationId: string, eventType: string, note?: string | null, assignedTo?: string | null) => {
    if (!user) return;
    await supabase.from("conversation_assignment_events" as any).insert({
      user_id: user.id,
      conversation_id: conversationId,
      actor_id: user.id,
      assigned_to: assignedTo ?? null,
      event_type: eventType,
      note: note ?? null,
    });
    if (activeId === conversationId) loadAssignmentEvents(conversationId);
  };

  const refreshActiveFunnelState = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from("funnel_states")
      .select("id, funnel_id, fase, dados, midias_enviadas, funnels(name, manual_playbook)")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    setActiveFunnelState(data as any);
  }, []);

  const refreshMetrics = useCallback(async (items: Conversation[]) => {
    if (!user) return;
    const openItems = items.filter(c => (c.ticket_status ?? "pending") !== "resolved");
    const hotLeads = items.filter(c => c.priority_flag === "alta" || c.needs_human).length;
    const resolved = items.filter(c => (c.ticket_status ?? "pending") === "resolved").length;
    const withFirstResponse = items.filter(c => c.first_response_at && (c as any).created_at);
    const avgFirstResponseMin = withFirstResponse.length
      ? Math.round(withFirstResponse.reduce((sum, c) =>
          sum + Math.max(0, new Date(c.first_response_at!).getTime() - new Date((c as any).created_at).getTime()) / 60000, 0) / withFirstResponse.length)
      : 0;

    const recentIds = openItems.map(c => c.id).slice(0, 100);
    let unanswered = 0;
    if (recentIds.length > 0) {
      const { data: msgs } = await supabase.from("messages")
        .select("conversation_id, direction, created_at")
        .in("conversation_id", recentIds)
        .order("created_at", { ascending: false });
      const seen = new Set<string>();
      for (const msg of msgs ?? []) {
        if (seen.has(msg.conversation_id)) continue;
        seen.add(msg.conversation_id);
        if (msg.direction === "inbound") unanswered++;
      }
    }

    const { data: funnelStates } = await supabase.from("funnel_states")
      .select("fase, funnel_id, funnels(name)")
      .eq("user_id", user.id);
    const funnelMap = new Map<string, { name: string; total: number; converted: number }>();
    for (const state of funnelStates ?? []) {
      const key = state.funnel_id || "sem_funil";
      const name = (state.funnels as any)?.name || "Sem funil";
      const entry = funnelMap.get(key) ?? { name, total: 0, converted: 0 };
      entry.total++;
      if (state.fase === "encerrado") entry.converted++;
      funnelMap.set(key, entry);
    }
    const funnelConversions = [...funnelMap.values()]
      .map(f => ({ ...f, rate: f.total ? Math.round((f.converted / f.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);

    setMetrics({
      avgFirstResponseMin,
      unanswered,
      hotLeads,
      conversionRate: items.length ? Math.round((resolved / items.length) * 100) : 0,
      funnelConversions,
    });
  }, [user]);

  const loadConvs = useCallback(async () => {
    let q = supabase.from("conversations").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (activeInstance !== "all") q = q.eq("instance_id", activeInstance);
    const { data } = await q;
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    refreshMetrics(rows);
  }, [activeInstance, refreshMetrics]);

  // Filtrar conversas por status de ticket
  const filteredConvs = conversations.filter(c => {
    const ticketOk = ticketFilter === "all" || (c.ticket_status ?? "pending") === ticketFilter;
    const queueOk = queueFilter === "all"
      || (queueFilter === "sla" ? (hoursUntil(calcSlaDue(c)) ?? 1) <= 0 : queueKind(c) === queueFilter);
    return ticketOk && queueOk;
  });

  useEffect(() => {
    requestPermission();
  }, []); // eslint-disable-line

  useEffect(() => {
    loadInstances();
    loadQuickReplies();
    loadFunnels();
    loadTags();
    loadBusinessHours();
  }, [loadInstances, loadQuickReplies, loadFunnels, loadTags, loadBusinessHours]);
  useEffect(() => { loadConvs(); setActiveId(null); }, [loadConvs]);

  // Realtime instâncias WhatsApp (status conectado/desconectado)
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`user:${user.id}:instances-rt`, { config: { private: true } })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_instances" }, loadInstances)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadInstances, user?.id]);

  // Realtime conversas
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`user:${user.id}:convs-rt`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (payload) => {
        loadConvs();
        const conv = payload.new as any;
        if (conv?.phone) {
          notify(
            "Novo lead! 🆕",
            `${conv.contact_name || conv.phone} iniciou uma conversa`,
            () => setActiveId(conv.id)
          );
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, loadConvs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadConvs, notify, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`user:${user.id}:inbox-notifications`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, async (payload: any) => {
        const msg = payload.new as any;
        if (msg.direction !== "inbound" || msg.conversation_id === activeIdRef.current) return;
        if (!msg.conversation_id) return;

        const { data: conv } = await supabase
          .from("conversations")
          .select("id, phone, contact_name")
          .eq("id", msg.conversation_id)
          .maybeSingle();

        notify(
          conv?.contact_name || conv?.phone || "Nova mensagem",
          msg.content || "Mensagem recebida",
          () => {
            setActiveId(msg.conversation_id);
            clearUnread(msg.conversation_id);
          }
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clearUnread, notify, user?.id]);

  // Carregar mensagens + realtime quando troca de conversa
  useEffect(() => {
    if (!activeId) return;
    loadAssignmentEvents(activeId);
    refreshActiveFunnelState(activeId);
    supabase.from("messages").select("*")
      .eq("conversation_id", activeId).order("created_at")
      .then(({ data }) => {
        setMessages((data ?? []) as Message[]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      });
    clearUnread(activeId);

    const ch = supabase.channel(`conversation:${activeId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages",
          filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          clearUnread(activeId);
          loadConvs(); // Atualiza preview na lista
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages",
          filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === (payload.new as Message).id ? payload.new as Message : m));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, clearUnread, loadAssignmentEvents, loadConvs, refreshActiveFunnelState]);

  const handleNewConv = async () => {
    if (!user || !newConv.phone) return;
    const phone = normalizeBRPhone(newConv.phone) || newConv.phone.replace(/\D/g, "");
    // Verifica se já existe (em qualquer formato)
    const selectedInstanceId = activeInstance !== "all" ? activeInstance : null;
    const variants = phoneVariants(phone);
    let existingQuery = supabase.from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .in("phone", variants.length ? variants : [phone]);
    if (selectedInstanceId) existingQuery = existingQuery.eq("instance_id", selectedInstanceId);
    const { data: existing } = await existingQuery.limit(1).maybeSingle();
    if (existing) {
      setOpen(false); setNewConv({ phone: "", contact_name: "" });
      setActiveId(existing.id); setShowLeadPanel(false);
      toast.info("Conversa já existente aberta");
      return;
    }
    const { data, error } = await supabase.from("conversations").insert({
      user_id: user.id, phone,
      contact_name: newConv.contact_name || null, status: "open",
      ...(selectedInstanceId ? { instance_id: selectedInstanceId } : {}),
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpen(false); setNewConv({ phone: "", contact_name: "" });
    loadConvs();
    if (data) { setActiveId(data.id); setShowLeadPanel(false); }
  };

  // Excluir conversa (e todas as mensagens)
  const deleteConversation = async (convId: string) => {
    if (!confirm("Excluir esta conversa e todas as mensagens? Esta ação não pode ser desfeita.")) return;
    await supabase.from("messages").delete().eq("conversation_id", convId);
    const { error } = await supabase.from("conversations").delete().eq("id", convId);
    if (error) { toast.error(error.message); return; }
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeId === convId) setActiveId(null);
    toast.success("Conversa excluída");
  };

  // Aceitar ticket (assume o atendimento)
  const acceptTicket = async (convId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("conversations").update({
      ticket_status: "open",
      accepted_at:   now,
      assigned_to:   user?.id ?? null,
    }).eq("id", convId);
    if (error) { toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`); return; }
    await logAssignmentEvent(convId, "resolved", "Atendimento encerrado", user?.id ?? null);
    await logAssignmentEvent(convId, "assigned", "Atendimento assumido", user?.id ?? null);
    // Atualizar estado local imediatamente
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, ticket_status: "open" as const, accepted_at: now, assigned_to: user?.id ?? null } : c
    ));
    if (activeId === convId && !aiSummary) doSummary();
    toast.success("Atendimento aceito!");
  };

  // Resolver ticket
  const resolveTicket = async (convId: string) => {
    const { error } = await supabase.from("conversations").update({
      ticket_status: "resolved",
      resolved_at:   new Date().toISOString(),
    }).eq("id", convId);
    if (error) { toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`); return; }
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, ticket_status: "resolved" as const } : c
    ));
    setActiveId(null);
    toast.success("Ticket encerrado!");
  };

  // Reabrir ticket
  const reopenTicket = async (convId: string) => {
    const { error } = await supabase.from("conversations").update({
      ticket_status: "open",
      resolved_at:   null,
    }).eq("id", convId);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    await logAssignmentEvent(convId, "reopened", "Atendimento reaberto", user?.id ?? null);
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, ticket_status: "open" as const } : c
    ));
  };

  // Adicionar/remover tag
  const toggleTag = async (convId: string, tagName: string, currentTags: string[]) => {
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];
    await supabase.from("conversations").update({ tags: newTags }).eq("id", convId);
    loadConvs();
  };

  // Inserir resposta rápida no texto
  const insertQuickReply = (message: string) => {
    setText(message);
    setShowQuickReplies(false);
    setQuickSearch("");
    if (textareaRef.current) textareaRef.current.focus();
  };

  const applyAssistedFunnel = async (funnelId: string) => {
    if (!active || !user || !funnelId) return;
    setSavingFunnel(true);
    try {
      const payload = {
        user_id: user.id,
        conversation_id: active.id,
        funnel_id: funnelId,
        fase: activeFunnelState?.fase || "abertura",
        dados: activeFunnelState?.dados || {},
        midias_enviadas: activeFunnelState?.midias_enviadas || [],
        updated_at: new Date().toISOString(),
      };

      const { error } = activeFunnelState?.id
        ? await supabase.from("funnel_states").update(payload).eq("id", activeFunnelState.id)
        : await supabase.from("funnel_states").insert({ ...payload, historico: [] });
      if (error) throw error;

      const conversationPatch: Record<string, any> = {
        ai_paused: true,
        ai_pause_reason: "Funil assistido por atendimento humano",
        needs_human: true,
        ticket_status: (active.ticket_status ?? "pending") === "pending" ? "open" : active.ticket_status,
        assigned_to: user.id,
      };
      if (!active.assigned_to) conversationPatch.accepted_at = new Date().toISOString();
      await supabase.from("conversations").update(conversationPatch as any).eq("id", active.id);
      await logAssignmentEvent(active.id, "funnel_assisted", "Funil assistido aplicado", user.id);
      await refreshActiveFunnelState(active.id);
      await loadConvs();
      toast.success("Funil aplicado ao atendimento");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao aplicar funil");
    } finally {
      setSavingFunnel(false);
    }
  };

  const changeFunnelPhase = async (fase: string) => {
    if (!active || !activeFunnelState?.id) return;
    setSavingFunnel(true);
    try {
      const { error } = await supabase.from("funnel_states")
        .update({ fase, updated_at: new Date().toISOString() })
        .eq("id", activeFunnelState.id);
      if (error) throw error;
      await refreshActiveFunnelState(active.id);
      await logAssignmentEvent(active.id, "funnel_phase", `Etapa alterada para ${FASE_LABELS[fase] || fase}`, user?.id ?? null);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao mudar etapa");
    } finally {
      setSavingFunnel(false);
    }
  };

  const uploadAndSendAudio = async (blob: Blob) => {
    if (!activeId || !user) return;
    const mime = blob.type || "audio/webm";
    const ext  = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : "webm";
    const fileName = `${user.id}/audio/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("whatsapp-media")
      .upload(fileName, blob, { contentType: mime, upsert: true });
    if (upErr) throw new Error(`Upload: ${upErr.message}`);

    const audioUrl = await createWhatsappMediaSignedUrl(fileName);

    await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content: "[Áudio]",
      media_type: "audio", media_url: storageUri(fileName), status: "sent",
    });
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: "🎤 Áudio",
    }).eq("id", activeId);

    const { data: conv } = await supabase.from("conversations")
      .select("phone, instance_id").eq("id", activeId).single();
    let inst: any = null;
    if (conv?.instance_id) {
      const { data } = await supabase.from("whatsapp_instances")
        .select("*").eq("id", conv.instance_id).maybeSingle();
      inst = data;
    }
    if (!inst?.api_url) {
      const { data } = await supabase.from("whatsapp_instances").select("*")
        .eq("user_id", user.id).eq("status", "connected").eq("is_office", false).limit(1).maybeSingle();
      inst = data;
    }
    if (conv?.phone && inst?.api_url) {
      fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendWhatsAppAudio/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({ number: conv.phone.replace(/\D/g, ""), audio: audioUrl }),
      }).catch(console.error);
    }
  };

  const sendRecordedAudio = async () => {
    if (!recorder.audioBlob) return;
    setSendingAudio(true);
    try {
      await uploadAndSendAudio(recorder.audioBlob);
      recorder.reset();
      toast.success("Áudio enviado!");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSendingAudio(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return;
    setTtsBusy(true);
    try {
      const r = await generateTTSFn({ data: { text: ttsText.trim(), voiceId: ttsVoice } } as any);
      const bin = atob(r.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      setTtsBlob(new Blob([bytes], { type: r.mime }));
    } catch (e: any) { toast.error(e.message); }
    finally { setTtsBusy(false); }
  };

  const sendTTSAudio = async () => {
    if (!ttsBlob) return;
    setTtsBusy(true);
    try {
      await uploadAndSendAudio(ttsBlob);
      toast.success("Áudio enviado!");
      setTtsBlob(null); setTtsText(""); setTtsOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setTtsBusy(false); }
  };


  // Bloquear/desbloquear contato
  const toggleBlock = async (conv: Conversation) => {
    const newBlocked = !conv.blocked;
    await supabase.from("conversations").update({ blocked: newBlocked }).eq("id", conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, blocked: newBlocked } : c));
    toast.success(newBlocked ? "Contato bloqueado" : "Contato desbloqueado");
  };

  // Marcar como não lido manualmente
  const markUnread = async (convId: string) => {
    await supabase.from("conversations").update({ unread_count: 1 }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 1 } : c));
    setActiveId(null);
    toast.success("Marcado como não lido");
  };

  // Carregar histórico de conversas do contato
  const loadHistory = async (phone: string) => {
    const { data } = await supabase.from("conversations")
      .select("id, contact_name, last_message_at, last_message_preview, ticket_status")
      .eq("phone", phone).order("last_message_at", { ascending: false });
    setHistoryConvs(data ?? []);
    setShowHistory(true);
  };

  // Exportar conversa como texto
  const exportConversation = async (conv: Conversation) => {
    const { data: msgs } = await supabase.from("messages")
      .select("direction, content, created_at, media_type")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    const lines = [
      `Conversa com: ${conv.contact_name || conv.phone}`,
      `Exportado em: ${new Date().toLocaleString("pt-BR")}`,
      "─".repeat(50),
      "",
      ...(msgs ?? []).map(m => {
        const time = new Date(m.created_at).toLocaleString("pt-BR");
        const dir  = m.direction === "outbound" ? "Você" : conv.contact_name || conv.phone;
        const txt  = m.media_type ? `[${m.media_type}]` : (m.content || "");
        return `[${time}] ${dir}: ${txt}`;
      }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `conversa_${conv.phone}_${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Conversa exportada!");
  };

  const handleSend = async () => {
    if (!user || !activeId || !text.trim()) return;
    const content = text.trim();
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "40px";
    // Verificar se marcou ticket como aceito ao enviar manualmente
    const conv = conversations.find(c => c.id === activeId);
    if (conv && (conv.ticket_status ?? "pending") === "pending") {
      const now = new Date().toISOString();
      await supabase.from("conversations").update({
        ticket_status: "open",
        accepted_at: now,
        assigned_to: user?.id ?? null,
        first_response_at: conv.first_response_at ?? now,
      }).eq("id", activeId ?? "");
      await logAssignmentEvent(activeId, "assigned", "Atendimento assumido ao responder", user?.id ?? null);
    }

    // Salvar no banco como pendente para refletir falha/envio real.
    const { data: insertedMsg, error: insertErr } = await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content, status: "pending",
    }).select("id").single();
    if (insertErr) {
      toast.error("Erro ao salvar mensagem: " + insertErr.message);
      setText(content);
      return;
    }
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 80),
      ...(conv?.first_response_at ? {} : { first_response_at: new Date().toISOString() }),
    }).eq("id", activeId);

    // Enviar via Evolution API — usar a instância vinculada à conversa
    const { data: convRow } = await supabase.from("conversations")
      .select("phone, instance_id").eq("id", activeId).single();

    let inst: any = null;
    if (convRow?.instance_id) {
      const { data } = await supabase.from("whatsapp_instances")
        .select("id, status, is_office").eq("id", convRow.instance_id).maybeSingle();
      inst = data;
    }
    if (!inst) {
      const { data } = await supabase.from("whatsapp_instances").select("id, status, is_office")
        .eq("user_id", user.id).eq("status", "connected").eq("is_office", false).limit(1).maybeSingle();
      inst = data ?? null;
      if (!inst) {
        // fallback: qualquer instância conectada
        const { data: d2 } = await supabase.from("whatsapp_instances").select("id, status, is_office")
          .eq("user_id", user.id).eq("status", "connected").limit(1).maybeSingle();
        inst = d2;
      }
    }

    try {
      const phone = convRow?.phone || conv?.phone || "";
      if (!phone || !inst?.id) throw new Error("Nenhuma instância WhatsApp conectada");
      const sent = await sendTextFn({ data: { instanceId: inst.id, phone, text: content } });
      await supabase.from("messages").update({
        status: "sent",
        external_id: sent?.messageId ?? null,
      }).eq("id", insertedMsg.id);
    } catch (e: any) {
      await supabase.from("messages").update({
        status: "failed",
        last_error: e?.message ?? "Falha ao enviar pelo WhatsApp",
      }).eq("id", insertedMsg.id);
      toast.error("Mensagem não enviada: " + (e?.message ?? "falha desconhecida"));
    }
  };

  const retryMessage = async (message: Message) => {
    if (!active || !user || !message.content?.trim()) return;
    try {
      await supabase.from("messages").update({ status: "pending", last_error: null }).eq("id", message.id);
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: "pending", last_error: null } : m));

      const { data: convRow } = await supabase.from("conversations")
        .select("phone, instance_id").eq("id", active.id).single();
      let inst: any = null;
      if (convRow?.instance_id) {
        const { data } = await supabase.from("whatsapp_instances")
          .select("id, status, is_office").eq("id", convRow.instance_id).maybeSingle();
        inst = data;
      }
      if (!inst) {
        const { data } = await supabase.from("whatsapp_instances").select("id, status, is_office")
          .eq("user_id", user.id).eq("status", "connected").eq("is_office", false).limit(1).maybeSingle();
        inst = data ?? null;
      }
      if (!inst?.id) throw new Error("Nenhuma instância WhatsApp conectada");

      const sent = await sendTextFn({ data: { instanceId: inst.id, phone: convRow?.phone || active.phone, text: message.content } });
      await supabase.from("messages").update({
        status: "sent",
        external_id: sent?.messageId ?? null,
        last_error: null,
      }).eq("id", message.id);
      toast.success("Mensagem reenviada");
    } catch (e: any) {
      await supabase.from("messages").update({
        status: "failed",
        last_error: e?.message ?? "Falha ao reenviar",
      }).eq("id", message.id);
      toast.error("Reenvio falhou: " + (e?.message ?? "erro desconhecido"));
    }
  };

  const handleSendFile = async (file: File) => {
    if (!active || !user || sendingFile) return;
    setSendingFile(true);
    try {
      // Upload para Supabase Storage
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from("whatsapp-media").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const mediaUrl = await createWhatsappMediaSignedUrl(path);

      // Buscar instância
      const { data: convRow } = await supabase.from("conversations")
        .select("instance_id, phone").eq("id", active.id).maybeSingle();
      let inst: any = null;
      if (convRow?.instance_id) {
        const { data } = await supabase.from("whatsapp_instances").select("*").eq("id", convRow.instance_id).maybeSingle();
        inst = data;
      }
      if (!inst) {
        const { data } = await supabase.from("whatsapp_instances").select("*").eq("user_id", user.id).eq("status", "connected").limit(1).maybeSingle();
        inst = data;
      }
      if (!inst?.api_url) throw new Error("Nenhuma instância WhatsApp conectada");

      const number = (convRow?.phone || active.phone || "").replace(/\D/g, "");
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      const isPdf   = file.type === "application/pdf";

      // Enviar via Evolution API — áudio como nota de voz, resto como media
      let mediaRes: Response | null = null;
      if (isAudio) {
        mediaRes = await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendWhatsAppAudio/${inst.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: inst.api_key },
          body: JSON.stringify({ number, audio: mediaUrl, options: { delay: 500 } }),
        }).catch(() => null);
      } else {
        const mediaType = isImage ? "image" : isVideo ? "video" : "document";
        const body = { number, mediatype: mediaType, media: mediaUrl, fileName: file.name, caption: "", options: { delay: 500 } };
        mediaRes = await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendMedia/${inst.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: inst.api_key },
          body: JSON.stringify(body),
        }).catch(() => null);
      }
      if (!mediaRes?.ok) {
        console.warn("Envio de mídia falhou:", mediaRes?.status);
      }

      // Salvar mensagem no banco com campos corretos
      const mediaLabel = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "document";
      const { data: newMsg } = await supabase.from("messages").insert({
        user_id: user!.id,
        conversation_id: active.id,
        content: file.name,
        direction: "outbound",
        media_url: storageUri(path),
        media_type: mediaLabel,
        media_mime: file.type,
        status: "sent",
      }).select().single();

      // Adicionar imediatamente na conversa sem esperar realtime
      if (newMsg) {
        setMessages(prev => [...prev, newMsg as Message]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }

      toast.success(`${isImage ? "Imagem" : isVideo ? "Vídeo" : isAudio ? "Áudio" : "Documento"} enviado!`);
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    } finally {
      setSendingFile(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") { setShowQuickReplies(false); }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "40px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const toggleAiPause = async (conv: Conversation) => {
    const pausing = !conv.ai_paused;
    const reason = pausing
      ? window.prompt("Motivo da pausa da IA", conv.ai_pause_reason || "Atendimento humano assumido")
      : null;
    if (pausing && reason === null) return;
    await supabase.from("conversations").update({
      ai_paused: pausing,
      ai_pause_reason: pausing ? reason : null,
      ...(pausing ? { needs_human: true } : { needs_human: false }),
    }).eq("id", conv.id);
    await logAssignmentEvent(conv.id, pausing ? "ai_paused" : "ai_resumed", pausing ? reason : "IA retomada", user?.id ?? null);
    loadConvs();
    toast.success(conv.ai_paused ? "IA respondendo de novo" : "Você está respondendo");
  };

  const active  = conversations.find(c => c.id === activeId);
  // Ordenar: não lidas primeiro se sortUnread ativo
  const sortedConvs = sortUnread
    ? [...filteredConvs].sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0))
    : filteredConvs;

  const filtered = sortedConvs.filter(c =>
    (c.contact_name || c.phone).toLowerCase().includes(search.toLowerCase())
  );
  const displayMessages = searchMsg.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchMsg.toLowerCase()))
    : messages;
  const grouped = groupByDate(displayMessages);
  const activeManualPlaybook = getManualPlaybook(activeFunnelState?.funnels as any);
  const activeManualStep = getManualStep(activeManualPlaybook, activeFunnelState?.fase);
  const activeManualQuestions = activeManualStep.questions.length
    ? activeManualStep.questions
    : manualQuestionsForPhase(activeFunnelState?.fase);
  return (
    <div className="inbox-whatsapp relative flex h-full w-full flex-1 overflow-hidden" style={{ background: "#f0f2f5" }}>
      <Toaster />

      {/* ── SIDEBAR ── */}
      <div className="w-[clamp(340px,28vw,410px)] flex flex-col border-r border-[#e9edef] shrink-0" style={{ background: "#f0f2f5" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: "#f0f2f5" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#00a884]">
              {user?.email?.[0]?.toUpperCase() ?? "M"}
            </div>
            <span className="text-[#111b21] font-medium text-sm">Lex CRM</span>
          </div>
          <div className="flex items-center gap-1">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="p-2 rounded-full hover:bg-[#d9dde1] text-[#54656f]"><Plus className="h-5 w-5" /></button>
              </DialogTrigger>
              <DialogContent className="bg-white border-[#e9edef]">
                <DialogHeader><DialogTitle className="text-[#111b21]">Nova conversa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Telefone *</label>
                    <input className="w-full bg-[#f0f2f5] border border-[#e9edef] rounded-lg px-3 py-2 text-[#111b21] text-sm outline-none focus:border-[#00a884]"
                      placeholder="+5551..." value={newConv.phone} onChange={e => setNewConv({ ...newConv, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Nome do contato</label>
                    <input className="w-full bg-[#f0f2f5] border border-[#e9edef] rounded-lg px-3 py-2 text-[#111b21] text-sm outline-none focus:border-[#00a884]"
                      value={newConv.contact_name} onChange={e => setNewConv({ ...newConv, contact_name: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <button onClick={handleNewConv} className="bg-[#00a884] hover:bg-[#017d63] text-white px-4 py-2 rounded-lg text-sm font-medium">Criar</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <button className="p-2 rounded-full hover:bg-[#d9dde1] text-[#54656f]"><MoreVertical className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Seletor de número/instância */}
        {instances.length > 0 && (
          <div className="border-b border-[#e9edef] bg-white px-3 py-2 shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-[#8696a0] font-semibold mb-1.5">Número WhatsApp</p>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <button
                onClick={() => setActiveInstance("all")}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                  activeInstance === "all"
                    ? "bg-[#00a884] border-[#00a884] text-white"
                    : "bg-[#f7f8fa] border-[#e9edef] text-[#54656f] hover:bg-[#f0f2f5]"
                )}>
                <span>Todos</span>
                <span className={cn("text-[10px] font-bold px-1.5 rounded-full", activeInstance === "all" ? "bg-white/20 text-white" : "bg-[#e9edef] text-[#54656f]")}>
                  {conversations.length}
                </span>
              </button>
              {instances.map(inst => {
                const count = conversations.filter(c => (c as any).instance_id === inst.id).length;
                const isActive = activeInstance === inst.id;
                const connected = inst.status === "connected";
                return (
                  <button key={inst.id}
                    onClick={() => setActiveInstance(inst.id)}
                    className={cn(
                      "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                      isActive
                        ? "bg-[#e8faf4] border-[#00a884] text-[#007a60]"
                        : "bg-[#f7f8fa] border-[#e9edef] text-[#54656f] hover:bg-[#f0f2f5]"
                    )}>
                    <div className={cn("h-2 w-2 rounded-full shrink-0", connected ? "bg-[#25d366]" : "bg-red-400")} />
                    <span className="truncate max-w-[90px] font-mono">
                      {inst.phone_number || inst.instance_name}
                    </span>
                    <span className={cn("text-[10px] font-bold px-1.5 rounded-full shrink-0", isActive ? "bg-[#00a884] text-white" : "bg-[#e9edef] text-[#54656f]")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtros unificados */}
        <div className="border-b border-[#e9edef] bg-white shrink-0">
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-2">
            {([
              { label: "Todos",        ticketF: "all",      queueF: "all",      count: conversations.length },
              { label: "Aguardando",   ticketF: "pending",  queueF: "all",      count: conversations.filter(c => (c.ticket_status ?? "pending") === "pending").length },
              { label: "Você",         ticketF: "all",      queueF: "humano",   count: conversations.filter(c => queueKind(c) === "humano").length },
              { label: "Urgente",      ticketF: "all",      queueF: "urgente",  count: conversations.filter(c => queueKind(c) === "urgente").length },
              { label: "Atrasado",     ticketF: "all",      queueF: "sla",      count: conversations.filter(c => (hoursUntil(calcSlaDue(c)) ?? 1) <= 0).length },
              { label: "Retorno",      ticketF: "all",      queueF: "followup", count: conversations.filter(c => queueKind(c) === "followup").length },
              { label: "Em andamento", ticketF: "open",     queueF: "all",      count: conversations.filter(c => (c.ticket_status ?? "pending") === "open").length },
              { label: "Finalizadas",  ticketF: "resolved", queueF: "all",      count: conversations.filter(c => (c.ticket_status ?? "pending") === "resolved").length },
            ] as const).map(item => {
              const isActive = ticketFilter === item.ticketF && queueFilter === item.queueF;
              return (
                <button key={item.label}
                  onClick={() => { setTicketFilter(item.ticketF as any); setQueueFilter(item.queueF as any); }}
                  className={cn("shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                    isActive
                      ? "border-[#00a884] bg-[#00a884]/10 text-[#007a60]"
                      : "border-[#e9edef] bg-[#f7f8fa] text-[#54656f] hover:bg-[#f0f2f5]")}>
                  {item.label}
                  {item.count > 0 && (
                    <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center",
                      isActive ? "bg-[#00a884] text-white" : "bg-[#e9edef] text-[#54656f]")}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end px-3 pb-1.5">
            <button onClick={() => setHealthOpen(!healthOpen)}
              className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors",
                healthOpen ? "bg-[#00a884]/10 text-[#007a60]" : "text-[#667781] hover:bg-[#f0f2f5]")}>
              <HeartPulse className="h-3 w-3" /> indicadores
            </button>
          </div>
          {healthOpen && (
            <div className="mx-3 mb-2 grid grid-cols-2 gap-1.5">
              <div className="rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                <p className="text-[9px] text-[#667781]">WhatsApp</p>
                <p className="text-xs font-semibold text-[#111b21]">{instances.filter(i => i.status === "connected").length}/{instances.length} conectado(s)</p>
              </div>
              <div className="rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                <p className="text-[9px] text-[#667781]">Sem resposta</p>
                <p className="text-xs font-semibold text-[#111b21]">{metrics.unanswered}</p>
              </div>
              <div className="rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                <p className="text-[9px] text-[#667781]">1ª resposta</p>
                <p className="text-xs font-semibold text-[#111b21]">{metrics.avgFirstResponseMin || "-"} min</p>
              </div>
              <div className="rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                <p className="text-[9px] text-[#667781]">Conversão</p>
                <p className="text-xs font-semibold text-[#111b21]">{metrics.conversionRate}%</p>
              </div>
              <div className="rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                <p className="text-[9px] text-[#667781]">Leads quentes</p>
                <p className="text-xs font-semibold text-[#111b21]">{metrics.hotLeads}</p>
              </div>
              {metrics.funnelConversions.length > 0 && (
                <div className="col-span-2 rounded-md bg-[#f7f8fa] border border-[#e9edef] px-2 py-1.5">
                  <p className="text-[9px] text-[#667781] mb-1">Conversão por funil</p>
                  <div className="space-y-1">
                    {metrics.funnelConversions.map(f => (
                      <div key={f.name} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate text-[#111b21]">{f.name}</span>
                        <span className="shrink-0 text-[#667781]">{f.converted}/{f.total} · {f.rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Busca + Ordenar */}
        <div className="px-3 py-2 flex gap-2" style={{ background: "#f0f2f5" }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1" style={{ background: "#ffffff" }}>
            <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
            <input className="flex-1 bg-transparent text-base text-[#111b21] placeholder-[#8696a0] outline-none"
              placeholder="Pesquisar conversas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setSortUnread(!sortUnread)}
            title="Ordenar por não lidas"
            className={cn("px-2 rounded-lg text-xs font-medium transition-colors", sortUnread ? "bg-[#00a884] text-white" : "text-[#54656f] hover:text-[#111b21]")}
            style={{ background: sortUnread ? "#00a884" : "#f0f2f5" }}>
            🔔
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-[#8696a0] text-sm bg-white">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />Nenhuma conversa
            </div>
          )}
          {filtered.map(c => {
            const av = avatar(c.contact_name, c.phone);
            const isActive = activeId === c.id;
            const dueLabel = slaLabel(c);
            const isOverdue = (hoursUntil(calcSlaDue(c)) ?? 1) <= 0;
            const statusLine = [
              c.needs_human      ? { label: "Humano",   color: "#dc2626", bg: "#fef2f2" } : null,
              c.follow_up_required && !c.needs_human
                                 ? { label: "Retorno",  color: "#d97706", bg: "#fffbeb" } : null,
              (c.ticket_status ?? "pending") === "pending" && !c.needs_human
                                 ? { label: "Aguardando", color: "#2563eb", bg: "#eff6ff" } : null,
              (c.ticket_status ?? "pending") === "resolved"
                                 ? { label: "Finalizado", color: "#6b7280", bg: "#f9fafb" } : null,
              dueLabel           ? { label: dueLabel,   color: isOverdue ? "#dc2626" : "#2563eb", bg: isOverdue ? "#fef2f2" : "#eff6ff" } : null,
            ].filter(Boolean) as Array<{ label: string; color: string; bg: string }>;

            return (
              <button key={c.id} onClick={() => { setActiveId(c.id); clearUnread(c.id); setShowLeadPanel(false); }}
                className={cn(
                  "w-full text-left border-b border-[#e9edef] transition-colors",
                  isActive ? "bg-[#e8faf4]" : "bg-white hover:bg-[#f7f8fa]"
                )}>
                <div className={cn(
                  "flex items-start gap-3 px-4 pt-3 pb-2",
                  (c.needs_human || isOverdue) && "border-l-[3px] border-red-500",
                  !c.needs_human && !isOverdue && c.ai_paused && "border-l-[3px] border-amber-400",
                  !c.needs_human && !isOverdue && !c.ai_paused && "border-l-[3px] border-transparent",
                )}>
                  {/* Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt={c.contact_name || c.phone}
                        className="h-10 w-10 rounded-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: av.color }}>
                        {av.label}
                      </div>
                    )}
                    {c.blocked && (
                      <div className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-[8px]">🚫</div>
                    )}
                    {c.ai_paused && !c.blocked && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center">
                        <User className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                    {!c.ai_paused && c.ai_handled && !c.blocked && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#25d366] border-2 border-white flex items-center justify-center">
                        <Bot className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    {/* Linha 1: nome + hora */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("font-semibold text-sm truncate", isActive ? "text-[#007a60]" : "text-[#111b21]",
                        c.unread_count > 0 && "text-[#111b21]")}>
                        {c.contact_name || c.phone}
                      </span>
                      <span className={cn("text-[11px] shrink-0", c.unread_count > 0 ? "text-[#00a884] font-semibold" : "text-[#8696a0]")}>
                        {c.last_message_at ? formatTime(c.last_message_at) : ""}
                      </span>
                    </div>

                    {/* Linha 2: preview + badge não lidas */}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[#667781] text-xs truncate flex-1 leading-relaxed">
                        {c.last_message_preview || "Sem mensagens"}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="shrink-0 h-4.5 min-w-[18px] px-1.5 rounded-full bg-[#00a884] text-white text-[10px] font-bold flex items-center justify-center">
                          {c.unread_count > 99 ? "99+" : c.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Linha 3: status + tags */}
                    {(statusLine.length > 0 || (c.tags?.length ?? 0) > 0) && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {statusLine.slice(0, 2).map(s => (
                          <span key={s.label}
                            className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: s.bg, color: s.color }}>
                            {s.label}
                          </span>
                        ))}
                        {c.tags?.slice(0, 2).map(tag => {
                          const t = tags.find(x => x.name === tag);
                          return (
                            <span key={tag} className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                              style={{ background: (t?.color ?? "#6366f1") + "20", color: t?.color ?? "#6366f1" }}>
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ÁREA DE CHAT ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#efeae2" }}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0]" style={{ background: "#f0f2f5" }}>
            <div className="h-24 w-24 rounded-full flex items-center justify-center mb-6" style={{ background: "rgba(0,168,132,0.1)", border: "2px solid rgba(0,168,132,0.2)" }}>
              <MessageSquare className="h-10 w-10" style={{ color: "#00a884" }} />
            </div>
            <h2 className="text-[#41525d] text-xl font-light mb-2">Lex CRM — WhatsApp</h2>
            <p className="text-sm text-center max-w-xs">Selecione uma conversa para começar o atendimento.</p>
          </div>
        ) : (
          <>
            {/* Header do chat */}
            <div className="flex items-center gap-3 px-5 py-3.5 shrink-0 border-b border-[#e9edef]" style={{ background: "#f0f2f5" }}>
              <div className="shrink-0">
                {active.photo_url ? (
                  <img src={active.photo_url} alt={active.contact_name || active.phone}
                    className="h-11 w-11 rounded-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: avatar(active.contact_name, active.phone).color }}>
                    {avatar(active.contact_name, active.phone).label}
                  </div>
                )}
              </div>
              <button className="flex-1 text-left" onClick={() => setShowLeadPanel(!showLeadPanel)}>
                <p className="text-[#111b21] font-semibold text-base">{active.contact_name || formatBRPhone(active.phone) || active.phone}</p>
                <p className="text-[#54656f] text-sm">
                  {formatBRPhone(active.phone) || active.phone}
                  {(active as any).instance_id && instances.find(i => i.id === (active as any).instance_id) && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#00a884]/20 text-[#00a884] text-[10px]">
                      📱 {instances.find(i => i.id === (active as any).instance_id)?.phone_number || instances.find(i => i.id === (active as any).instance_id)?.instance_name}
                    </span>
                  )}
                  {" · clique para ver ficha"}
                </p>
              </button>
              <div className="flex items-center gap-1 overflow-x-auto pl-2">
                <button
                  onClick={() => setShowLeadPanel(!showLeadPanel)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    showLeadPanel
                      ? "bg-[#d9fdd3] text-[#008069] border-[#b7e4ca]"
                      : "bg-white text-[#54656f] hover:bg-[#e9edef] border-[#e9edef]"
                  )}
                  title={showLeadPanel ? "Fechar ficha" : "Abrir ficha"}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Ficha
                </button>
                <div className="relative shrink-0">
                  <button
                    onClick={() => { setShowAtendMenu(!showAtendMenu); setShowMoreMenu(false); }}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      showAtendMenu ? "bg-[#e9edef] border-[#e9edef] text-[#111b21]" : "border-[#e9edef] bg-white text-[#54656f] hover:bg-[#e9edef]"
                    )}>
                    <UserCheck className="h-3.5 w-3.5" />
                    Atendimento
                  </button>
                  {showAtendMenu && (
                    <div className="absolute right-0 top-9 z-50 w-56 flex flex-col gap-0.5 rounded-xl border border-[#e9edef] bg-white p-2 shadow-xl">
                      <button
                        onClick={() => { toggleAiPause(active); setShowAtendMenu(false); }}
                        className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                          active.ai_paused ? "bg-red-500/10 text-red-600 hover:bg-red-500/20" : "bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20"
                        )}>
                        <Bot className="h-3.5 w-3.5 shrink-0" />
                        {active.ai_paused ? "Reativar IA" : "Pausar IA"}
                      </button>
                      {(active.ticket_status ?? "pending") === "pending" && (
                        <button onClick={() => { acceptTicket(active.id); setShowAtendMenu(false); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors text-left">
                          <CheckCheck className="h-3.5 w-3.5 shrink-0" /> Assumir atendimento
                        </button>
                      )}
                      {(active.ticket_status ?? "pending") !== "resolved" && (
                        <button onClick={() => { resolveTicket(active.id); setShowAtendMenu(false); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 transition-colors text-left">
                          <CheckCheck className="h-3.5 w-3.5 shrink-0" /> Finalizar
                        </button>
                      )}
                      {(active.ticket_status ?? "pending") === "resolved" && (
                        <button onClick={() => { reopenTicket(active.id); setShowAtendMenu(false); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors text-left">
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" /> Reabrir
                        </button>
                      )}
                      <div className="my-1 h-px bg-[#e9edef]" />
                      <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#8696a0]">Tags</p>
                      {tags.length === 0 && (
                        <p className="text-xs text-[#8696a0] px-3 pb-2">Sem tags. Crie em configurações.</p>
                      )}
                      {tags.map(tag => {
                        const hasTag = (active.tags ?? []).includes(tag.name);
                        return (
                          <button key={tag.id}
                            onClick={() => toggleTag(active.id, tag.name, active.tags ?? [])}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#f5f5f5] text-left transition-colors">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: tag.color }} />
                            <span className="text-xs text-[#111b21] flex-1">{tag.name}</span>
                            {hasTag && <span className="text-[#00a884] text-xs font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button onClick={() => setShowAiPanel(!showAiPanel)}
                  className={cn("p-2 rounded-full transition-colors", showAiPanel ? "bg-[#25d366] text-black" : "hover:bg-[#e9edef] text-[#54656f]")}>
                  <Sparkles className="h-5 w-5" />
                </button>
                <button onClick={() => setShowSearchMsg(!showSearchMsg)}
                  className={cn("p-2 rounded-full transition-colors", showSearchMsg ? "bg-[#d9fdd3] text-[#008069]" : "hover:bg-[#e9edef] text-[#54656f]")}>
                  <Search className="h-5 w-5" />
                </button>
                {/* Menu de contexto */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => { setShowMoreMenu(!showMoreMenu); setShowAtendMenu(false); }}
                    className={cn("p-2 rounded-full transition-colors", showMoreMenu ? "bg-[#e9edef] text-[#111b21]" : "hover:bg-[#d9dde1] text-[#54656f]")}>
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-[#e9edef] shadow-xl overflow-hidden bg-white">
                      {[
                        { label: "Ver histórico do contato", action: () => { loadHistory(active.phone); setShowMoreMenu(false); } },
                        { label: "Marcar como não lido",     action: () => { markUnread(active.id); setShowMoreMenu(false); } },
                        { label: "Exportar conversa",        action: () => { exportConversation(active); setShowMoreMenu(false); } },
                        { label: active.blocked ? "Desbloquear contato" : "Bloquear contato", action: () => { toggleBlock(active); setShowMoreMenu(false); }, danger: true },
                        { label: "Excluir conversa", action: () => { deleteConversation(active.id); setShowMoreMenu(false); }, danger: true },
                      ].map(item => (
                        <button key={item.label} onClick={item.action}
                          className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-[#f5f5f5] transition-colors", item.danger ? "text-red-500" : "text-[#111b21]")}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-1.5 border-b border-[#e9edef] bg-white flex items-center gap-2 text-xs overflow-x-auto">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#f0f2f5] px-2 py-1 text-[#54656f]">
                <UserCheck className="h-3 w-3" />
                {active.assigned_to ? "Assumido" : "Sem responsável"}
              </span>
              <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1",
                (hoursUntil(calcSlaDue(active)) ?? 1) <= 0 ? "bg-red-500/10 text-red-600" : "bg-blue-500/10 text-blue-600")}>
                <Clock className="h-3 w-3" /> {slaLabel(active) || "Sem prazo"}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#00a884]/10 px-2 py-1 text-[#007a60]">
                <ClipboardList className="h-3 w-3" /> {FASE_LABELS[activeFunnelState?.fase || ""] || "Sem funil"}
              </span>
              <button onClick={() => setShowContextDetails(!showContextDetails)}
                className="ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] text-[#667781] hover:bg-[#f0f2f5]">
                {showContextDetails ? "Ocultar detalhes" : "Detalhes"}
              </button>
            </div>

            {showContextDetails && (
            <div className="px-4 py-2 border-b border-[#e9edef] bg-white flex items-center gap-2 text-xs overflow-x-auto">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#f0f2f5] px-2 py-1 text-[#54656f]">
                <UserCheck className="h-3 w-3" />
                {active.assigned_to ? "Assumido" : "Sem responsável"}
              </span>
              <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1",
                (hoursUntil(calcSlaDue(active)) ?? 1) <= 0 ? "bg-red-500/10 text-red-600" : "bg-blue-500/10 text-blue-600")}>
                <Clock className="h-3 w-3" /> {slaLabel(active) || "Sem prazo"}
              </span>
              {active.ai_pause_reason && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> {active.ai_pause_reason}
                </span>
              )}
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#00a884]/10 px-2 py-1 text-[#007a60]">
                <ClipboardList className="h-3 w-3" /> Etapa: {FASE_LABELS[activeFunnelState?.fase || ""] || "Sem funil"}
              </span>
              {instances.find(i => i.id === active.instance_id)?.is_office && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-700">
                  <Phone className="h-3 w-3" /> Escritório
                </span>
              )}
              <select
                value={activeFunnelState?.funnel_id || ""}
                disabled={savingFunnel}
                onChange={e => e.target.value && applyAssistedFunnel(e.target.value)}
                className="shrink-0 h-7 max-w-[220px] rounded-full border border-[#e9edef] bg-white px-2 text-xs text-[#111b21] outline-none focus:border-[#00a884] disabled:opacity-50"
              >
                <option value="">Aplicar funil</option>
                {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {activeFunnelState?.id && (
                <select
                  value={activeFunnelState.fase}
                  disabled={savingFunnel}
                  onChange={e => changeFunnelPhase(e.target.value)}
                  className="shrink-0 h-7 rounded-full border border-[#e9edef] bg-white px-2 text-xs text-[#111b21] outline-none focus:border-[#00a884] disabled:opacity-50"
                >
                  {FASES.map(fase => <option key={fase} value={fase}>{FASE_LABELS[fase]}</option>)}
                </select>
              )}
              {assignmentEvents[0] && (
                <span className="shrink-0 text-[#667781]">
                  Último registro: {assignmentEvents[0].event_type} · {new Date(assignmentEvents[0].created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            )}
            {/* Painel de ferramentas IA — expandido */}
            {showAiPanel && (
              <div className="border-b border-[#e9edef] max-h-[50vh] overflow-y-auto bg-white">
                {/* Linha 1: ações rápidas */}
                <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b border-[#e9edef]">
                  <span className="text-[#8696a0] text-xs font-medium mr-1">Ajuda da IA:</span>
                  <button disabled={aiBusy !== null} onClick={() => doSummary()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0f2f5] text-[#111b21] hover:bg-[#e9edef] disabled:opacity-50">
                    {aiBusy === "summary" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScrollText className="h-3 w-3 text-[#53bdeb]" />}
                    Resumir
                  </button>
                  <button disabled={aiBusy !== null} onClick={() => doTasks()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0f2f5] text-[#111b21] hover:bg-[#e9edef] disabled:opacity-50">
                    {aiBusy === "tasks" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListChecks className="h-3 w-3 text-[#f0c040]" />}
                    Extrair tarefas
                  </button>
                  <button disabled={aiBusy !== null} onClick={() => doSentiment()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0f2f5] text-[#111b21] hover:bg-[#e9edef] disabled:opacity-50">
                    {aiBusy === "sentiment" ? <Loader2 className="h-3 w-3 animate-spin" /> : <SmileIcon className="h-3 w-3 text-[#25d366]" />}
                    Sentimento
                  </button>
                  <button disabled={aiBusy !== null} onClick={async () => {
                    setAiBusy("reply");
                    try { await qualifierReplyFn({ data: { conversationId: active.id } }); toast.success("IA respondeu!"); }
                    catch (e: any) { toast.error(e.message); } finally { setAiBusy(null); }
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0f2f5] text-[#111b21] hover:bg-[#e9edef] disabled:opacity-50">
                    <Bot className="h-3 w-3 text-[#25d366]" />
                    {aiBusy === "reply" ? "Respondendo..." : "Auto-responder"}
                  </button>
                  <button disabled={aiBusy !== null} onClick={async () => {
                    setAiBusy("qual");
                    try {
                      const r = await extractQualificationFn({ data: { conversationId: active.id } });
                      toast.success(`Score: ${r.qualification.score}`);
                      if (r.qualification.qualified) {
                        const p = await generateProposalFn({ data: { qualificationId: r.qualification.id } });
                        toast.success(`Proposta: R$ ${Number(p.proposal.value).toLocaleString("pt-BR")}`);
                      }
                    } catch (e: any) { toast.error(e.message); } finally { setAiBusy(null); }
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0f2f5] text-[#111b21] hover:bg-[#e9edef] disabled:opacity-50">
                    <Sparkles className="h-3 w-3 text-[#f0c040]" />
                    {aiBusy === "qual" ? "Qualificando..." : "Qualificar + Proposta"}
                  </button>
                  <button onClick={() => setShowAiPanel(false)} className="ml-auto p-1 text-[#8696a0] hover:text-[#111b21]"><X className="h-3.5 w-3.5" /></button>
                </div>

                {/* Resultados */}
                <div className="px-4 py-3 space-y-3">
                  <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList className="h-3.5 w-3.5 text-[#00a884]" />
                      <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Playbook da fase</span>
                      <Badge className="text-[10px] px-1.5 py-0 bg-[#00a884]/10 text-[#007a60] border-[#00a884]/20">
                        {FASE_LABELS[activeFunnelState?.fase || ""] || "Atendimento"}
                      </Badge>
                    </div>
                    <ul className="grid gap-1">
                      {(activeManualStep.infoToCollect.length ? activeManualStep.infoToCollect : playbookForPhase(activeFunnelState?.fase)).map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs text-[#111b21]">
                          <CheckCheck className="h-3 w-3 mt-0.5 text-[#00a884] shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {activeManualQuestions.map(question => (
                        <button
                          key={question}
                          onClick={() => {
                            setText(question);
                            setTimeout(() => textareaRef.current?.focus(), 0);
                          }}
                          className="max-w-full rounded-full border border-[#d1e7dd] bg-white px-2.5 py-1 text-left text-xs text-[#007a60] hover:bg-[#e8f5f1]"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                    {activeManualStep.objections.length > 0 && (
                      <div className="mt-3 grid gap-1.5">
                        {activeManualStep.objections.map(objection => (
                          <button
                            key={objection.label}
                            onClick={() => {
                              setText(objection.reply);
                              setTimeout(() => textareaRef.current?.focus(), 0);
                            }}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-left text-xs text-amber-900 hover:bg-amber-100"
                          >
                            <span className="font-semibold">{objection.label}: </span>{objection.reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {assignmentEvents.length > 0 && (
                    <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                      <div className="flex items-center gap-2 mb-2">
                        <UserCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Histórico do responsável</span>
                      </div>
                      <ul className="space-y-1">
                        {assignmentEvents.map(event => (
                          <li key={event.id} className="text-xs text-[#54656f]">
                            <span className="font-medium text-[#111b21]">{event.event_type}</span>
                            {event.note ? ` · ${event.note}` : ""}
                            <span className="text-[#8696a0]"> · {new Date(event.created_at).toLocaleString("pt-BR")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiSentiment && (
                    <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                      <div className="flex items-center gap-2 mb-1">
                        <SmileIcon className="h-3.5 w-3.5 text-[#25d366]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Sentimento</span>
                        <Badge className={cn("text-[10px] px-1.5 py-0",
                          aiSentiment.sentiment === "positivo" && "bg-green-500/20 text-green-400 border-green-500/30",
                          aiSentiment.sentiment === "neutro" && "bg-slate-500/20 text-slate-300 border-slate-500/30",
                          aiSentiment.sentiment === "negativo" && "bg-red-500/20 text-red-400 border-red-500/30",
                        )}>{aiSentiment.sentiment}</Badge>
                        <Badge className={cn("text-[10px] px-1.5 py-0",
                          aiSentiment.urgency === "alta" && "bg-red-500/20 text-red-400 border-red-500/30",
                          aiSentiment.urgency === "media" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                          aiSentiment.urgency === "baixa" && "bg-slate-500/20 text-slate-300 border-slate-500/30",
                        )}>urgência: {aiSentiment.urgency}</Badge>
                      </div>
                      <p className="text-sm text-[#54656f]">{aiSentiment.reason}</p>
                    </div>
                  )}

                  {aiSummary && (
                    <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <ScrollText className="h-3.5 w-3.5 text-[#53bdeb]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Resumo</span>
                      </div>
                      <p className="text-sm text-[#111b21] whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                    </div>
                  )}

                  {aiTasks.length > 0 && (
                    <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                      <div className="flex items-center gap-2 mb-2">
                        <ListChecks className="h-3.5 w-3.5 text-[#f0c040]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Tarefas identificadas</span>
                      </div>
                      <ul className="space-y-1.5">
                        {aiTasks.map((t, i) => (
                          <li key={i} className="text-sm text-[#111b21] flex items-start gap-2">
                            <span className="text-[#f0c040] mt-0.5">•</span>
                            <div>
                              <p className="font-medium">{t.tarefa}</p>
                              <p className="text-[10px] text-[#8696a0]">{t.responsavel} · {t.prazo}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Busca semântica */}
                  <div className="rounded-lg p-3 border border-[#e9edef] bg-[#f9fafb]">
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-3.5 w-3.5 text-[#54656f]" />
                      <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Busca inteligente</span>
                    </div>
                    <div className="flex gap-2">
                      <input value={aiSearchQ} onChange={e => setAiSearchQ(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && doSearch()}
                        placeholder='ex: "qual o endereço que ele mandou?"'
                        className="flex-1 bg-[#f0f2f5] border border-[#e9edef] rounded px-2 py-1.5 text-xs text-[#111b21] outline-none focus:border-[#00a884]" />
                      <button onClick={doSearch} disabled={aiBusy !== null || !aiSearchQ.trim()}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#00a884] text-white hover:bg-[#017d63] disabled:opacity-50">
                        {aiBusy === "search" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
                      </button>
                    </div>
                    {aiSearchResults.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {aiSearchResults.map(r => (
                          <li key={r.id} className="text-sm text-[#54656f] border-l-2 border-[#25d366] pl-2 py-0.5">
                            <span className="text-[10px] text-[#8696a0]">{r.direction === "inbound" ? "Cliente" : "Atendente"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}:</span>
                            <p className="text-[#111b21]">{r.content}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 lg:px-14 space-y-2"
              style={{ background: "#efeae2", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath fill='%23d4c9b0' fill-opacity='0.18' d='M10 20c0-1 .5-2 1.5-2.7L20 11.8V8h2v4.2l9.5 6.5c.7.5 1.5 1.5 1.5 2.8v1H10v-2zm40 0c0-1 .5-2 1.5-2.7L60 11.8V8h2v4.2l8.5 6.5c.7.5 1.5 1.5 1.5 2.8v1H50v-2z'/%3E%3C/svg%3E\")" }}>
              {grouped.length === 0 && (
                <div className="flex justify-center py-8">
                  <span className="px-3 py-1.5 rounded-lg text-xs text-[#54656f]" style={{ background: "#ffffff", boxShadow: "0 1px 0.5px rgba(11,20,26,.13)" }}>Nenhuma mensagem ainda</span>
                </div>
              )}
              {grouped.map(group => (
                <div key={group.date}>
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 rounded-lg text-xs text-[#54656f] font-medium" style={{ background: "#ffffff", boxShadow: "0 1px 0.5px rgba(11,20,26,.13)" }}>{group.date}</span>
                  </div>
                  {group.messages.map(m => (
                    <div key={m.id} className={cn("flex mb-2", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[82%] rounded-lg text-base overflow-hidden", m.direction === "outbound" ? "rounded-tr-none" : "rounded-tl-none")}
                        style={{ background: m.direction === "outbound" ? "#d9fdd3" : "#ffffff", boxShadow: "0 1px 0.5px rgba(11,20,26,.18)" }}>

                        {/* IMAGEM */}
                        {m.media_type === "image" && m.media_url && (
                          <a href={proxyUrl(m, mediaToken) ?? "#"} target="_blank" rel="noreferrer">
                            <img src={proxyUrl(m, mediaToken) ?? ""} alt="imagem" className="max-w-full block" style={{ maxHeight: 280, minWidth: 160 }}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </a>
                        )}
                        {m.media_type === "image" && !m.media_url && (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Image className="h-5 w-5 text-[#54656f]" />
                            <span className="text-[#667781] text-sm">Imagem</span>
                          </div>
                        )}

                        {/* ÁUDIO — player nativo */}
                        {m.media_type === "audio" && m.media_url && (
                          <div className="px-2 py-2 space-y-1">
                            <audio controls src={proxyUrl(m, mediaToken) ?? ""} className="h-8 w-48" style={{ filter: "invert(0.8)" }} />
                            {m.transcription ? (
                              <p className="text-[#111b21] text-sm leading-relaxed bg-white/70 rounded p-2 whitespace-pre-wrap">
                                <span className="text-[#667781] text-xs block mb-0.5">Transcrição</span>
                                {m.transcription}
                              </p>
                            ) : (
                              <button
                                disabled={transcribingId === m.id}
                                onClick={async () => {
                                  setTranscribingId(m.id);
                                  try {
                                    const r = await transcribeFn({ data: { messageId: m.id } } as any);
                                    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, transcription: r.transcript } : x));
                                  } catch (e: any) { toast.error(e.message); }
                                  finally { setTranscribingId(null); }
                                }}
                                className="text-xs px-2.5 py-1 rounded-full bg-white hover:bg-[#f0f2f5] text-[#54656f] flex items-center gap-1 border border-[#e9edef]">
                                {transcribingId === m.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ScrollText className="h-2.5 w-2.5" />}
                                {transcribingId === m.id ? "Transcrevendo..." : "Transcrever"}
                              </button>
                            )}
                          </div>
                        )}
                        {m.media_type === "audio" && !m.media_url && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#e9edef" }}>
                              <Mic className="h-4 w-4 text-[#54656f]" />
                            </div>
                            <div>
                              <div className="flex gap-0.5 items-end h-5">
                                {[3,5,4,6,3,5,4,3,5,6,4,3].map((h,i) => (
                                  <div key={i} className="w-0.5 rounded-full bg-[#8696a0]" style={{ height: h*3 }} />
                                ))}
                              </div>
                              <p className="text-xs text-[#667781] mt-0.5">Áudio</p>
                            </div>
                          </div>
                        )}

                        {/* VÍDEO */}
                        {m.media_type === "video" && m.media_url && (
                          <video controls src={proxyUrl(m, mediaToken) ?? ""} className="max-w-full block" style={{ maxHeight: 280, minWidth: 160 }} />
                        )}
                        {m.media_type === "video" && !m.media_url && (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Video className="h-5 w-5 text-[#54656f]" />
                            <span className="text-[#667781] text-sm">Vídeo</span>
                          </div>
                        )}

                        {/* DOCUMENTO */}
                        {m.media_type === "document" && (
                          <div className="flex items-center gap-3 px-4 py-3" style={{ minWidth: 240 }}>
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#e9edef" }}>
                              <FileText className="h-5 w-5 text-[#54656f]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#111b21] text-sm font-medium truncate">{m.content || "Documento"}</p>
                              <p className="text-[#667781] text-xs">Documento</p>
                            </div>
                            {m.media_url && (
                              <a href={proxyUrl(m, mediaToken) ?? "#"} target="_blank" rel="noreferrer"
                                className="shrink-0 p-1.5 rounded-lg hover:bg-[#f0f2f5] text-[#54656f] hover:text-[#111b21] transition-colors">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* TEXTO */}
                        {m.content && m.media_type !== "document" && (
                          <p className="text-[#111b21] leading-relaxed whitespace-pre-wrap break-words px-4 py-2.5">{m.content}</p>
                        )}
                        {!m.content && !m.media_type && (
                          <p className="text-[#667781] text-xs px-3 py-2 italic">Mensagem</p>
                        )}

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 justify-end px-3 pb-2 -mt-1">
                          {m.status === "failed" && (
                            <button onClick={() => retryMessage(m)}
                              className="mr-1 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-500/20"
                              title={m.last_error || "Reenviar mensagem"}>
                              <RotateCcw className="h-2.5 w-2.5" /> reenviar
                            </button>
                          )}
                          <span className="text-xs text-[#667781]">{formatMsgTime(m.created_at)}</span>
                          {m.direction === "outbound" && (
                            <span title={m.status === "failed" ? (m.last_error || "Falhou") : (m as any).read_at ? "Lido" : (m as any).delivered_at ? "Entregue" : m.status === "pending" ? "Enviando" : "Enviado"}>
                              {m.status === "failed"
                                ? <AlertTriangle className="h-3 w-3 text-red-500" />
                                : m.status === "pending"
                                  ? <Clock className="h-3 w-3 text-[#8696a0]" />
                                  : (m as any).read_at
                                ? <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                                : (m as any).delivered_at
                                  ? <CheckCheck className="h-3 w-3 text-[#8696a0]" />
                                  : <span className="text-[#8696a0] text-[10px]">✓</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Busca dentro do chat */}
            {showSearchMsg && (
              <div className="px-4 py-2 flex items-center gap-2 border-b border-[#e9edef] bg-white">
                <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
                <input autoFocus
                  className="flex-1 bg-transparent text-sm text-[#111b21] placeholder-[#8696a0] outline-none"
                  placeholder="Buscar nas mensagens..."
                  value={searchMsg} onChange={e => setSearchMsg(e.target.value)} />
                <button onClick={() => { setShowSearchMsg(false); setSearchMsg(""); }}
                  className="text-[#8696a0] hover:text-[#111b21]"><X className="h-4 w-4" /></button>
              </div>
            )}

            {/* Quick Replies */}
            {showQuickReplies && (
              <div className="border-t border-[#e9edef] px-3 py-2 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[#00a884] text-xs font-medium">Respostas prontas</span>
                  <input
                    className="flex-1 bg-[#f0f2f5] rounded px-2 py-1 text-xs text-[#111b21] placeholder-[#8696a0] outline-none"
                    placeholder="Buscar..." value={quickSearch} onChange={e => setQuickSearch(e.target.value)} autoFocus />
                  <button onClick={() => { setShowQuickReplies(false); setQuickSearch(""); }}
                    className="text-[#8696a0] hover:text-[#111b21]"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {quickReplies
                    .filter(r => quickSearch === "" || r.shortcut.includes(quickSearch) || r.message.toLowerCase().includes(quickSearch.toLowerCase()))
                    .map(r => (
                      <button key={r.id} onClick={() => insertQuickReply(r.message)}
                        className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-[#f0f2f5] text-left transition-colors">
                        <span className="text-[#00a884] text-xs font-mono shrink-0">/{r.shortcut}</span>
                        <span className="text-[#111b21] text-xs truncate">{r.message}</span>
                      </button>
                    ))}
                  {quickReplies.filter(r => quickSearch === "" || r.shortcut.includes(quickSearch) || r.message.toLowerCase().includes(quickSearch.toLowerCase())).length === 0 && (
                    <p className="text-[#8696a0] text-xs text-center py-2">Nenhuma resposta encontrada</p>
                  )}
                </div>
              </div>
            )}

            {/* Sugestões inteligentes (chips) */}
            {(suggestions.length > 0 || aiBusy === "suggest") && (
              <div className="px-4 pt-2 pb-1 shrink-0 border-t border-[#e9edef] bg-white">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="h-3 w-3 text-[#25d366]" />
                  <span className="text-[10px] text-[#8696a0] uppercase tracking-wide">Sugestões</span>
                  <select value={tone} onChange={e => doSuggest(e.target.value as any)}
                    className="text-xs bg-white border border-[#e9edef] rounded px-2 py-1 text-[#111b21] outline-none">
                    <option value="amigavel">Amigável</option>
                    <option value="formal">Formal</option>
                    <option value="casual">Casual</option>
                    <option value="persuasivo">Persuasivo</option>
                  </select>
                  <button onClick={() => setSuggestions([])} className="ml-auto text-xs text-[#667781] hover:text-[#111b21]">Limpar</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {aiBusy === "suggest" && <span className="text-xs text-[#8696a0] flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Gerando...</span>}
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setText(s); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-full bg-[#f0f2f5] hover:bg-[#e9edef] text-[#111b21] border border-[#e9edef] text-left max-w-md">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-5 py-4 flex items-end gap-3 shrink-0 border-t border-[#e9edef]" style={{ background: "#f0f2f5" }}>
              {/* Quick Replies button */}
              <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                title="Respostas prontas"
                className={cn("p-2 shrink-0 transition-colors", showQuickReplies ? "text-[#00a884]" : "text-[#54656f] hover:text-[#00a884]")}>
                <Zap className="h-5 w-5" />
              </button>
              <button onClick={() => doSuggest()} disabled={aiBusy !== null}
                title="Sugerir 3 respostas"
                className="p-2 text-[#54656f] hover:text-[#00a884] shrink-0 disabled:opacity-50">
                {aiBusy === "suggest" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </button>
              <div className="flex-1 rounded-lg px-4 py-3 flex flex-col gap-1 bg-white shadow-sm">
                <textarea ref={textareaRef}
                  className="flex-1 bg-transparent text-base text-[#111b21] placeholder-[#8696a0] outline-none resize-none leading-relaxed"
                  style={{ height: "48px", maxHeight: "160px" }}
                  placeholder={active.ai_paused ? "Você está respondendo" : "Digite uma mensagem"}
                  value={text} onChange={handleTextChange} onKeyDown={handleKeyDown} rows={1} />
                {/* Barra de reescrita inline */}
                {text.trim().length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-[#e9edef]">
                    <span className="text-xs text-[#8696a0] uppercase tracking-wide mr-1">Reescrever:</span>
                    {(["curta", "clara", "profissional", "persuasiva"] as const).map(s => (
                      <button key={s} onClick={() => doRewrite(s)} disabled={aiBusy !== null}
                        className="text-xs px-2.5 py-1 rounded-full bg-[#f0f2f5] hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] disabled:opacity-50">
                        {aiBusy === "rewrite" ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : <Wand2 className="h-2.5 w-2.5 inline mr-0.5" />} {s}
                      </button>
                    ))}
                    <button onClick={doTranslate} disabled={aiBusy !== null}
                      className="text-xs px-2.5 py-1 rounded-full bg-[#f0f2f5] hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] disabled:opacity-50">
                      {aiBusy === "translate" ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : <Languages className="h-2.5 w-2.5 inline mr-0.5" />} traduzir
                    </button>
                  </div>
                )}
              </div>

              {/* Preview do áudio gravado */}
              {recorder.audioBlob && !recorder.recording && (
                <div className="px-4 py-2 flex items-center gap-3 border-t border-[#e9edef] bg-white">
                  <audio controls src={URL.createObjectURL(recorder.audioBlob)} className="h-8 flex-1" style={{ filter: "invert(0.7)" }} />
                  <button onClick={recorder.cancel} className="text-red-400 hover:text-red-300 p-1"><X className="h-4 w-4" /></button>
                  <button onClick={sendRecordedAudio} disabled={sendingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-black"
                    style={{ background: "#00a884" }}>
                    {sendingAudio ? "Enviando..." : <><Send className="h-3.5 w-3.5" /> Enviar</>}
                  </button>
                </div>
              )}

              {/* Botão de anexo */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleSendFile(file);
                  e.target.value = "";
                }}
              />
              <button
                title="Enviar arquivo, foto ou vídeo"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendingFile}
                className="p-3 rounded-full flex items-center justify-center shrink-0 hover:bg-[#e9edef] text-[#54656f] hover:text-[#111b21] transition-colors disabled:opacity-40">
                {sendingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
              </button>

              {/* Botão Send/Mic/Gravando */}
              <button
                title="Gerar áudio com IA (ElevenLabs)"
                onClick={() => { setTtsText(text); setTtsBlob(null); setTtsOpen(true); }}
                className="p-3 rounded-full flex items-center justify-center shrink-0 hover:bg-[#e9edef] text-violet-500">
                <Sparkles className="h-5 w-5" />
              </button>
              {recorder.recording ? (
                <button onClick={recorder.stop}
                  className="p-3 rounded-full flex items-center justify-center shrink-0 animate-pulse"
                  style={{ background: "#ef4444" }}>
                  <span className="text-white text-xs font-bold">{recorder.duration}s</span>
                </button>
              ) : (
                <button
                  onClick={text.trim() ? handleSend : recorder.start}
                  className="p-3 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "#00a884" }}>
                  {text.trim() ? <Send className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PAINEL LATERAL DO LEAD ── */}
      {/* Modal histórico do contato */}
      {showHistory && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowHistory(false)}>
          <div className="w-[440px] max-h-[80vh] rounded-2xl border border-[#e9edef] overflow-hidden flex flex-col bg-white"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e9edef]">
              <p className="text-[#111b21] font-medium">Histórico — {active.contact_name || active.phone}</p>
              <button onClick={() => setShowHistory(false)} className="text-[#8696a0] hover:text-[#111b21]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {historyConvs.length === 0 && (
                <p className="text-center text-[#8696a0] text-sm py-8">Nenhum histórico encontrado</p>
              )}
              {historyConvs.map(c => (
                <button key={c.id} onClick={() => { setActiveId(c.id); setShowHistory(false); }}
                  className="w-full flex items-start gap-3 px-4 py-3 border-b border-[#e9edef] hover:bg-[#f5f5f5] text-left transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-[#111b21] font-medium">
                        {new Date(c.last_message_at).toLocaleDateString("pt-BR")}
                      </span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        c.ticket_status === "resolved" ? "bg-slate-500/20 text-slate-400" :
                        c.ticket_status === "open" ? "bg-green-500/20 text-green-400" :
                        "bg-amber-500/20 text-amber-400")}>
                        {c.ticket_status === "resolved" ? "Encerrado" : c.ticket_status === "open" ? "Aberto" : "Pendente"}
                      </span>
                    </div>
                    <p className="text-xs text-[#8696a0] truncate">{c.last_message_preview || "Sem mensagens"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {active && showLeadPanel && (
        <LeadPanel
          key={active.id}
          conv={active}
          onClose={() => setShowLeadPanel(false)}
          onConvUpdated={loadConvs}
          onUseText={(message) => {
            setText(message);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        />
      )}

      {/* TTS Dialog */}
      <Dialog open={ttsOpen} onOpenChange={(v) => { setTtsOpen(v); if (!v) { setTtsBlob(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> Gerar áudio com IA</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Voz</label>
              <select
                value={ttsVoice}
                onChange={(e) => { setTtsVoice(e.target.value); setTtsBlob(null); }}
                className="w-full p-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="FGY2WhTYpPnrIDTdsKH5">Laura (feminina, pt/multi)</option>
                <option value="EXAVITQu4vr4xnSDxMaL">Sarah (feminina)</option>
                <option value="Xb7hH8MSUJpSbSDYk0k2">Alice (feminina)</option>
                <option value="cgSgspJ2msm6clMCkdW9">Jessica (feminina)</option>
                <option value="pFZP5JQG7iQjIQuC4Bku">Lily (feminina)</option>
                <option value="XrExE9yKIg1WjnnlVkGX">Matilda (feminina)</option>
                <option value="JBFqnCBsd6RMkjVDRZzb">George (masculina)</option>
                <option value="onwK4e9ZLuTAKqWW03F9">Daniel (masculina)</option>
                <option value="nPczCjzI2devNBz1zQrb">Brian (masculina)</option>
                <option value="cjVigY5qzO86Huf0OWal">Eric (masculina)</option>
                <option value="iP95p4xoKVk53GoZ742B">Chris (masculina)</option>
                <option value="CwhRBWXzGAHq8TQ4Fs17">Roger (masculina)</option>
                <option value="bIHbv24MWmeRgasZH58o">Will (masculina)</option>
                <option value="TX3LPaxmHKxFdv7VOQHJ">Liam (masculina)</option>
                <option value="IKne3meq5aSn9XLyUdCD">Charlie (masculina)</option>
              </select>
            </div>
            <textarea value={ttsText} onChange={(e) => { setTtsText(e.target.value); setTtsBlob(null); }}
              placeholder="Digite o texto para virar áudio..." rows={4}
              className="w-full p-3 rounded-md border border-input bg-background text-sm" />
            {ttsBlob && (
              <audio controls src={URL.createObjectURL(ttsBlob)} className="w-full h-9" />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setTtsOpen(false)}>Fechar</Button>
            {!ttsBlob ? (
              <Button onClick={handleGenerateTTS} disabled={ttsBusy || !ttsText.trim()}>
                {ttsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar áudio"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleGenerateTTS} disabled={ttsBusy}>Regerar</Button>
                <Button onClick={sendTTSAudio} disabled={ttsBusy}>
                  {ttsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Enviar</>}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
