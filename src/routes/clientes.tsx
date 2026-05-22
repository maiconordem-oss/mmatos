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
  MessageSquare, Mic, Image, File, ExternalLink,
  Trash2, FileSignature, X, Edit2, Save, User,
  Calendar, CheckCircle2, Clock,
} from "lucide-react";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell><ClientesPage /></AppShell></AuthGate>
  ),
});

type Client = {
  id: string; full_name: string; document: string | null;
  email: string | null; phone: string | null; whatsapp: string | null;
  address: string | null; notes: string | null; created_at: string;
};

type Doc = {
  id: string; doc_type: string; label: string | null;
  file_url: string; media_type: string | null;
  transcription: string | null; notes: string | null; created_at: string;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
}
function avatarColor(name: string) {
  const colors = ["#0d9488","#2563eb","#7c3aed","#db2777","#d97706","#059669","#dc2626"];
  return colors[name.charCodeAt(0) % colors.length];
}

function DocIcon({ type }: { type: string | null }) {
  if (type === "audio")    return <Mic      className="h-4 w-4 text-violet-500" />;
  if (type === "image")    return <Image    className="h-4 w-4 text-blue-500" />;
  if (type === "document") return <FileText className="h-4 w-4 text-amber-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// ── Drawer do cliente ────────────────────────────────────────
function ClienteDrawer({ client: initial, onClose, onUpdate }: {
  client: Client; onClose: () => void; onUpdate: (c: Client) => void;
}) {
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const [client, setClient] = useState(initial);
  const [docs, setDocs]     = useState<Doc[]>([]);
  const [cases, setCases]   = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [tab, setTab]       = useState("resumo");
  const [editing, setEditing] = useState(false);
  const [form, setForm]     = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [mediaToken, setMediaToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMediaToken(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setMediaToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("client_documents").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("cases").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("contracts").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    ]).then(([d, ca, co]) => {
      setDocs((d.data ?? []) as Doc[]);
      setCases(ca.data ?? []);
      setContracts(co.data ?? []);
    });
  }, [client.id]);

  const salvar = async () => {
    if (!form.full_name.trim()) return;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("E-mail inválido"); return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("clients").update({
      full_name: form.full_name.trim(),
      document:  form.document  || null,
      email:     form.email     || null,
      phone:     form.phone     || null,
      whatsapp:  form.whatsapp  || null,
      address:   form.address   || null,
      notes:     form.notes     || null,
    }).eq("id", client.id).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const updated = data as Client;
    setClient(updated);
    onUpdate(updated);
    setEditing(false);
    toast.success("Cliente atualizado!");
  };

  const TABS = [
    { id: "resumo",    label: "Resumo",     icon: User },
    { id: "docs",      label: "Documentos", icon: FileText,     badge: docs.length },
    { id: "contratos", label: "Contratos",  icon: FileSignature, badge: contracts.length },
    { id: "historico", label: "Histórico",  icon: Clock },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-[460px] h-full border-l border-border bg-background flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-border shrink-0">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
            style={{ background: avatarColor(client.full_name) }}>
            {initials(client.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="text-base font-bold h-8 mb-1" autoFocus />
            ) : (
              <h2 className="font-bold text-foreground text-lg truncate">{client.full_name}</h2>
            )}
            {client.document && !editing && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> CPF: {client.document}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {client.whatsapp && (
                <button onClick={() => { onClose(); navigate({ to: "/inbox" }); }}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-500 font-medium">
                  <MessageSquare className="h-3 w-3" /> Abrir no Inbox
                </button>
              )}
              <button onClick={() => { setEditing(!editing); setForm({ ...client }); }}
                className={cn("flex items-center gap-1 text-xs font-medium",
                  editing ? "text-muted-foreground" : "text-primary hover:text-primary/80")}>
                <Edit2 className="h-3 w-3" /> {editing ? "Cancelar" : "Editar"}
              </button>
              {editing && (
                <button onClick={salvar} disabled={saving}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-500 font-medium">
                  <Save className="h-3 w-3" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4 shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge ? <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── RESUMO ── */}
          {tab === "resumo" && (
            <div className="space-y-4">
              {editing ? (
                <div className="space-y-3">
                  {[
                    { label: "CPF / Documento", field: "document" as const },
                    { label: "E-mail", field: "email" as const },
                    { label: "Telefone", field: "phone" as const },
                    { label: "WhatsApp", field: "whatsapp" as const },
                    { label: "Endereço", field: "address" as const },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input value={form[field] || ""} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                        className="mt-1 text-sm" />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs text-muted-foreground">Observações</Label>
                    <Textarea value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      rows={3} maxLength={2000} className="mt-1 text-sm resize-none" />
                    <p className="text-right text-[11px] text-muted-foreground mt-0.5">{(form.notes || "").length}/2000</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Info cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { icon: FileText,     label: "CPF",       value: client.document },
                      { icon: Mail,         label: "E-mail",    value: client.email },
                      { icon: Phone,        label: "Telefone",  value: client.phone },
                      { icon: MessageSquare,label: "WhatsApp",  value: client.whatsapp },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className={cn("rounded-xl border p-3 transition-colors",
                        value ? "border-border bg-card" : "border-dashed border-border/50 bg-muted/20")}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</span>
                        </div>
                        <p className={cn("text-sm font-medium truncate", value ? "text-foreground" : "text-muted-foreground/40 italic")}>
                          {value || "Não informado"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Endereço */}
                  {client.address && (
                    <div className="rounded-xl border border-border bg-card p-3 flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Endereço</p>
                        <p className="text-sm text-foreground">{client.address}</p>
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  {client.notes && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[10px] text-amber-700 uppercase tracking-wide font-semibold mb-1">Observações</p>
                      <p className="text-sm text-amber-800 italic">{client.notes}</p>
                    </div>
                  )}

                  {/* Casos */}
                  {cases.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Casos ({cases.length})</p>
                      <div className="space-y-2">
                        {cases.map(c => (
                          <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <p className="text-sm text-foreground flex-1 truncate">{c.title}</p>
                            <span className="text-xs text-muted-foreground capitalize">{c.stage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Data de cadastro */}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Cadastrado em {new Date(client.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── DOCUMENTOS ── */}
          {tab === "docs" && (
            <div className="space-y-2">
              {docs.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum documento ainda</p>
                  <p className="text-xs mt-1 opacity-70">Documentos enviados via WhatsApp aparecem aqui automaticamente</p>
                </div>
              )}
              {docs.map(doc => (
                <div key={doc.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card">
                  <div className="mt-0.5 shrink-0"><DocIcon type={doc.media_type} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {doc.label || doc.doc_type}
                    </p>
                    {doc.transcription && (
                      <p className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded px-2 py-1 mt-1 italic">
                        🎤 "{doc.transcription}"
                      </p>
                    )}
                    {!doc.transcription && doc.notes && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.notes}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {doc.file_url && (
                    <a href={mediaToken ? `/api/media-proxy?doc=${doc.id}&token=${encodeURIComponent(mediaToken)}` : doc.file_url} target="_blank" rel="noreferrer"
                      className="text-muted-foreground hover:text-primary shrink-0 p-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── CONTRATOS ── */}
          {tab === "contratos" && (
            <div className="space-y-3">
              {contracts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum contrato ainda</p>
                </div>
              )}
              {contracts.map((c: any) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full shrink-0",
                        c.status === "signed" ? "bg-emerald-500" :
                        c.status === "sent"   ? "bg-amber-500" : "bg-muted-foreground")}>
                      </div>
                      <span className="text-sm font-medium text-foreground capitalize">
                        {c.status === "signed" ? "Assinado" : c.status === "sent" ? "Aguardando assinatura" : c.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {c.signing_url && (
                    <a href={c.signing_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <ExternalLink className="h-3 w-3" /> Abrir link de assinatura
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── HISTÓRICO ── */}
          {tab === "historico" && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Histórico de conversas em breve</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────
function ClientesPage() {
  const { user }            = useAuth();
  const [clients, setClients]     = useState<Client[]>([]);
  const [search, setSearch]       = useState("");
  const [open, setOpen]           = useState(false);
  const [selected, setSelected]   = useState<Client | null>(null);
  const [form, setForm]           = useState({
    full_name: "", document: "", email: "", phone: "", whatsapp: "", address: "", notes: ""
  });

  const load = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("full_name");
    setClients((data ?? []) as Client[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!user || !form.full_name.trim()) return;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("E-mail inválido"); return;
    }
    const { error } = await supabase.from("clients").insert({ user_id: user.id, ...form });
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente criado!");
    setOpen(false);
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
    (c.phone ?? "").includes(search) ||
    (c.whatsapp ?? "").includes(search)
  );

  return (
    <div className="flex flex-col h-full">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" /> Clientes
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{clients.length} cadastrado{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo cliente
        </Button>
      </div>

      {/* Busca */}
      <div className="px-6 py-3 border-b border-border shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 focus:bg-background transition-colors"
            placeholder="Buscar por nome, CPF, e-mail, telefone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id}
              onClick={() => setSelected(c)}
              className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group">
              {/* Avatar + nome */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
                    style={{ background: avatarColor(c.full_name) }}>
                    {initials(c.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{c.full_name}</p>
                    {c.document
                      ? <p className="text-xs text-muted-foreground">CPF: {c.document}</p>
                      : <p className="text-xs text-muted-foreground/40 italic">Sem CPF</p>
                    }
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1 shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Detalhes */}
              <div className="space-y-1.5">
                {c.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" />{c.email}
                  </p>
                )}
                {(c.whatsapp || c.phone) && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 shrink-0" />{c.whatsapp || c.phone}
                  </p>
                )}
                {c.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />{c.address}
                  </p>
                )}
                {!c.email && !c.phone && !c.whatsapp && !c.address && (
                  <p className="text-xs text-muted-foreground/40 italic">Sem informações de contato</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </p>
                <span className="text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver detalhes →
                </span>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}</p>
              {!search && (
                <p className="text-xs mt-1 opacity-70">Clientes cadastrados pelo Inbox aparecem aqui automaticamente</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <ClienteDrawer
          client={selected}
          onClose={() => setSelected(null)}
          onUpdate={updated => {
            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelected(updated);
          }}
        />
      )}

      {/* Modal criar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nome completo *</Label>
              <Input className="mt-1" value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Nome completo" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "CPF",      field: "document"  as const, placeholder: "000.000.000-00" },
                { label: "E-mail",   field: "email"     as const, placeholder: "email@exemplo.com" },
                { label: "Telefone", field: "phone"     as const, placeholder: "5551999999999" },
                { label: "WhatsApp", field: "whatsapp"  as const, placeholder: "5551999999999" },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input className="mt-1 text-sm" placeholder={placeholder} value={form[field]}
                    onChange={e => setForm({ ...form, [field]: e.target.value })} />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Endereço</Label>
              <Input className="mt-1" value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, número, bairro, cidade" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Textarea className="mt-1 resize-none" rows={3} maxLength={2000} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Anotações sobre o cliente..." />
              <p className="text-right text-[11px] text-muted-foreground mt-0.5">{(form.notes || "").length}/2000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.full_name.trim()}>Criar cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
