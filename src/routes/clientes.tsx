import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Mail, Phone, MessageSquare, Trash2, FileText, Image, Mic, File, ExternalLink, ChevronDown, ChevronUp, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ClientesPage />
      </AppShell>
    </AuthGate>
  ),
});

type Client = {
  id: string;
  full_name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
};

type Doc = {
  id: string;
  doc_type: string;
  label: string | null;
  file_url: string;
  media_type: string | null;
  notes: string | null;
  created_at: string;
};

const DOC_LABELS: Record<string, string> = {
  rg: "RG / CNH", cpf: "CPF", certidao_nascimento: "Certidão de Nascimento",
  comprovante_residencia: "Comprovante de Residência", protocolo: "Protocolo / Negativa",
  prescricao: "Prescrição Médica", audio: "Áudio", imagem: "Imagem", outro: "Outro",
};

function DocIcon({ type }: { type: string | null }) {
  if (type === "audio")    return <Mic className="h-4 w-4 text-violet-500" />;
  if (type === "image")    return <Image className="h-4 w-4 text-blue-500" />;
  if (type === "document") return <FileText className="h-4 w-4 text-orange-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function ClientCard({ c, onDelete }: { c: Client; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const loadDocs = async () => {
    if (docs.length > 0) { setExpanded(!expanded); return; }
    setLoadingDocs(true);
    const { data } = await supabase
      .from("client_documents").select("*")
      .eq("client_id", c.id).order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
    setLoadingDocs(false);
    setExpanded(true);
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{c.full_name}</h3>
              {c.document && <p className="text-xs text-muted-foreground">CPF: {c.document}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="space-y-1.5 text-sm">
          {c.email    && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{c.email}</div>}
          {c.phone    && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}
          {c.whatsapp && <div className="flex items-center gap-2 text-green-600"><MessageSquare className="h-3.5 w-3.5" />{c.whatsapp}</div>}
          {c.address  && <div className="flex items-center gap-2 text-muted-foreground text-xs">{c.address}</div>}
          {c.notes    && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
        </div>
      </div>

      {/* Aba de documentos */}
      <div className="border-t">
        <button
          onClick={loadDocs}
          className="w-full flex items-center justify-between px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            Documentos
            {docs.length > 0 && (
              <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
            )}
          </span>
          {loadingDocs ? (
            <span className="text-xs">Carregando...</span>
          ) : expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="px-5 pb-4 space-y-2">
            {docs.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Nenhum documento recebido ainda.
                <br />Os documentos enviados pelo WhatsApp aparecem aqui automaticamente.
              </p>
            )}
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                <DocIcon type={doc.media_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {doc.label || DOC_LABELS[doc.doc_type] || doc.doc_type}
                  </p>
                  {doc.notes && <p className="text-[10px] text-muted-foreground truncate">{doc.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                {doc.file_url && !doc.file_url.startsWith("whatsapp-media://") && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                )}
                {doc.file_url.startsWith("whatsapp-media://") && (
                  <span className="text-[10px] text-amber-600 shrink-0">Via WhatsApp</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientesPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });

  const load = async () => {
    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data ?? []) as Client[]);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!user || !form.full_name) return;
    const { error } = await supabase.from("clients").insert({ user_id: user.id, ...form });
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente criado");
    setOpen(false);
    setForm({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido"); load();
  };

  const filtered = clients.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.document ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.whatsapp ?? "").includes(search)
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Toaster />
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Ficha completa com documentos recebidos via WhatsApp
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome completo *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CPF</Label><Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>WhatsApp</Label><Input placeholder="+55..." value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
              </div>
              <div><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={handleCreate}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF, e-mail ou WhatsApp..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <ClientCard key={c.id} c={c} onDelete={() => handleDelete(c.id)} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-12">
            Nenhum cliente encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
