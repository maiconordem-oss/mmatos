import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CheckCircle2, Copy, ExternalLink, FileDown, Instagram, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/instagram")({
  head: () => ({ meta: [{ title: "Instagram - Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <InstagramPage />
      </AppShell>
    </AuthGate>
  ),
});

type Instance = { id: string; instance_name: string; status: string; phone_number: string | null };
type Magnet = {
  id: string;
  title: string;
  slug: string;
  keyword: string | null;
  description: string | null;
  button_label: string;
  file_url: string;
  file_name: string | null;
  file_type: string;
  delivery_message: string;
  success_message: string;
  instance_id: string | null;
  is_active: boolean;
  created_at: string;
};
type Submission = { id: string; magnet_id: string; name: string | null; phone: string; status: string; created_at: string };

const emptyForm = {
  id: "",
  title: "Guia gratuito",
  slug: "guia-gratuito",
  keyword: "",
  description: "Preencha seu WhatsApp para receber o material agora.",
  button_label: "Receber no WhatsApp",
  file_url: "",
  file_name: "",
  file_type: "document",
  delivery_message: "Oi, {{nome}}! Conforme combinado, segue o material que voce pediu.",
  success_message: "Pronto. Enviamos o material no seu WhatsApp.",
  instance_id: "",
  is_active: true,
};

function InstagramPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"configurar" | "leads">("configurar");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [magnets, setMagnets] = useState<Magnet[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return `/captura/${form.slug}`;
    return `${window.location.origin}/captura/${form.slug}`;
  }, [form.slug]);

  const load = async () => {
    if (!user) return;
    const [instRes, magnetRes, leadRes] = await Promise.all([
      (supabase as any).from("whatsapp_instances").select("id, instance_name, status, phone_number").eq("user_id", user.id).order("created_at"),
      (supabase as any).from("instagram_lead_magnets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      (supabase as any).from("instagram_lead_submissions").select("id, magnet_id, name, phone, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
    ]);
    setInstances((instRes.data ?? []) as Instance[]);
    setMagnets((magnetRes.data ?? []) as Magnet[]);
    setSubmissions((leadRes.data ?? []) as Submission[]);
  };

  useEffect(() => { load(); }, [user?.id]);

  const patch = (key: keyof typeof emptyForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: key === "slug" ? slugify(String(value)) : value }));
  };

  const edit = (magnet: Magnet) => {
    setForm({
      id: magnet.id,
      title: magnet.title,
      slug: magnet.slug,
      keyword: magnet.keyword ?? "",
      description: magnet.description ?? "",
      button_label: magnet.button_label,
      file_url: magnet.file_url,
      file_name: magnet.file_name ?? "",
      file_type: magnet.file_type,
      delivery_message: magnet.delivery_message,
      success_message: magnet.success_message,
      instance_id: magnet.instance_id ?? "",
      is_active: magnet.is_active,
    });
    setTab("configurar");
  };

  const save = async () => {
    if (!user) return;
    if (!form.title.trim() || !form.slug.trim() || !form.file_url.trim() || !form.instance_id) {
      toast.error("Preencha titulo, link, WhatsApp e arquivo.");
      return;
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      slug: slugify(form.slug),
      keyword: form.keyword.trim() || null,
      description: form.description.trim() || null,
      button_label: form.button_label.trim() || "Receber no WhatsApp",
      file_url: form.file_url.trim(),
      file_name: form.file_name.trim() || null,
      file_type: form.file_type,
      delivery_message: form.delivery_message.trim(),
      success_message: form.success_message.trim(),
      instance_id: form.instance_id,
      is_active: form.is_active,
    };

    const query = form.id
      ? (supabase as any).from("instagram_lead_magnets").update(payload).eq("id", form.id)
      : (supabase as any).from("instagram_lead_magnets").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success("Landing salva");
    setForm(emptyForm);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta landing?")) return;
    await (supabase as any).from("instagram_lead_magnets").delete().eq("id", id);
    toast.success("Landing excluida");
    load();
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Link copiado");
  };

  return (
    <div className="min-h-full bg-background">
      <Toaster />
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
            <Instagram className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Instagram</h1>
            <p className="text-sm text-muted-foreground">Landing de captura para comentario, ManyChat e envio automatico de arquivo.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border px-6 py-3">
        {[
          ["configurar", "Configurar landing"],
          ["leads", "Leads capturados"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={cn("rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "configurar" ? (
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Dados da landing</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Titulo"><Input value={form.title} onChange={(e) => patch("title", e.target.value)} /></Field>
                <Field label="Palavra do comentario"><Input value={form.keyword} onChange={(e) => patch("keyword", e.target.value)} placeholder="Ex: GUIA" /></Field>
                <Field label="Slug do link"><Input value={form.slug} onChange={(e) => patch("slug", e.target.value)} /></Field>
                <Field label="Botao"><Input value={form.button_label} onChange={(e) => patch("button_label", e.target.value)} /></Field>
                <div className="md:col-span-2">
                  <Field label="Descricao"><Textarea value={form.description} onChange={(e) => patch("description", e.target.value)} rows={3} /></Field>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileDown className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Entrega pelo WhatsApp</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Numero conectado">
                  <Select value={form.instance_id} onValueChange={(value) => patch("instance_id", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {instances.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.phone_number || inst.instance_name} {inst.status === "connected" ? "" : "(desconectado)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Tipo do arquivo">
                  <Select value={form.file_type} onValueChange={(value) => patch("file_type", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document">Documento/PDF</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="URL publica do arquivo"><Input value={form.file_url} onChange={(e) => patch("file_url", e.target.value)} placeholder="https://..." /></Field>
                <Field label="Nome do arquivo"><Input value={form.file_name} onChange={(e) => patch("file_name", e.target.value)} placeholder="guia.pdf" /></Field>
                <div className="md:col-span-2">
                  <Field label="Mensagem de entrega">
                    <Textarea value={form.delivery_message} onChange={(e) => patch("delivery_message", e.target.value)} rows={3} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Mensagem de sucesso da landing">
                    <Input value={form.success_message} onChange={(e) => patch("success_message", e.target.value)} />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              {form.id && <Button variant="outline" onClick={() => setForm(emptyForm)}>Novo</Button>}
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {form.id ? "Salvar alteracoes" : "Criar landing"}
              </Button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-2 text-sm font-semibold">Link para o ManyChat</p>
              <div className="flex gap-2">
                <Input value={publicUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(publicUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Abrir landing <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="space-y-3">
              {magnets.map((magnet) => (
                <div key={magnet.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className={cn("mt-0.5 h-4 w-4", magnet.is_active ? "text-emerald-500" : "text-slate-400")} />
                    <button onClick={() => edit(magnet)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold">{magnet.title}</p>
                      <p className="truncate text-xs text-muted-foreground">/captura/{magnet.slug}</p>
                    </button>
                    <button onClick={() => remove(magnet.id)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="p-6">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-[1fr_160px_130px_170px] border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Lead</span><span>Telefone</span><span>Status</span><span>Data</span>
            </div>
            {submissions.map((lead) => (
              <div key={lead.id} className="grid grid-cols-[1fr_160px_130px_170px] border-b border-border/60 px-4 py-3 text-sm last:border-0">
                <span className="font-medium">{lead.name || "Sem nome"}</span>
                <span className="text-muted-foreground">{lead.phone}</span>
                <span className={lead.status === "sent" ? "text-emerald-500" : lead.status === "failed" ? "text-red-500" : "text-amber-500"}>{lead.status}</span>
                <span className="text-muted-foreground">{new Date(lead.created_at).toLocaleString("pt-BR")}</span>
              </div>
            ))}
            {submissions.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nenhum lead capturado ainda.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
