import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Search, MoreVertical, Phone, Video, Smile, Paperclip, Mic, Bot, Sparkles, MessageSquare, CheckCheck, X, ChevronRight, User, FileText, Clock, Wand2, Languages, Smile as SmileIcon, ListChecks, ScrollText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { qualifierReply, extractQualification, generateProposal } from "@/server/ai-agent.functions";
import {
  suggestReplies, rewriteMessage, summarizeConversation,
  extractTasks, translateText, analyzeSentiment, semanticSearch,
} from "@/server/inbox-ai.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Badge } from "@/components/ui/badge";

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
};

type Message = {
  id: string; direction: "inbound" | "outbound";
  content: string | null; created_at: string; status?: string;
  media_type?: string | null; media_url?: string | null;
};

type FunnelState = {
  fase: string;
  dados: Record<string, any>;
  midias_enviadas: string[];
  funnels: { name: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────
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
            <p className="text-[#8696a0] text-xs">{conv.phone}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {conv.ai_paused
                ? <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30">IA pausada</Badge>
                : <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">IA ativa</Badge>
              }
            </div>
          </div>
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.from("conversations").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setConversations((data ?? []) as Conversation[]);
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // Realtime conversas
  useEffect(() => {
    const ch = supabase.channel("convs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, loadConvs)
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
    const { data, error } = await supabase.from("conversations").insert({
      user_id: user.id, phone: newConv.phone,
      contact_name: newConv.contact_name || null, status: "open",
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpen(false); setNewConv({ phone: "", contact_name: "" });
    loadConvs();
    if (data) { setActiveId(data.id); setShowLeadPanel(true); }
  };

  const handleSend = async () => {
    if (!user || !activeId || !text.trim()) return;
    const content = text.trim();
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "40px";

    // Salvar no banco
    await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content, status: "sent",
    });
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 80),
    }).eq("id", activeId);

    // Enviar via Evolution API
    const { data: conv } = await supabase.from("conversations").select("phone").eq("id", activeId).single();
    const { data: inst } = await supabase
      .from("whatsapp_instances").select("*")
      .eq("user_id", user.id).eq("status", "connected").limit(1).maybeSingle();

    if (conv?.phone && inst?.api_url && inst?.api_key) {
      const number = conv.phone.replace(/\D/g, "");
      fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({ number, text: content, textMessage: { text: content }, options: { delay: 500 } }),
      }).catch(e => console.error("send manual error:", e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
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
  const filtered = conversations.filter(c =>
    (c.contact_name || c.phone).toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(messages);

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

        {/* Busca */}
        <div className="px-3 py-2" style={{ background: "#111b21" }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#202c33" }}>
            <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
            <input className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none"
              placeholder="Pesquisar conversas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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
                  <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: av.color }}>
                    {av.label}
                  </div>
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
                    <span className={cn("text-xs shrink-0 ml-2", c.unread_count > 0 ? "text-[#25d366]" : "text-[#8696a0]")}>
                      {c.last_message_at ? formatTime(c.last_message_at) : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-[#8696a0] text-xs truncate">{c.last_message_preview || "Sem mensagens"}</p>
                    {c.unread_count > 0 && (
                      <span className="ml-2 shrink-0 h-5 min-w-5 px-1 rounded-full bg-[#25d366] text-black text-xs font-bold flex items-center justify-center">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
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
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: avatar(active.contact_name, active.phone).color }}>
                {avatar(active.contact_name, active.phone).label}
              </div>
              <button className="flex-1 text-left" onClick={() => setShowLeadPanel(!showLeadPanel)}>
                <p className="text-white font-medium text-sm">{active.contact_name || active.phone}</p>
                <p className="text-[#8696a0] text-xs">{active.phone} · clique para ver ficha</p>
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
                <button onClick={() => setShowAiPanel(!showAiPanel)}
                  className={cn("p-2 rounded-full transition-colors", showAiPanel ? "bg-[#25d366] text-black" : "hover:bg-[#2a3942] text-[#aebac1]")}>
                  <Sparkles className="h-5 w-5" />
                </button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1]"><Search className="h-5 w-5" /></button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1]"><MoreVertical className="h-5 w-5" /></button>
              </div>
            </div>

            {/* Painel de ferramentas IA */}
            {showAiPanel && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a3942] flex-wrap" style={{ background: "#182229" }}>
                <span className="text-[#8696a0] text-xs font-medium mr-1">Ferramentas IA:</span>
                <button disabled={aiBusy !== null}
                  onClick={async () => {
                    setAiBusy("reply");
                    try { await qualifierReplyFn({ data: { conversationId: active.id } }); toast.success("IA respondeu!"); }
                    catch (e: any) { toast.error(e.message); }
                    finally { setAiBusy(null); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                  <Bot className="h-3 w-3 text-[#25d366]" />
                  {aiBusy === "reply" ? "Respondendo..." : "Responder como Dr. Maicon"}
                </button>
                <button disabled={aiBusy !== null}
                  onClick={async () => {
                    setAiBusy("qual");
                    try {
                      const r = await extractQualificationFn({ data: { conversationId: active.id } });
                      toast.success(`Score: ${r.qualification.score}`);
                      if (r.qualification.qualified) {
                        const p = await generateProposalFn({ data: { qualificationId: r.qualification.id } });
                        toast.success(`Proposta: R$ ${Number(p.proposal.value).toLocaleString("pt-BR")}`);
                      }
                    } catch (e: any) { toast.error(e.message); }
                    finally { setAiBusy(null); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50">
                  <Sparkles className="h-3 w-3 text-[#f0c040]" />
                  {aiBusy === "qual" ? "Qualificando..." : "Qualificar + Proposta"}
                </button>
                <button onClick={() => setShowAiPanel(false)} className="ml-auto p-1 text-[#8696a0] hover:text-white"><X className="h-3.5 w-3.5" /></button>
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
                      <div className={cn("max-w-[65%] px-3 py-2 rounded-lg text-sm", m.direction === "outbound" ? "rounded-tr-none" : "rounded-tl-none")}
                        style={{ background: m.direction === "outbound" ? "#005c4b" : "#202c33" }}>
                        {m.media_type === "audio" && (
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                              <Mic className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="h-1 rounded-full opacity-40 bg-white w-24" />
                              <p className="text-[10px] text-white/60 mt-0.5">Áudio</p>
                            </div>
                          </div>
                        )}
                        {m.media_type === "image" && m.media_url && (
                          <img src={m.media_url} alt="img" className="rounded mb-1 max-w-full" style={{ maxHeight: 200 }} />
                        )}
                        <p className="text-white leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                        <div className="flex items-center gap-1 justify-end mt-1">
                          <span className="text-[10px] text-[#8696a0]">{formatMsgTime(m.created_at)}</span>
                          {m.direction === "outbound" && (
                            <CheckCheck className={cn("h-3 w-3", m.status === "read" ? "text-[#53bdeb]" : "text-[#8696a0]")} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 flex items-end gap-3 shrink-0" style={{ background: "#202c33" }}>
              <button className="p-2 text-[#aebac1] hover:text-white shrink-0"><Smile className="h-6 w-6" /></button>
              <button className="p-2 text-[#aebac1] hover:text-white shrink-0"><Paperclip className="h-6 w-6" /></button>
              <div className="flex-1 rounded-lg px-4 py-2 flex items-end" style={{ background: "#2a3942" }}>
                <textarea ref={textareaRef}
                  className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none resize-none leading-relaxed"
                  style={{ height: "40px", maxHeight: "120px" }}
                  placeholder={active.ai_paused ? "Você está no controle — IA pausada" : "Digite uma mensagem"}
                  value={text} onChange={handleTextChange} onKeyDown={handleKeyDown} rows={1} />
              </div>
              <button onClick={text.trim() ? handleSend : undefined}
                className="p-2.5 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#25d366" }}>
                {text.trim() ? <Send className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── PAINEL LATERAL DO LEAD ── */}
      {active && showLeadPanel && (
        <LeadPanel conv={active} onClose={() => setShowLeadPanel(false)} />
      )}
    </div>
  );
}
