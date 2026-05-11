import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Search, MoreVertical, Phone, Video, Smile, Paperclip, Mic, Bot, Sparkles, MessageSquare, CheckCheck, X, ChevronRight, User, FileText, Clock, Wand2, Languages, Smile as SmileIcon, ListChecks, ScrollText, Loader2, Image, ExternalLink, Zap } from "lucide-react";
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
import { transcribeAudioMessage, generateTTS } from "@/server/elevenlabs.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


// ── Hook de notificação sonora + visual ────────────────────────
function useNotification() {
  const audioRef = useRef<AudioContext | null>(null);

  const playSound = () => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const notify = (title: string, body: string, onClick?: () => void) => {
    playSound();
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body, icon: "/favicon.ico", badge: "/favicon.ico",
        tag: "lex-crm-message",
      });
      if (onClick) n.onclick = () => { window.focus(); onClick(); };
    }
  };

  const requestPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  return { notify, requestPermission };
}


// ── Hook de gravação de áudio ──────────────────────────────────
function useAudioRecorder() {
  const [recording, setRecording]     = useState(false);
  const [audioBlob, setAudioBlob]     = useState<Blob | null>(null);
  const [duration, setDuration]       = useState(0);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const getMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getMimeType();
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(100);
      mediaRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        toast.error("Permissão de microfone negada. Clique no ícone de cadeado na barra de endereço e permita o microfone.");
      } else {
        toast.error(`Erro ao acessar microfone: ${e.message}`);
      }
    }
  };

  const stop = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const cancel = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    chunksRef.current = [];
    setRecording(false);
    setAudioBlob(null);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const reset = () => { setAudioBlob(null); setDuration(0); };

  return { recording, audioBlob, duration, start, stop, cancel, reset };
}

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Inbox WhatsApp — Lex CRM" }] }),
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
};

type QuickReply = { id: string; shortcut: string; message: string };
type ConvTag    = { id: string; name: string; color: string };

type Message = {
  id: string; direction: "inbound" | "outbound";
  content: string | null; created_at: string; status?: string;
  media_type?: string | null; media_url?: string | null; media_mime?: string | null;
  delivered_at?: string | null; read_at?: string | null;
  transcription?: string | null;
};

const proxyUrl = (msg: Message) =>
  msg.media_url ? `/api/media-proxy?msg=${msg.id}` : null;

type FunnelState = {
  fase: string;
  dados: Record<string, any>;
  midias_enviadas: string[];
  funnels: { name: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────
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

function avatar(name: string | null, phone: string) {
  const label = name ? name[0].toUpperCase() : phone[0];
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#00BCD4","#8BC34A","#FF9800","#E91E63"];
  const idx = (name || phone).split("").reduce((a,c) => a + c.charCodeAt(0), 0) % colors.length;
  return { label, color: colors[idx] };
}

function formatTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let current = "";
  for (const m of messages) {
    const d = new Date(m.created_at), now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const label = diff === 0 ? "Hoje" : diff === 1 ? "Ontem"
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (label !== current) { groups.push({ date: label, messages: [] }); current = label; }
    groups[groups.length - 1].messages.push(m);
  }
  return groups;
}

const FASES = ["abertura","triagem","conexao","fechamento","coleta","assinatura","encerrado"];
const FASE_LABELS: Record<string, string> = {
  abertura: "Abertura", triagem: "Triagem", conexao: "Conexão",
  fechamento: "Fechamento", coleta: "Coleta de dados",
  assinatura: "Assinatura", encerrado: "Encerrado",
};
const FASE_COLORS: Record<string, string> = {
  abertura: "#8696a0", triagem: "#34B7F1", conexao: "#FF9800",
  fechamento: "#E91E63", coleta: "#9C27B0", assinatura: "#25D366", encerrado: "#128C7E",
};

const DADO_LABELS: Record<string, string> = {
  nome: "Nome", nomeCrianca: "Criança", idadeCrianca: "Idade",
  municipio: "Município", cpf: "CPF", rg: "RG",
  estadoCivil: "Estado civil", profissao: "Profissão",
  endereco: "Endereço", dataNascimentoCrianca: "Nasc. criança",
  creche: "Creche", protocolo: "Protocolo",
  temPrescricao: "Tem prescrição", nomeMedico: "Médico", crm: "CRM", cid: "CID",
};

// ── Painel lateral do lead ─────────────────────────────────────
function LeadPanel({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
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

  // Verificar se já é cliente
  useEffect(() => {
    if (!conv.phone) return;
    supabase.from("clients")
      .select("id, full_name, email, document")
      .eq("phone", conv.phone.replace(/\D/g, ""))
      .maybeSingle()
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
      const phone = form.phone.replace(/\D/g, "");
      // Upsert pelo telefone
      // Verificar se já existe pelo telefone
      const { data: existing } = await supabase.from("clients")
        .select("id").eq("phone", phone).eq("user_id", user.id).maybeSingle();

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

  useEffect(() => {
    setLoading(true);
    supabase.from("funnel_states")
      .select("fase, dados, midias_enviadas, funnels(name)")
      .eq("conversation_id", conv.id).maybeSingle()
      .then(({ data }) => { setState(data as any); setLoading(false); });
  }, [conv.id]);

  const faseIdx = state ? FASES.indexOf(state.fase) : -1;
  const dados = state?.dados ?? {};
  const dadosKeys = Object.keys(dados).filter(k => dados[k] && DADO_LABELS[k]);

  return (
    <div className="w-72 shrink-0 flex flex-col border-l" style={{ background: "#111b21" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3942]" style={{ background: "#202c33" }}>
        <span className="text-white text-sm font-medium">Ficha do Lead</span>
        <button onClick={onClose} className="text-[#aebac1] hover:text-white p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Identidade */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ background: avatar(conv.contact_name, conv.phone).color }}>
            {avatar(conv.contact_name, conv.phone).label}
          </div>
          <div>
            <p className="text-white font-medium text-sm">{conv.contact_name || conv.phone}</p>
            <p className="text-[#8696a0] text-xs">{formatBRPhone(conv.phone) || conv.phone}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {conv.ai_paused
                ? <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30">IA pausada</Badge>
                : <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">IA ativa</Badge>
              }
            </div>
          </div>
        </div>

        {/* Botão cadastrar cliente */}
        <div className="rounded-lg border border-[#2a3942] overflow-hidden" style={{ background: "#182229" }}>
          {clienteExiste ? (
            <div className="px-3 py-2.5 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#25d366] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide">Cliente cadastrado</p>
                <p className="text-white text-xs font-medium truncate">{clienteExiste.full_name}</p>
                {clienteExiste.document && <p className="text-[#8696a0] text-[10px]">CPF: {clienteExiste.document}</p>}
              </div>
              <button onClick={() => setShowForm(!showForm)}
                className="text-[10px] text-[#25d366] hover:underline shrink-0">editar</button>
            </div>
          ) : (
            <button onClick={() => setShowForm(!showForm)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#2a3942] transition-colors text-left">
              <div className="h-7 w-7 rounded-full bg-[#25d366]/20 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-[#25d366]" />
              </div>
              <div>
                <p className="text-white text-xs font-medium">Cadastrar como cliente</p>
                <p className="text-[#8696a0] text-[10px]">Salvar na base de clientes</p>
              </div>
            </button>
          )}

          {showForm && (
            <div className="border-t border-[#2a3942] px-3 py-3 space-y-2">
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Nome *</p>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-[#2a3942] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#3b4a54] focus:border-[#25d366] placeholder-[#8696a0]"
                  placeholder="Nome completo" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Telefone</p>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-[#2a3942] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#3b4a54] placeholder-[#8696a0]"
                  placeholder="5551999999999" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">E-mail</p>
                <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-[#2a3942] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#3b4a54] placeholder-[#8696a0]"
                  placeholder="email@exemplo.com" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">CPF</p>
                <input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))}
                  className="w-full bg-[#2a3942] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#3b4a54] placeholder-[#8696a0]"
                  placeholder="000.000.000-00" />
              </div>
              <div>
                <p className="text-[10px] text-[#8696a0] mb-1">Observações</p>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full bg-[#2a3942] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-[#3b4a54] placeholder-[#8696a0] resize-none"
                  placeholder="Anotações sobre o cliente..." />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs text-[#8696a0] hover:text-white border border-[#3b4a54] hover:bg-[#2a3942] transition-colors">
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
            <p className="text-[#8696a0] text-xs">Funil ainda não iniciado</p>
          </div>
        )}

        {!loading && state && (
          <>
            {/* Funil */}
            {(state.funnels as any)?.name && (
              <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#182229" }}>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-1">Funil</p>
                <p className="text-white text-sm font-medium">{(state.funnels as any).name}</p>
              </div>
            )}

            {/* Progresso de fases */}
            <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#182229" }}>
              <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-3">Progresso</p>
              <div className="space-y-1.5">
                {FASES.map((fase, i) => {
                  const done    = i < faseIdx;
                  const current = i === faseIdx;
                  const future  = i > faseIdx;
                  return (
                    <div key={fase} className="flex items-center gap-2">
                      <div className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        done    && "bg-[#25d366] text-black",
                        current && "border-2 text-white",
                        future  && "bg-[#2a3942] text-[#8696a0]",
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
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dados coletados */}
            {dadosKeys.length > 0 && (
              <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#182229" }}>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-wide mb-2">Dados coletados</p>
                <div className="space-y-1.5">
                  {dadosKeys.map(k => (
                    <div key={k} className="flex items-start gap-2">
                      <span className="text-[10px] text-[#8696a0] shrink-0 pt-0.5 w-24">{DADO_LABELS[k]}:</span>
                      <span className="text-xs text-white break-words">{String(dados[k])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mídias enviadas */}
            {state.midias_enviadas.length > 0 && (
              <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#182229" }}>
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
          </>
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
  const [quickReplies, setQuickReplies]   = useState<QuickReply[]>([]);
  const [tags, setTags]                   = useState<ConvTag[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickSearch, setQuickSearch]     = useState("");
  const [showTagMenu, setShowTagMenu]     = useState(false);
  const [businessHours, setBusinessHours] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [newConv, setNewConv] = useState({ phone: "", contact_name: "" });
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showLeadPanel, setShowLeadPanel] = useState(false);

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
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsBlob, setTtsBlob] = useState<Blob | null>(null);
  const [ttsVoice, setTtsVoice] = useState("FGY2WhTYpPnrIDTdsKH5");

  // Reset ao trocar de conversa
  useEffect(() => {
    setSuggestions([]); setAiSummary(null); setAiTasks([]); setAiSentiment(null);
    setAiSearchQ(""); setAiSearchResults([]);
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

  const loadTags = useCallback(async () => {
    const { data } = await supabase.from("conversation_tags").select("*").order("name");
    setTags(data ?? []);
  }, []);

  const loadBusinessHours = useCallback(async () => {
    const { data } = await supabase.from("business_hours").select("*").maybeSingle();
    setBusinessHours(data);
  }, []);

  const loadConvs = useCallback(async () => {
    let q = supabase.from("conversations").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (activeInstance !== "all") q = q.eq("instance_id", activeInstance);
    const { data } = await q;
    setConversations((data ?? []) as Conversation[]);
  }, [activeInstance]);

  // Filtrar conversas por status de ticket
  const filteredConvs = conversations.filter(c => {
    if (ticketFilter === "all") return true;
    return (c.ticket_status ?? "pending") === ticketFilter;
  });

  useEffect(() => {
    requestPermission();
  }, []); // eslint-disable-line

  useEffect(() => {
    loadInstances();
    loadQuickReplies();
    loadTags();
    loadBusinessHours();
  }, [loadInstances, loadQuickReplies, loadTags, loadBusinessHours]);
  useEffect(() => { loadConvs(); setActiveId(null); }, [loadConvs]);

  // Realtime conversas
  useEffect(() => {
    const ch = supabase.channel("convs-rt")
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
  }, [loadConvs]);

  // Carregar mensagens + realtime quando troca de conversa
  useEffect(() => {
    if (!activeId) return;
    supabase.from("messages").select("*")
      .eq("conversation_id", activeId).order("created_at")
      .then(({ data }) => {
        setMessages((data ?? []) as Message[]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      });
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);

    const ch = supabase.channel(`msgs:${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages",
          filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
          loadConvs(); // Atualiza preview na lista
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  const handleNewConv = async () => {
    if (!user || !newConv.phone) return;
    const phone = normalizeBRPhone(newConv.phone) || newConv.phone.replace(/\D/g, "");
    // Verifica se já existe (em qualquer formato)
    const variants = phoneVariants(phone);
    const { data: existing } = await supabase.from("conversations")
      .select("id").eq("user_id", user.id).in("phone", variants.length ? variants : [phone]).limit(1).maybeSingle();
    if (existing) {
      setOpen(false); setNewConv({ phone: "", contact_name: "" });
      setActiveId(existing.id); setShowLeadPanel(true);
      toast.info("Conversa já existente aberta");
      return;
    }
    const { data, error } = await supabase.from("conversations").insert({
      user_id: user.id, phone,
      contact_name: newConv.contact_name || null, status: "open",
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpen(false); setNewConv({ phone: "", contact_name: "" });
    loadConvs();
    if (data) { setActiveId(data.id); setShowLeadPanel(true); }
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
    const { error } = await supabase.from("conversations").update({
      ticket_status: "open",
      accepted_at:   new Date().toISOString(),
      assigned_to:   user?.id ?? null,
    }).eq("id", convId);
    if (error) { toast.error(`Erro: ${error.message}. Rode a migration no Supabase.`); return; }
    // Atualizar estado local imediatamente
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, ticket_status: "open" as const } : c
    ));
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

  const uploadAndSendAudio = async (blob: Blob) => {
    if (!activeId || !user) return;
    const mime = blob.type || "audio/webm";
    const ext  = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : "webm";
    const fileName = `${user.id}/audio/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("whatsapp-media")
      .upload(fileName, blob, { contentType: mime, upsert: true });
    if (upErr) throw new Error(`Upload: ${upErr.message}`);

    const { data: urlData } = supabase.storage.from("whatsapp-media").getPublicUrl(fileName);
    const audioUrl = urlData?.publicUrl;
    if (!audioUrl) throw new Error("URL não gerada");

    await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content: "[Áudio]",
      media_type: "audio", media_url: audioUrl, status: "sent",
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
      await supabase.from("conversations").update({ ticket_status: "open", accepted_at: new Date().toISOString(), assigned_to: user?.id ?? null }).eq("id", activeId ?? "");
    }

    // Salvar no banco
    await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content, status: "sent",
    });
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 80),
    }).eq("id", activeId);

    // Enviar via Evolution API — usar a instância vinculada à conversa
    const { data: convRow } = await supabase.from("conversations")
      .select("phone, instance_id").eq("id", activeId).single();

    let inst: any = null;
    if (convRow?.instance_id) {
      const { data } = await supabase.from("whatsapp_instances")
        .select("*").eq("id", convRow.instance_id).maybeSingle();
      inst = data;
    }
    if (!inst) {
      const { data } = await supabase.from("whatsapp_instances").select("*")
        .eq("user_id", user.id).eq("status", "connected").limit(1).maybeSingle();
      inst = data;
    }

    if (conv?.phone && inst?.api_url && inst?.api_key) {
      const number = conv.phone.replace(/\D/g, "");
      fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({ number, text: content, options: { delay: 500 } }),
      }).catch(e => console.error("send manual error:", e));
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
    await supabase.from("conversations").update({ ai_paused: !conv.ai_paused }).eq("id", conv.id);
    loadConvs();
    toast.success(conv.ai_paused ? "IA reativada" : "IA pausada — você está no controle");
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

  return (
    <div className="flex flex-1 overflow-hidden" style={{ background: "#111b21" }}>
      <Toaster />

      {/* ── SIDEBAR ── */}
      <div className="w-[360px] flex flex-col border-r border-[#2a3942] shrink-0" style={{ background: "#111b21" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: "#202c33" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#25d366]">
              {user?.email?.[0]?.toUpperCase() ?? "M"}
            </div>
            <span className="text-white font-medium text-sm">Lex CRM</span>
          </div>
          <div className="flex items-center gap-1">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1]"><Plus className="h-5 w-5" /></button>
              </DialogTrigger>
              <DialogContent className="bg-[#202c33] border-[#2a3942] text-white">
                <DialogHeader><DialogTitle className="text-white">Nova conversa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Telefone *</label>
                    <input className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#25d366]"
                      placeholder="+5551..." value={newConv.phone} onChange={e => setNewConv({ ...newConv, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Nome do contato</label>
                    <input className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#25d366]"
                      value={newConv.contact_name} onChange={e => setNewConv({ ...newConv, contact_name: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <button onClick={handleNewConv} className="bg-[#25d366] hover:bg-[#20ba5a] text-white px-4 py-2 rounded-lg text-sm font-medium">Criar</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1]"><MoreVertical className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Seletor de número/instância */}
        {instances.length > 0 && (
          <div className="px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto" style={{ background: "#111b21" }}>
            <button
              onClick={() => setActiveInstance("all")}
              className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                activeInstance === "all"
                  ? "bg-[#25d366] text-black"
                  : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]"
              )}>
              <span>Todos</span>
              <span className="text-[10px] opacity-70">({conversations.length})</span>
            </button>
            {instances.map(inst => {
              const count = conversations.filter(c => (c as any).instance_id === inst.id).length;
              const isActive = activeInstance === inst.id;
              return (
                <button key={inst.id}
                  onClick={() => setActiveInstance(inst.id)}
                  className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    isActive
                      ? "bg-[#25d366] text-black"
                      : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]"
                  )}>
                  <div className={cn("h-1.5 w-1.5 rounded-full", inst.status === "connected" ? "bg-[#25d366]" : "bg-red-400")}
                    style={isActive ? { background: "black" } : {}} />
                  <span className="truncate max-w-[80px]">
                    {inst.phone_number || inst.instance_name}
                  </span>
                  {count > 0 && (
                    <span className="text-[10px] opacity-70">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Abas de status do ticket */}
        <div className="flex border-b border-[#2a3942] shrink-0" style={{ background: "#202c33" }}>
          {([
            { key: "all",      label: "Todos" },
            { key: "pending",  label: "Pendentes" },
            { key: "open",     label: "Abertos" },
            { key: "resolved", label: "Resolvidos" },
          ] as const).map(tab => {
            const count = tab.key === "all"
              ? conversations.length
              : conversations.filter(c => (c.ticket_status ?? "pending") === tab.key).length;
            return (
              <button key={tab.key} onClick={() => setTicketFilter(tab.key)}
                className={cn("flex-1 py-2 text-[11px] font-medium transition-colors border-b-2",
                  ticketFilter === tab.key
                    ? "border-[#25d366] text-[#25d366]"
                    : "border-transparent text-[#8696a0] hover:text-[#aebac1]")}>
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 px-1 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: ticketFilter === tab.key ? "#25d366" : "#2a3942", color: ticketFilter === tab.key ? "#000" : "#8696a0" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Busca + Ordenar */}
        <div className="px-3 py-2 flex gap-2" style={{ background: "#111b21" }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1" style={{ background: "#202c33" }}>
            <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
            <input className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none"
              placeholder="Pesquisar conversas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setSortUnread(!sortUnread)}
            title="Ordenar por não lidas"
            className={cn("px-2 rounded-lg text-xs font-medium transition-colors", sortUnread ? "bg-[#25d366] text-black" : "text-[#8696a0] hover:text-white")}
            style={{ background: sortUnread ? "#25d366" : "#202c33" }}>
            🔔
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-[#8696a0] text-sm">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />Nenhuma conversa
            </div>
          )}
          {filtered.map(c => {
            const av = avatar(c.contact_name, c.phone);
            const isActive = activeId === c.id;
            return (
              <button key={c.id} onClick={() => { setActiveId(c.id); setShowLeadPanel(true); }}
                className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-[#2a3942] hover:bg-[#2a3942] transition-colors text-left", isActive && "bg-[#2a3942]")}>
                <div className="relative shrink-0">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={c.contact_name || c.phone}
                      className="h-12 w-12 rounded-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: av.color }}>
                      {av.label}
                    </div>
                  )}
                  {/* Indicador bloqueado */}
                  {c.blocked && (
                    <div className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-600 border-2 border-[#111b21] flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">🚫</span>
                    </div>
                  )}
                  {/* Indicador IA pausada */}
                  {c.ai_paused && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 border-2 border-[#111b21] flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">P</span>
                    </div>
                  )}
                  {!c.ai_paused && c.ai_handled && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#25d366] border-2 border-[#111b21] flex items-center justify-center">
                      <Bot className="h-2.5 w-2.5 text-black" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium text-sm truncate">{c.contact_name || c.phone}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {/* Badge de status */}
                      {(c.ticket_status ?? "pending") === "pending" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">NOVO</span>
                      )}
                      {(c.ticket_status ?? "pending") === "resolved" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 font-bold">✓</span>
                      )}
                      <span className={cn("text-xs", c.unread_count > 0 ? "text-[#25d366]" : "text-[#8696a0]")}>
                        {c.last_message_at ? formatTime(c.last_message_at) : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-[#8696a0] text-xs truncate flex-1">{c.last_message_preview || "Sem mensagens"}</p>
                    {c.unread_count > 0 && (
                      <span className="ml-2 shrink-0 h-5 min-w-5 px-1 rounded-full bg-[#25d366] text-black text-xs font-bold flex items-center justify-center">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  {/* Tags */}
                  {c.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.tags.slice(0,3).map(tag => {
                        const t = tags.find(x => x.name === tag);
                        return (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: (t?.color ?? "#6366f1") + "30", color: t?.color ?? "#6366f1" }}>
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ÁREA DE CHAT ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#0b141a" }}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0]">
            <div className="h-24 w-24 rounded-full flex items-center justify-center mb-6" style={{ background: "rgba(37,211,102,0.1)", border: "2px solid rgba(37,211,102,0.2)" }}>
              <MessageSquare className="h-10 w-10" style={{ color: "#25d366" }} />
            </div>
            <h2 className="text-white text-xl font-light mb-2">Lex CRM — WhatsApp</h2>
            <p className="text-sm text-center max-w-xs">Selecione uma conversa para começar o atendimento.</p>
          </div>
        ) : (
          <>
            {/* Header do chat */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#202c33" }}>
              <div className="shrink-0">
                {active.photo_url ? (
                  <img src={active.photo_url} alt={active.contact_name || active.phone}
                    className="h-10 w-10 rounded-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: avatar(active.contact_name, active.phone).color }}>
                    {avatar(active.contact_name, active.phone).label}
                  </div>
                )}
              </div>
              <button className="flex-1 text-left" onClick={() => setShowLeadPanel(!showLeadPanel)}>
                <p className="text-white font-medium text-sm">{active.contact_name || formatBRPhone(active.phone) || active.phone}</p>
                <p className="text-[#8696a0] text-xs">
                  {formatBRPhone(active.phone) || active.phone}
                  {(active as any).instance_id && instances.find(i => i.id === (active as any).instance_id) && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#25d366]/20 text-[#25d366] text-[10px]">
                      📱 {instances.find(i => i.id === (active as any).instance_id)?.phone_number || instances.find(i => i.id === (active as any).instance_id)?.instance_name}
                    </span>
                  )}
                  {" · clique para ver ficha"}
                </p>
              </button>
              <div className="flex items-center gap-1">
                {/* Pausar/retomar IA */}
                <button
                  onClick={() => toggleAiPause(active)}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors",
                    active.ai_paused
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-[#25d366]/20 text-[#25d366] hover:bg-[#25d366]/30"
                  )}
                  title={active.ai_paused ? "Reativar IA" : "Pausar IA"}
                >
                  <Bot className="h-3.5 w-3.5" />
                  {active.ai_paused ? "IA pausada" : "IA ativa"}
                </button>

                {/* Aceitar ticket */}
                {(active.ticket_status ?? "pending") === "pending" && (
                  <button onClick={() => acceptTicket(active.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
                    <CheckCheck className="h-3.5 w-3.5" /> Aceitar
                  </button>
                )}
                {/* Resolver ticket */}
                {(active.ticket_status ?? "pending") !== "resolved" && (
                  <button onClick={() => resolveTicket(active.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400 hover:bg-slate-500/30 transition-colors">
                    ✓ Resolver
                  </button>
                )}
                {(active.ticket_status ?? "pending") === "resolved" && (
                  <button onClick={() => reopenTicket(active.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors">
                    ↩ Reabrir
                  </button>
                )}

                {/* Tags */}
                <div className="relative">
                  <button onClick={() => setShowTagMenu(!showTagMenu)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-[#aebac1] hover:bg-[#3b4a54] transition-colors">
                    🏷️ Tags
                  </button>
                  {showTagMenu && (
                    <div className="absolute top-8 right-0 z-50 w-48 rounded-xl border border-[#2a3942] shadow-xl overflow-hidden" style={{ background: "#202c33" }}>
                      <p className="text-[10px] text-[#8696a0] uppercase px-3 pt-2 pb-1">Adicionar tag</p>
                      {tags.length === 0 && (
                        <p className="text-xs text-[#8696a0] px-3 pb-3">Sem tags. Crie em configurações.</p>
                      )}
                      {tags.map(tag => {
                        const hasTag = (active.tags ?? []).includes(tag.name);
                        return (
                          <button key={tag.id}
                            onClick={() => toggleTag(active.id, tag.name, active.tags ?? [])}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2a3942] text-left transition-colors">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: tag.color }} />
                            <span className="text-sm text-white flex-1">{tag.name}</span>
                            {hasTag && <span className="text-[#25d366] text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button onClick={() => setShowAiPanel(!showAiPanel)}
                  className={cn("p-2 rounded-full transition-colors", showAiPanel ? "bg-[#25d366] text-black" : "hover:bg-[#2a3942] text-[#aebac1]")}>
                  <Sparkles className="h-5 w-5" />
                </button>
                <button onClick={() => setShowSearchMsg(!showSearchMsg)}
                  className={cn("p-2 rounded-full transition-colors", showSearchMsg ? "bg-[#2a3942] text-[#25d366]" : "hover:bg-[#2a3942] text-[#aebac1]")}>
                  <Search className="h-5 w-5" />
                </button>
                {/* Menu de contexto */}
                <div className="relative group">
                  <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1]"><MoreVertical className="h-5 w-5" /></button>
                  <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-[#2a3942] shadow-xl overflow-hidden hidden group-hover:block" style={{ background: "#202c33" }}>
                    {[
                      { label: "Ver histórico do contato", action: () => loadHistory(active.phone) },
                      { label: "Marcar como não lido",     action: () => markUnread(active.id) },
                      { label: "Exportar conversa",        action: () => exportConversation(active) },
                      { label: active.blocked ? "Desbloquear contato" : "Bloquear contato", action: () => toggleBlock(active), danger: true },
                      { label: "Excluir conversa", action: () => deleteConversation(active.id), danger: true },
                    ].map(item => (
                      <button key={item.label} onClick={item.action}
                        className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-[#2a3942] transition-colors", item.danger ? "text-red-400" : "text-white")}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Painel de ferramentas IA — expandido */}
            {showAiPanel && (
              <div className="border-b border-[#2a3942] max-h-[50vh] overflow-y-auto" style={{ background: "#182229" }}>
                {/* Linha 1: ações rápidas */}
                <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b border-[#2a3942]/60">
                  <span className="text-[#8696a0] text-xs font-medium mr-1">Ferramentas IA:</span>
                  <button disabled={aiBusy !== null} onClick={() => doSummary()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                    {aiBusy === "summary" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScrollText className="h-3 w-3 text-[#53bdeb]" />}
                    Resumir
                  </button>
                  <button disabled={aiBusy !== null} onClick={() => doTasks()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                    {aiBusy === "tasks" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListChecks className="h-3 w-3 text-[#f0c040]" />}
                    Extrair tarefas
                  </button>
                  <button disabled={aiBusy !== null} onClick={() => doSentiment()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                    {aiBusy === "sentiment" ? <Loader2 className="h-3 w-3 animate-spin" /> : <SmileIcon className="h-3 w-3 text-[#25d366]" />}
                    Sentimento
                  </button>
                  <button disabled={aiBusy !== null} onClick={async () => {
                    setAiBusy("reply");
                    try { await qualifierReplyFn({ data: { conversationId: active.id } }); toast.success("IA respondeu!"); }
                    catch (e: any) { toast.error(e.message); } finally { setAiBusy(null); }
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                    <Sparkles className="h-3 w-3 text-[#f0c040]" />
                    {aiBusy === "qual" ? "Qualificando..." : "Qualificar + Proposta"}
                  </button>
                  <button onClick={() => setShowAiPanel(false)} className="ml-auto p-1 text-[#8696a0] hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </div>

                {/* Resultados */}
                <div className="px-4 py-3 space-y-3">
                  {aiSentiment && (
                    <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#0f1a20" }}>
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
                      <p className="text-xs text-[#aebac1]">{aiSentiment.reason}</p>
                    </div>
                  )}

                  {aiSummary && (
                    <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#0f1a20" }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ScrollText className="h-3.5 w-3.5 text-[#53bdeb]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Resumo</span>
                      </div>
                      <p className="text-xs text-white whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                    </div>
                  )}

                  {aiTasks.length > 0 && (
                    <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#0f1a20" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <ListChecks className="h-3.5 w-3.5 text-[#f0c040]" />
                        <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Tarefas identificadas</span>
                      </div>
                      <ul className="space-y-1.5">
                        {aiTasks.map((t, i) => (
                          <li key={i} className="text-xs text-white flex items-start gap-2">
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
                  <div className="rounded-lg p-3 border border-[#2a3942]" style={{ background: "#0f1a20" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-3.5 w-3.5 text-[#aebac1]" />
                      <span className="text-[10px] uppercase tracking-wide text-[#8696a0]">Busca inteligente</span>
                    </div>
                    <div className="flex gap-2">
                      <input value={aiSearchQ} onChange={e => setAiSearchQ(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && doSearch()}
                        placeholder='ex: "qual o endereço que ele mandou?"'
                        className="flex-1 bg-[#2a3942] border border-[#3b4a54] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#25d366]" />
                      <button onClick={doSearch} disabled={aiBusy !== null || !aiSearchQ.trim()}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#25d366] text-black hover:bg-[#20ba5a] disabled:opacity-50">
                        {aiBusy === "search" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
                      </button>
                    </div>
                    {aiSearchResults.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {aiSearchResults.map(r => (
                          <li key={r.id} className="text-xs text-[#aebac1] border-l-2 border-[#25d366] pl-2 py-0.5">
                            <span className="text-[10px] text-[#8696a0]">{r.direction === "inbound" ? "Cliente" : "Atendente"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}:</span>
                            <p className="text-white">{r.content}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
              {grouped.length === 0 && (
                <div className="flex justify-center py-8">
                  <span className="px-3 py-1.5 rounded-lg text-xs text-[#8696a0]" style={{ background: "rgba(0,0,0,0.3)" }}>Nenhuma mensagem ainda</span>
                </div>
              )}
              {grouped.map(group => (
                <div key={group.date}>
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 rounded-lg text-xs text-[#8696a0] font-medium" style={{ background: "#182229" }}>{group.date}</span>
                  </div>
                  {group.messages.map(m => (
                    <div key={m.id} className={cn("flex mb-1", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[65%] rounded-lg text-sm overflow-hidden", m.direction === "outbound" ? "rounded-tr-none" : "rounded-tl-none")}
                        style={{ background: m.direction === "outbound" ? "#005c4b" : "#202c33" }}>

                        {/* IMAGEM */}
                        {m.media_type === "image" && m.media_url && (
                          <a href={proxyUrl(m) ?? "#"} target="_blank" rel="noreferrer">
                            <img src={proxyUrl(m) ?? ""} alt="imagem" className="max-w-full block" style={{ maxHeight: 280, minWidth: 160 }}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </a>
                        )}
                        {m.media_type === "image" && !m.media_url && (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Image className="h-5 w-5 text-white/50" />
                            <span className="text-white/60 text-xs">Imagem</span>
                          </div>
                        )}

                        {/* ÁUDIO — player nativo */}
                        {m.media_type === "audio" && m.media_url && (
                          <div className="px-2 py-2 space-y-1">
                            <audio controls src={proxyUrl(m) ?? ""} className="h-8 w-48" style={{ filter: "invert(0.8)" }} />
                            {m.transcription ? (
                              <p className="text-white/90 text-[12px] leading-snug bg-black/20 rounded p-2 whitespace-pre-wrap">
                                <span className="text-white/40 text-[10px] block mb-0.5">Transcrição</span>
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
                                className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center gap-1">
                                {transcribingId === m.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ScrollText className="h-2.5 w-2.5" />}
                                {transcribingId === m.id ? "Transcrevendo..." : "Transcrever"}
                              </button>
                            )}
                          </div>
                        )}
                        {m.media_type === "audio" && !m.media_url && (
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                              <Mic className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <div className="flex gap-0.5 items-end h-5">
                                {[3,5,4,6,3,5,4,3,5,6,4,3].map((h,i) => (
                                  <div key={i} className="w-0.5 rounded-full bg-white/40" style={{ height: h*3 }} />
                                ))}
                              </div>
                              <p className="text-[10px] text-white/50 mt-0.5">Áudio</p>
                            </div>
                          </div>
                        )}

                        {/* VÍDEO */}
                        {m.media_type === "video" && m.media_url && (
                          <video controls src={proxyUrl(m) ?? ""} className="max-w-full block" style={{ maxHeight: 280, minWidth: 160 }} />
                        )}
                        {m.media_type === "video" && !m.media_url && (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Video className="h-5 w-5 text-white/50" />
                            <span className="text-white/60 text-xs">Vídeo</span>
                          </div>
                        )}

                        {/* DOCUMENTO */}
                        {m.media_type === "document" && (
                          <div className="flex items-center gap-3 px-3 py-2.5" style={{ minWidth: 200 }}>
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
                              <FileText className="h-5 w-5 text-white/70" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{m.content || "Documento"}</p>
                              <p className="text-white/40 text-[10px]">Documento</p>
                            </div>
                            {m.media_url && (
                              <a href={proxyUrl(m) ?? "#"} target="_blank" rel="noreferrer"
                                className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* TEXTO */}
                        {m.content && m.media_type !== "document" && (
                          <p className="text-white leading-relaxed whitespace-pre-wrap break-words px-3 py-2">{m.content}</p>
                        )}
                        {!m.content && !m.media_type && (
                          <p className="text-white/30 text-xs px-3 py-2 italic">Mensagem</p>
                        )}

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 justify-end px-2 pb-1.5 -mt-1">
                          <span className="text-[10px] text-[#8696a0]">{formatMsgTime(m.created_at)}</span>
                          {m.direction === "outbound" && (
                            <span title={(m as any).read_at ? "Lido" : (m as any).delivered_at ? "Entregue" : "Enviado"}>
                              {(m as any).read_at
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
              <div className="px-4 py-2 flex items-center gap-2 border-b border-[#2a3942]" style={{ background: "#1a262e" }}>
                <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
                <input autoFocus
                  className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none"
                  placeholder="Buscar nas mensagens..."
                  value={searchMsg} onChange={e => setSearchMsg(e.target.value)} />
                <button onClick={() => { setShowSearchMsg(false); setSearchMsg(""); }}
                  className="text-[#8696a0] hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            )}

            {/* Quick Replies */}
            {showQuickReplies && (
              <div className="border-t border-[#2a3942] px-3 py-2" style={{ background: "#1a262e" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[#25d366] text-xs font-medium">⚡ Respostas rápidas</span>
                  <input
                    className="flex-1 bg-[#2a3942] rounded px-2 py-1 text-xs text-white placeholder-[#8696a0] outline-none"
                    placeholder="Buscar..." value={quickSearch} onChange={e => setQuickSearch(e.target.value)} autoFocus />
                  <button onClick={() => { setShowQuickReplies(false); setQuickSearch(""); }}
                    className="text-[#8696a0] hover:text-white"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {quickReplies
                    .filter(r => quickSearch === "" || r.shortcut.includes(quickSearch) || r.message.toLowerCase().includes(quickSearch.toLowerCase()))
                    .map(r => (
                      <button key={r.id} onClick={() => insertQuickReply(r.message)}
                        className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-[#2a3942] text-left transition-colors">
                        <span className="text-[#25d366] text-xs font-mono shrink-0">/{r.shortcut}</span>
                        <span className="text-white/80 text-xs truncate">{r.message}</span>
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
              <div className="px-4 pt-2 pb-1 shrink-0 border-t border-[#2a3942]/50" style={{ background: "#1a262e" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="h-3 w-3 text-[#25d366]" />
                  <span className="text-[10px] text-[#8696a0] uppercase tracking-wide">Sugestões</span>
                  <select value={tone} onChange={e => doSuggest(e.target.value as any)}
                    className="text-[10px] bg-[#2a3942] border border-[#3b4a54] rounded px-1.5 py-0.5 text-[#aebac1] outline-none">
                    <option value="amigavel">Amigável</option>
                    <option value="formal">Formal</option>
                    <option value="casual">Casual</option>
                    <option value="persuasivo">Persuasivo</option>
                  </select>
                  <button onClick={() => setSuggestions([])} className="ml-auto text-[10px] text-[#8696a0] hover:text-white">Limpar</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {aiBusy === "suggest" && <span className="text-xs text-[#8696a0] flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Gerando...</span>}
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setText(s); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-full bg-[#2a3942] hover:bg-[#3b4a54] text-white border border-[#3b4a54] text-left max-w-md">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 flex items-end gap-2 shrink-0" style={{ background: "#202c33" }}>
              {/* Quick Replies button */}
              <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                title="Respostas rápidas (⚡)"
                className={cn("p-2 shrink-0 transition-colors", showQuickReplies ? "text-[#25d366]" : "text-[#aebac1] hover:text-[#25d366]")}>
                <Zap className="h-5 w-5" />
              </button>
              <button onClick={() => doSuggest()} disabled={aiBusy !== null}
                title="Sugerir 3 respostas"
                className="p-2 text-[#aebac1] hover:text-[#25d366] shrink-0 disabled:opacity-50">
                {aiBusy === "suggest" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </button>
              <div className="flex-1 rounded-lg px-3 py-2 flex flex-col gap-1" style={{ background: "#2a3942" }}>
                <textarea ref={textareaRef}
                  className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none resize-none leading-relaxed"
                  style={{ height: "40px", maxHeight: "120px" }}
                  placeholder={active.ai_paused ? "Você está no controle — IA pausada" : "Digite uma mensagem"}
                  value={text} onChange={handleTextChange} onKeyDown={handleKeyDown} rows={1} />
                {/* Barra de reescrita inline */}
                {text.trim().length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-[#3b4a54]/50">
                    <span className="text-[9px] text-[#8696a0] uppercase tracking-wide mr-1">Reescrever:</span>
                    {(["curta", "clara", "profissional", "persuasiva"] as const).map(s => (
                      <button key={s} onClick={() => doRewrite(s)} disabled={aiBusy !== null}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#3b4a54] hover:bg-[#4a5a64] text-[#aebac1] hover:text-white disabled:opacity-50">
                        {aiBusy === "rewrite" ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : <Wand2 className="h-2.5 w-2.5 inline mr-0.5" />} {s}
                      </button>
                    ))}
                    <button onClick={doTranslate} disabled={aiBusy !== null}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#3b4a54] hover:bg-[#4a5a64] text-[#aebac1] hover:text-white disabled:opacity-50">
                      {aiBusy === "translate" ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : <Languages className="h-2.5 w-2.5 inline mr-0.5" />} traduzir
                    </button>
                  </div>
                )}
              </div>

              {/* Preview do áudio gravado */}
              {recorder.audioBlob && !recorder.recording && (
                <div className="px-4 py-2 flex items-center gap-3 border-t border-[#2a3942]" style={{ background: "#1a262e" }}>
                  <audio controls src={URL.createObjectURL(recorder.audioBlob)} className="h-8 flex-1" style={{ filter: "invert(0.7)" }} />
                  <button onClick={recorder.cancel} className="text-red-400 hover:text-red-300 p-1"><X className="h-4 w-4" /></button>
                  <button onClick={sendRecordedAudio} disabled={sendingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-black"
                    style={{ background: "#25d366" }}>
                    {sendingAudio ? "Enviando..." : <><Send className="h-3.5 w-3.5" /> Enviar</>}
                  </button>
                </div>
              )}

              {/* Botão Send/Mic/Gravando */}
              <button
                title="Gerar áudio com IA (ElevenLabs)"
                onClick={() => { setTtsText(text); setTtsBlob(null); setTtsOpen(true); }}
                className="p-2.5 rounded-full flex items-center justify-center shrink-0 hover:bg-[#2a3942] text-violet-400">
                <Sparkles className="h-5 w-5" />
              </button>
              {recorder.recording ? (
                <button onClick={recorder.stop}
                  className="p-2.5 rounded-full flex items-center justify-center shrink-0 animate-pulse"
                  style={{ background: "#ef4444" }}>
                  <span className="text-white text-xs font-bold">{recorder.duration}s</span>
                </button>
              ) : (
                <button
                  onClick={text.trim() ? handleSend : recorder.start}
                  className="p-2.5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "#25d366" }}>
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
          <div className="w-96 max-h-[80vh] rounded-2xl border border-[#2a3942] overflow-hidden flex flex-col" style={{ background: "#202c33" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3942]">
              <p className="text-white font-medium">Histórico — {active.contact_name || active.phone}</p>
              <button onClick={() => setShowHistory(false)} className="text-[#8696a0] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {historyConvs.length === 0 && (
                <p className="text-center text-[#8696a0] text-sm py-8">Nenhum histórico encontrado</p>
              )}
              {historyConvs.map(c => (
                <button key={c.id} onClick={() => { setActiveId(c.id); setShowHistory(false); }}
                  className="w-full flex items-start gap-3 px-4 py-3 border-b border-[#2a3942] hover:bg-[#2a3942] text-left transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-white font-medium">
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
        <LeadPanel conv={active} onClose={() => setShowLeadPanel(false)} />
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
