import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, MessageSquare, Bot, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { qualifierReply, extractQualification, generateProposal } from "@/server/ai-agent.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { useNavigate } from "@tanstack/react-router";

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
};

function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [newConv, setNewConv] = useState({ phone: "", contact_name: "" });

  const qualifierReplyFn = useAuthServerFn(qualifierReply);
  const extractQualificationFn = useAuthServerFn(extractQualification);
  const generateProposalFn = useAuthServerFn(generateProposal);

  const loadConvs = async () => {
    const { data } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
    setConversations((data ?? []) as Conversation[]);
  };

  useEffect(() => { loadConvs(); }, []);

  useEffect(() => {
    if (!activeId) return;
    supabase.from("messages").select("*").eq("conversation_id", activeId).order("created_at").then(({ data }) => {
      setMessages((data ?? []) as Message[]);
    });
    const channel = supabase
      .channel(`messages:${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId]);

  const handleNewConv = async () => {
    if (!user || !newConv.phone) return;
    const { data, error } = await supabase.from("conversations").insert({
      user_id: user.id,
      phone: newConv.phone,
      contact_name: newConv.contact_name || null,
      status: "open",
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    setNewConv({ phone: "", contact_name: "" });
    loadConvs();
    if (data) setActiveId(data.id);
  };

  const handleSend = async () => {
    if (!user || !activeId || !text.trim()) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      conversation_id: activeId,
      direction: "outbound",
      content,
      status: "sent",
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 80),
    }).eq("id", activeId);
    loadConvs();
  };

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="h-full flex">
      <Toaster />
      <aside className="w-80 border-r flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold">Conversas</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4" /></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova conversa</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Telefone (WhatsApp) *</Label><Input placeholder="+5511..." value={newConv.phone} onChange={(e) => setNewConv({ ...newConv, phone: e.target.value })} /></div>
                <div><Label>Nome do contato</Label><Input value={newConv.contact_name} onChange={(e) => setNewConv({ ...newConv, contact_name: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={handleNewConv}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma conversa.</p>}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "w-full text-left p-4 border-b hover:bg-muted/50 transition-colors",
                activeId === c.id && "bg-muted",
              )}
            >
              <div className="flex justify-between items-center mb-1">
                <p className="font-medium text-sm truncate">{c.contact_name || c.phone}</p>
                {c.last_message_at && <span className="text-xs text-muted-foreground shrink-0 ml-2">{new Date(c.last_message_at).toLocaleDateString("pt-BR")}</span>}
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.last_message_preview || "Sem mensagens"}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex-1 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Selecione uma conversa</p>
              <p className="text-xs mt-2">Twilio WhatsApp pode ser conectado depois para envio real</p>
            </div>
          </div>
        ) : (
          <>
            <header className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold">{active.contact_name || active.phone}</h2>
                <p className="text-xs text-muted-foreground">{active.phone}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={aiBusy !== null} onClick={async () => {
                  setAiBusy("reply");
                  try { await qualifierReplyFn({ data: { conversationId: active.id } }); toast.success("IA respondeu"); }
                  catch (e: any) { toast.error(e.message); }
                  finally { setAiBusy(null); }
                }}><Bot className="h-3 w-3 mr-1" /> {aiBusy === "reply" ? "..." : "IA responder"}</Button>
                <Button size="sm" variant="outline" disabled={aiBusy !== null} onClick={async () => {
                  setAiBusy("qual");
                  try {
                    const r = await extractQualificationFn({ data: { conversationId: active.id } });
                    toast.success(`Qualificado: ${r.qualification.legal_area} (score ${r.qualification.score})`);
                    if (r.qualification.qualified) {
                      const p = await generateProposalFn({ data: { qualificationId: r.qualification.id } });
                      toast.success(`Proposta criada: R$ ${Number(p.proposal.value).toLocaleString("pt-BR")}`);
                      navigate({ to: "/contratos" });
                    }
                  } catch (e: any) { toast.error(e.message); }
                  finally { setAiBusy(null); }
                }}><Sparkles className="h-3 w-3 mr-1" /> {aiBusy === "qual" ? "..." : "IA qualificar + proposta"}</Button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-muted/20">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-md px-4 py-2 rounded-lg text-sm",
                    m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-card border",
                  )}>
                    <p>{m.content}</p>
                    <p className={cn("text-xs mt-1", m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda.</p>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 border-t flex gap-2">
              <Input placeholder="Digite uma mensagem..." value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit"><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
