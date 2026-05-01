import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Users, Phone, Mail, MapPin, FileText,
  MessageSquare, Mic, Image, File, ExternalLink, ChevronDown,
  ChevronUp, Trash2, Calendar, FileSignature, X,
} from "lucide-react";

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
  id: string; full_name: string; document: string | null;
  email: string | null; phone: string | null; whatsapp: string | null;
  address: string | null; notes: string | null;
};

type Doc = {
  id: string; doc_type: string; label: string | null;
  file_url: string; media_type: string | null;
  transcription: string | null; notes: string | null; created_at: string;
};

const DOC_LABELS: Record<string, string> = {
  rg: "RG / CNH", cpf: "CPF", certidao_nascimento: "Certidão de Nascimento",
  comprovante_residencia: "Comprovante de Residência", protocolo: "Protocolo",
  prescricao: "Prescrição Médica", audio: "Áudio", imagem: "Imagem", outro: "Outro",
};

function DocIcon({ type }: { type: string | null }) {
  if (type === "audio")    return <Mic      className="h-4 w-4 text-violet-400" />;
  if (type === "image")    return <Image    className="h-4 w-4 text-blue-400" />;
  if (type === "document") return <FileText className="h-4 w-4 text-amber-400" />;
  return <File className="h-4 w-4 text-slate-500" />;
}

function ClienteDrawer({ client, onClose }: { client: Client; onClose: () => void }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab]   = useState("resumo");
  const [cases, setCases] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("client_documents").select("*").eq("client_id", client.id)
      .order("created_at", { ascending: false }).then(({ data }) => setDocs((data ?? []) as Doc[]));
    supabase.from("cases").select("*").eq("client_id", client.id)
      .order("created_at", { ascending: false }).then(({ data }) => setCases(data ?? []));
    supabase.from("contracts").select("*").eq("client_id", client.id)
      .order("created_at", { ascending: false }).then(({ data }) => setContracts(data ?? []));
  }, [client.id]);

  const TABS = [
    { id: "resumo",    label: "Resumo",    icon: Users },
    { id: "docs",      label: "Documentos",icon: FileText, badge: docs.length },
    { id: "contratos", label: "Contratos", icon: FileSignature, badge: contracts.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-[420px] h-full border-l border-white/10 flex flex-col" style={{ background: "#0d1424" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-white/8">
          <div className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: `hsl(${client.full_name.charCodeAt(0) * 7 % 360}, 60%, 25%)` }}>
            {client.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-white text-lg truncate">{client.full_name}</h2>
            {client.document && <p className="text-xs text-slate-500">CPF: {client.document}</p>}
            {client.whatsapp && (
              <button onClick={() => { onClose(); navigate({ to: "/inbox" }); }}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mt-1">
                <MessageSquare className="h-3 w-3" /> Abrir no Inbox
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white shrink-0"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8 px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors",
                tab === t.id ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300")}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge ? <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400 text-[10px]">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "resumo" && (
            <div className="space-y-4">
              {[
                { icon: Phone,   label: "Telefone",  value: client.phone },
                { icon: Mail,    label: "E-mail",    value: client.email },
                { icon: Phone,   label: "WhatsApp",  value: client.whatsapp },
                { icon: MapPin,  label: "Endereço",  value: client.address },
              ].map(({ icon: Icon, label, value }) => value ? (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="h-4 w-4 text-slate-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-slate-300">{value}</p>
                  </div>
                </div>
              ) : null)}
              {client.notes && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/8">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-sm text-slate-400 italic">{client.notes}</p>
                </div>
              )}
              {cases.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Casos</p>
                  {cases.map(c => (
                    <div key={c.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <p className="text-sm text-slate-300 flex-1 truncate">{c.title}</p>
                      <span className="text-xs text-slate-600 capitalize">{c.stage}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "docs" && (
            <div className="space-y-2">
              {docs.length === 0 && (
                <div className="text-center py-10 text-slate-600">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum documento recebido ainda.</p>
                  <p className="text-xs mt-1">Documentos enviados via WhatsApp aparecem aqui automaticamente.</p>
                </div>
              )}
              {docs.map(doc => (
                <div key={doc.id} className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/3">
                  <div className="mt-0.5 shrink-0"><DocIcon type={doc.media_type} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {doc.label || DOC_LABELS[doc.doc_type] || doc.doc_type}
                    </p>
                    {doc.transcription && (
                      <p className="text-[11px] text-violet-400 bg-violet-500/10 rounded px-1.5 py-0.5 mt-1 italic">
                        🎤 "{doc.transcription}"
                      </p>
                    )}
                    {!doc.transcription && doc.notes && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{doc.notes}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {doc.file_url && !doc.file_url.startsWith("whatsapp-media://") && (
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="shrink-0 text-slate-600 hover:text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "contratos" && (
            <div className="space-y-3">
              {contracts.length === 0 && (
                <div className="text-center py-10 text-slate-600">
                  <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum contrato gerado ainda.</p>
                </div>
              )}
              {contracts.map((c: any) => (
                <div key={c.id} className="p-3 rounded-xl border border-white/8 bg-white/3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white capitalize">{c.status}</span>
                    <span className="text-[10px] text-slate-500">{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {c.signing_url && (
                    <a href={c.signing_url} target="_blank" rel="noreferrer"
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Abrir link de assinatura
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientesPage() {
  const { user }   = useAuth();
  const [clients, setClients]   = useState<Client[]>([]);
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm]         = useState({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });

  const load = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data ?? []) as Client[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!user || !form.full_name) return;
    const { error } = await supabase.from("clients").insert({ user_id: user.id, ...form });
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente criado"); setOpen(false);
    setForm({ full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: "" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este cliente?")) return;
    await supabase.from("clients").delete().eq("id", id);
    toast.success("Removido"); load();
  };

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.document ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.whatsapp ?? "").includes(search)
  );

  return (
    <div className="flex flex-col h-full">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-slate-400" />
          <h1 className="text-lg font-bold text-white">Clientes</h1>
          <span className="text-xs text-slate-600">{clients.length} total</span>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"
          className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0">
          <Plus className="h-3.5 w-3.5" /> Novo cliente
        </Button>
      </div>

      {/* Busca */}
      <div className="px-6 py-3 border-b border-white/5 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <input className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/8 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50"
            placeholder="Buscar por nome, CPF, e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="rounded-xl border border-white/8 p-4 cursor-pointer hover:border-white/20 transition-all group"
              style={{ background: "#0d1424" }} onClick={() => setSelected(c)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0"
                    style={{ background: `hsl(${c.full_name.charCodeAt(0) * 7 % 360}, 60%, 20%)` }}>
                    {c.full_name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{c.full_name}</p>
                    {c.document && <p className="text-xs text-slate-500">CPF: {c.document}</p>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                {c.email    && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</p>}
                {c.whatsapp && <p className="text-xs text-emerald-500 flex items-center gap-1.5"><MessageSquare className="h-3 w-3" />{c.whatsapp}</p>}
                {c.address  && <p className="text-xs text-slate-600 flex items-center gap-1.5 truncate"><MapPin className="h-3 w-3 shrink-0" />{c.address}</p>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-600">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum cliente encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {selected && <ClienteDrawer client={selected} onClose={() => setSelected(null)} />}

      {/* Modal criar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-[#0d1424] border-white/10 text-white">
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-400 text-xs">Nome completo *</Label>
              <Input className="bg-white/5 border-white/10 text-white mt-1" value={form.full_name}
                onChange={e => setForm({...form, full_name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "CPF", field: "document" as const },
                { label: "E-mail", field: "email" as const },
                { label: "Telefone", field: "phone" as const },
                { label: "WhatsApp", field: "whatsapp" as const },
              ].map(({ label, field }) => (
                <div key={field}>
                  <Label className="text-slate-400 text-xs">{label}</Label>
                  <Input className="bg-white/5 border-white/10 text-white mt-1" value={form[field]}
                    onChange={e => setForm({...form, [field]: e.target.value})} />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Endereço</Label>
              <Input className="bg-white/5 border-white/10 text-white mt-1" value={form.address}
                onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Observações</Label>
              <Textarea className="bg-white/5 border-white/10 text-white mt-1" rows={3} value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-white/10 text-slate-400">Cancelar</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
