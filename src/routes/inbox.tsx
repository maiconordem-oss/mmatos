import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Search, MoreVertical, Phone, Video, Smile, Paperclip, Mic, Bot, Sparkles, MessageSquare, Check, CheckCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { qualifierReply, extractQualification, generateProposal } from "@/server/ai-agent.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Inbox WhatsApp — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <InboxPage />
    </AuthGate>
  ),
});

type Conversation = {
  id: string;
  phone: string;
  contact_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  created_at: string;
  status?: string;
  media_type?: string | null;
  media_url?: string | null;
};

function avatar(name: string | null, phone: string) {
  const label = name ? name[0].toUpperCase() : phone[0];
  const colors = ["#25D366","#128C7E","#075E54","#34B7F1","#00BCD4","#8BC34A","#FF9800","#E91E63"];
  const idx = (name || phone).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return { label, color: colors[idx] };
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
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
    const d = new Date(m.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    let label = diffDays === 0 ? "Hoje" : diffDays === 1 ? "Ontem" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (label !== current) { groups.push({ date: label, messages: [] }); current = label; }
    groups[groups.length - 1].messages.push(m);
  }
  return groups;
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const qualifierReplyFn = useAuthServerFn(qualifierReply);
  const extractQualificationFn = useAuthServerFn(extractQualification);
  const generateProposalFn = useAuthServerFn(generateProposal);

  const loadConvs = async () => {
    const { data } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
    setConversations((data ?? []) as Conversation[]);
  };

  useEffect(() => { loadConvs(); }, []);

  // Realtime: new conversations
  useEffect(() => {
    const ch = supabase.channel("convs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConvs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    supabase.from("messages").select("*").eq("conversation_id", activeId).order("created_at").then(({ data }) => {
      setMessages((data ?? []) as Message[]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    // Mark as read
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);

    const channel = supabase.channel(`msgs:${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    if (data) setActiveId(data.id);
  };

  const handleSend = async () => {
    if (!user || !activeId || !text.trim()) return;
    const content = text.trim();
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "40px";
    const { error } = await supabase.from("messages").insert({
      user_id: user.id, conversation_id: activeId,
      direction: "outbound", content, status: "sent",
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 80),
    }).eq("id", activeId);
    loadConvs();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "40px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const active = conversations.find((c) => c.id === activeId);
  const filtered = conversations.filter((c) =>
    (c.contact_name || c.phone).toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(messages);

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "#111b21" }}>
      <Toaster />

      {/* ── SIDEBAR ── */}
      <div className="w-[380px] flex flex-col border-r border-[#2a3942] shrink-0" style={{ background: "#111b21" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: "#202c33" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: "#25d366" }}>
              {user?.email?.[0]?.toUpperCase() ?? "M"}
            </div>
            <span className="text-white font-medium text-sm">Lex CRM</span>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors">
                  <Plus className="h-5 w-5" />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[#202c33] border-[#2a3942] text-white">
                <DialogHeader><DialogTitle className="text-white">Nova conversa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Telefone *</label>
                    <input className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#25d366]" placeholder="+5511..." value={newConv.phone} onChange={(e) => setNewConv({ ...newConv, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-[#8696a0] mb-1 block">Nome do contato</label>
                    <input className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#25d366]" value={newConv.contact_name} onChange={(e) => setNewConv({ ...newConv, contact_name: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <button onClick={handleNewConv} className="bg-[#25d366] hover:bg-[#20ba5a] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Criar</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2" style={{ background: "#111b21" }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#202c33" }}>
            <Search className="h-4 w-4 text-[#8696a0] shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none"
              placeholder="Pesquisar ou começar nova conversa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-[#8696a0] text-sm">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              Nenhuma conversa
            </div>
          )}
          {filtered.map((c) => {
            const av = avatar(c.contact_name, c.phone);
            const isActive = activeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-[#2a3942] hover:bg-[#2a3942] transition-colors text-left", isActive && "bg-[#2a3942]")}
              >
                <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: av.color }}>
                  {av.label}
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

      {/* ── CHAT AREA ── */}
      <div className="flex-1 flex flex-col" style={{ background: "#0b141a" }}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0]">
            <div
              className="h-24 w-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: "rgba(37,211,102,0.1)", border: "2px solid rgba(37,211,102,0.2)" }}
            >
              <MessageSquare className="h-10 w-10" style={{ color: "#25d366" }} />
            </div>
            <h2 className="text-white text-xl font-light mb-2">Lex CRM — WhatsApp</h2>
            <p className="text-sm text-center max-w-xs">Selecione uma conversa para começar o atendimento ou crie uma nova.</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#202c33" }}>
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ background: avatar(active.contact_name, active.phone).color }}>
                {avatar(active.contact_name, active.phone).label}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{active.contact_name || active.phone}</p>
                <p className="text-[#8696a0] text-xs">{active.phone}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    const nowPaused = (active as any).ai_paused;
                    await supabase.from("conversations").update({ ai_paused: !nowPaused }).eq("id", active.id);
                    loadConvs();
                    toast.success(nowPaused ? "IA retomada" : "IA pausada — você está no controle");
                  }}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors", (active as any).ai_paused ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-[#2a3942] text-[#25d366] hover:bg-[#3b4a54]")}
                  title={(active as any).ai_paused ? "Clique para reativar a IA" : "Clique para pausar a IA e atender manualmente"}
                >
                  <Bot className="h-3.5 w-3.5" />
                  {(active as any).ai_paused ? "IA pausada" : "IA ativa"}
                </button>
                <button onClick={() => setShowAiPanel(!showAiPanel)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors", showAiPanel ? "bg-[#25d366] text-black" : "bg-[#2a3942] text-[#aebac1] hover:bg-[#3b4a54]")}>
                  <Sparkles className="h-3.5 w-3.5" /> Ferramentas
                </button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors"><Phone className="h-5 w-5" /></button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors"><Video className="h-5 w-5" /></button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors"><Search className="h-5 w-5" /></button>
                <button className="p-2 rounded-full hover:bg-[#2a3942] text-[#aebac1] transition-colors"><MoreVertical className="h-5 w-5" /></button>
              </div>
            </div>

            {/* AI Panel */}
            {showAiPanel && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a3942] flex-wrap" style={{ background: "#182229" }}>
                <span className="text-[#8696a0] text-xs font-medium mr-1">Agentes IA:</span>
                <button
                  disabled={aiBusy !== null}
                  onClick={async () => {
                    setAiBusy("reply");
                    try { await qualifierReplyFn({ data: { conversationId: active.id } }); toast.success("IA respondeu!"); }
                    catch (e: any) { toast.error(e.message); }
                    finally { setAiBusy(null); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50 transition-colors"
                >
                  <Bot className="h-3 w-3 text-[#25d366]" />
                  {aiBusy === "reply" ? "Respondendo..." : "Responder como Dr. Maicon"}
                </button>
                <button
                  disabled={aiBusy !== null}
                  onClick={async () => {
                    setAiBusy("qual");
                    try {
                      const r = await extractQualificationFn({ data: { conversationId: active.id } });
                      toast.success(`Qualificado: ${r.qualification.legal_area} — score ${r.qualification.score}`);
                      if (r.qualification.qualified) {
                        const p = await generateProposalFn({ data: { qualificationId: r.qualification.id } });
                        toast.success(`Proposta criada: R$ ${Number(p.proposal.value).toLocaleString("pt-BR")}`);
                        navigate({ to: "/contratos" });
                      }
                    } catch (e: any) { toast.error(e.message); }
                    finally { setAiBusy(null); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a3942] text-white hover:bg-[#3b4a54] disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="h-3 w-3 text-[#f0c040]" />
                  {aiBusy === "qual" ? "Qualificando..." : "Qualificar + Proposta"}
                </button>
                <button onClick={() => setShowAiPanel(false)} className="ml-auto p-1 text-[#8696a0] hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
              {grouped.length === 0 && (
                <div className="flex justify-center py-8">
                  <span className="px-3 py-1.5 rounded-lg text-xs text-[#8696a0]" style={{ background: "rgba(0,0,0,0.3)" }}>
                    Nenhuma mensagem ainda
                  </span>
                </div>
              )}
              {grouped.map((group) => (
                <div key={group.date}>
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 rounded-lg text-xs text-[#8696a0] font-medium" style={{ background: "#182229" }}>
                      {group.date}
                    </span>
                  </div>
                  {group.messages.map((m) => (
                    <div key={m.id} className={cn("flex mb-1", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn("max-w-[65%] px-3 py-2 rounded-lg text-sm relative", m.direction === "outbound" ? "rounded-tr-none" : "rounded-tl-none")}
                        style={{ background: m.direction === "outbound" ? "#005c4b" : "#202c33" }}
                      >
                        {/* Mídia */}
                        {(m as any).media_type === "audio" && (
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                              <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
                            </div>
                            <div className="flex-1">
                              <div className="h-1.5 rounded-full w-24 opacity-40" style={{ background: "white" }} />
                              <p className="text-[10px] text-white/60 mt-0.5">Áudio</p>
                            </div>
                          </div>
                        )}
                        {(m as any).media_type === "image" && (m as any).media_url && (
                          <img src={(m as any).media_url} alt="imagem" className="rounded mb-1 max-w-full" style={{ maxHeight: 200 }} />
                        )}
                        <p className="text-white leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                        <div className="flex items-center gap-1 justify-end mt-1">
                          <span className="text-[10px] text-[#8696a0]">{formatMsgTime(m.created_at)}</span>
                          {m.direction === "outbound" && (
                            m.status === "read"
                              ? <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                              : <CheckCheck className="h-3 w-3 text-[#8696a0]" />
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
              <button className="p-2 text-[#aebac1] hover:text-white transition-colors shrink-0"><Smile className="h-6 w-6" /></button>
              <button className="p-2 text-[#aebac1] hover:text-white transition-colors shrink-0"><Paperclip className="h-6 w-6" /></button>
              <div className="flex-1 rounded-lg px-4 py-2 flex items-end" style={{ background: "#2a3942" }}>
                <textarea
                  ref={textareaRef}
                  className="flex-1 bg-transparent text-sm text-white placeholder-[#8696a0] outline-none resize-none leading-relaxed"
                  style={{ height: "40px", maxHeight: "120px" }}
                  placeholder="Digite uma mensagem"
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
              </div>
              <button
                onClick={text.trim() ? handleSend : undefined}
                className="p-2.5 rounded-full flex items-center justify-center shrink-0 transition-all"
                style={{ background: "#25d366" }}
              >
                {text.trim() ? <Send className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
