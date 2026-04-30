import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { connectInstance, disconnectInstance, refreshStatus, upsertInstance } from "@/server/whatsapp.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Smartphone, RefreshCw, LogOut, QrCode, Bot, Plus } from "lucide-react";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <WhatsappPage />
      </AppShell>
    </AuthGate>
  ),
});

type Instance = {
  id: string;
  instance_name: string;
  api_url: string | null;
  api_key: string | null;
  status: "disconnected" | "connecting" | "qr" | "connected" | "error";
  qr_code: string | null;
  phone_number: string | null;
  webhook_secret: string;
  funnel_id: string | null;
};

type Funil = { id: string; name: string; is_default: boolean };

const EMPTY_FORM = { instance_name: "", funnel_id: "" };

function WhatsappPage() {
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const upsertFn      = useAuthServerFn(upsertInstance);
  const connectFn     = useAuthServerFn(connectInstance);
  const disconnectFn  = useAuthServerFn(disconnectInstance);
  const refreshFn     = useAuthServerFn(refreshStatus);

  const load = async () => {
    if (!user) return;
    const { data: insts } = await supabase
      .from("whatsapp_instances").select("*").eq("user_id", user.id).order("created_at");
    setInstances((insts ?? []) as Instance[]);

    const { data: fns } = await supabase
      .from("funnels").select("id, name, is_default").eq("user_id", user.id).eq("is_active", true).order("name");
    setFunis((fns ?? []) as Funil[]);
  };

  useEffect(() => { load(); }, [user]);

  // Realtime para atualizar status/QR
  useEffect(() => {
    const ch = supabase.channel("wa-instances")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_instances" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const openNew = () => {
    setEditingId(null);
    const defaultFunil = funis.find(f => f.is_default);
    setForm({ ...EMPTY_FORM, funnel_id: defaultFunil?.id ?? "" });
    setShowForm(true);
  };

  const openEdit = (inst: Instance) => {
    setEditingId(inst.id);
    setForm({
      instance_name: inst.instance_name,
      funnel_id:     inst.funnel_id ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.instance_name) {
      toast.error("Informe o nome da instância");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        instance_name: form.instance_name,
        funnel_id:     form.funnel_id || null,
        ...(editingId ? { id: editingId } : {}),
      };
      await upsertFn({ data: payload });
      toast.success(editingId ? "Configuração salva!" : "Instância criada!");
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const connect = async (inst: Instance) => {
    setBusy(true);
    try {
      await connectFn({ data: { id: inst.id } });
      toast.success("Escaneie o QR Code");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const disconnect = async (inst: Instance) => {
    setBusy(true);
    try { await disconnectFn({ data: { id: inst.id } }); load(); toast.success("Desconectado"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const statusColor = (s: string) =>
    s === "connected" ? "bg-emerald-500" : s === "qr" ? "bg-amber-500" : "bg-muted-foreground";

  const statusLabel = (s: string) =>
    s === "connected" ? "Conectado" : s === "qr" ? "Aguardando QR" : s === "connecting" ? "Conectando..." : "Desconectado";

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Toaster />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Smartphone className="h-7 w-7" /> WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">
            Cada número conecta a um funil de atendimento específico
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova instância
        </Button>
      </header>

      {/* Formulário de criação/edição */}
      {showForm && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle>{editingId ? "Editar instância" : "Nova instância WhatsApp"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da instância *</Label>
              <Input value={form.instance_name} onChange={(e) => setForm({ ...form, instance_name: e.target.value })} placeholder="ex: creche, tirzepatida" />
              <p className="text-xs text-muted-foreground mt-1">
                Use um nome curto sem espaços (apenas letras, números, _ e -). Identifica o anúncio/campanha.
              </p>
            </div>

            {/* Seleção do funil */}
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-green-500" />
                Funil de atendimento deste número *
              </Label>
              <p className="text-xs text-muted-foreground">
                Toda mensagem recebida neste número será atendida por este funil automaticamente.
              </p>
              {funis.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  ⚠️ Nenhum funil ativo. Crie um funil em <strong>Funis de Atendimento</strong> primeiro.
                </p>
              ) : (
                <Select value={form.funnel_id} onValueChange={(v) => setForm({ ...form, funnel_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil..." />
                  </SelectTrigger>
                  <SelectContent>
                    {funis.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} {f.is_default ? "(padrão)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de instâncias */}
      {instances.length === 0 && !showForm && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">Nenhum número configurado</p>
          <p className="text-sm mt-1">Adicione um número para cada anúncio (creche, tirzepatida, etc.)</p>
          <Button onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Adicionar número</Button>
        </div>
      )}

      <div className="space-y-4">
        {instances.map((inst) => {
          const funil = funis.find(f => f.id === inst.funnel_id);
          return (
            <Card key={inst.id}>
              <CardContent className="pt-5 space-y-4">
                {/* Header da instância */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-lg">{inst.instance_name}</h3>
                      <Badge variant="outline" className="gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${statusColor(inst.status)}`} />
                        {statusLabel(inst.status)}
                        {inst.phone_number ? ` · ${inst.phone_number}` : ""}
                      </Badge>
                    </div>
                    {funil ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-green-500" />
                        Funil: <span className="font-medium text-foreground">{funil.name}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600">⚠️ Sem funil vinculado — mensagens não serão respondidas</p>
                    )}
                    <p className="text-xs text-muted-foreground">{inst.api_url}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(inst)}>Editar</Button>
                    {inst.status !== "connected" && (
                      <Button size="sm" onClick={() => connect(inst)} disabled={busy}>
                        <QrCode className="h-4 w-4 mr-1" /> Conectar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => refreshFn({ data: { id: inst.id } }).then(load)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    {inst.status === "connected" && (
                      <Button size="sm" variant="destructive" onClick={() => disconnect(inst)}>
                        <LogOut className="h-3.5 w-3.5 mr-1" /> Desconectar
                      </Button>
                    )}
                  </div>
                </div>

                {/* QR Code */}
                {inst.qr_code && inst.status !== "connected" && (
                  <div className="flex flex-col items-center gap-3 pt-2 border-t">
                    <img
                      src={inst.qr_code.startsWith("data:") ? inst.qr_code : `data:image/png;base64,${inst.qr_code}`}
                      alt="QR Code"
                      className="w-56 h-56 border rounded-lg bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                )}

                {/* Webhook URL */}
                <div className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5 font-medium">URL do Webhook (configurar na Evolution API):</p>
                  <code className="text-xs break-all">
                    {typeof window !== "undefined" ? window.location.origin : ""}/api/public/whatsapp-webhook?id={inst.id}&secret={inst.webhook_secret}
                  </code>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
