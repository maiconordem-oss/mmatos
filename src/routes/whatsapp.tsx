import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  connectInstance, disconnectInstance, refreshStatus,
  upsertInstance, getUserSettings, saveUserSettings,
} from "@/server/whatsapp.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { cn } from "@/lib/utils";
import {
  Smartphone, RefreshCw, LogOut, QrCode, Bot, Plus,
  Settings, Wifi, WifiOff, Building2, Zap, X, Check,
  Eye, EyeOff, ChevronRight, AlertCircle,
} from "lucide-react";

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
  is_office: boolean;
};

type Funil = { id: string; name: string; is_default: boolean };

const STATUS_CONFIG = {
  connected:    { label: "Conectado",       color: "bg-emerald-400", textColor: "text-emerald-400", icon: Wifi },
  connecting:   { label: "Conectando...",   color: "bg-amber-400",   textColor: "text-amber-400",   icon: Wifi },
  qr:           { label: "Aguardando QR",   color: "bg-amber-400",   textColor: "text-amber-400",   icon: QrCode },
  disconnected: { label: "Desconectado",    color: "bg-red-400",     textColor: "text-red-400",      icon: WifiOff },
  error:        { label: "Erro",            color: "bg-red-400",     textColor: "text-red-400",      icon: WifiOff },
};

function WhatsappPage() {
  const { user }    = useAuth();
  const [tab, setTab] = useState<"numeros"|"adicionar"|"configuracoes">("numeros");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [funis, setFunis]         = useState<Funil[]>([]);
  const [busy, setBusy]           = useState<string | null>(null);
  const [showQR, setShowQR]       = useState<string | null>(null);

  // Form novo número
  const [form, setForm] = useState({
    id: "",
    instance_name: "",
    api_url: "",
    api_key: "",
    funnel_id: "",
    is_office: false,
  });
  const [showKey, setShowKey] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Config global
  const [globalConfig, setGlobalConfig] = useState({
    evolution_api_url: "",
    evolution_api_key: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const connectFn    = useAuthServerFn(connectInstance);
  const disconnectFn = useAuthServerFn(disconnectInstance);
  const refreshFn    = useAuthServerFn(refreshStatus);
  const upsertFn     = useAuthServerFn(upsertInstance);
  const getFn        = useAuthServerFn(getUserSettings);
  const saveFn       = useAuthServerFn(saveUserSettings);

  const load = useCallback(async () => {
    if (!user) return;
    const [instRes, funilRes] = await Promise.all([
      supabase.from("whatsapp_instances").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("funnels").select("id, name, is_default").eq("user_id", user.id).eq("is_active", true),
    ]);
    setInstances((instRes.data ?? []) as Instance[]);
    setFunis((funilRes.data ?? []) as Funil[]);
  }, [user]);

  const loadConfig = useCallback(async () => {
    try {
      const s = await getFn({ data: {} });
      setGlobalConfig({ evolution_api_url: s.evolution_api_url ?? "", evolution_api_key: s.evolution_api_key ?? "" });
    } catch {}
  }, []);

  useEffect(() => { load(); loadConfig(); }, [load, loadConfig]);

  // Realtime status
  useEffect(() => {
    const ch = supabase.channel("wa-status")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_instances" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const openEdit = (inst: Instance) => {
    setEditingId(inst.id);
    setForm({
      id: inst.id,
      instance_name: inst.instance_name,
      api_url: inst.api_url ?? globalConfig.evolution_api_url,
      api_key: inst.api_key ?? globalConfig.evolution_api_key,
      funnel_id: inst.funnel_id ?? "",
      is_office: inst.is_office ?? false,
    });
    setTab("adicionar");
  };

  const openNew = () => {
    setEditingId(null);
    setForm({
      id: "",
      instance_name: "",
      api_url: globalConfig.evolution_api_url,
      api_key: globalConfig.evolution_api_key,
      funnel_id: funis.find(f => f.is_default)?.id ?? "",
      is_office: false,
    });
    setTab("adicionar");
  };

  const handleSave = async () => {
    if (!form.instance_name.trim()) { toast.error("Nome da instância é obrigatório"); return; }
    if (!form.api_url.trim())       { toast.error("URL da Evolution API é obrigatória"); return; }
    if (!form.api_key.trim())       { toast.error("API Key é obrigatória"); return; }
    if (!form.is_office && !form.funnel_id) { toast.error("Selecione um funil para este número"); return; }

    setBusy("save");
    try {
      await upsertFn({ data: {
        ...(editingId ? { id: editingId } : {}),
        instance_name: form.instance_name,
        api_url:       form.api_url,
        api_key:       form.api_key,
        funnel_id:     form.is_office ? null : (form.funnel_id || null),
        is_office:     form.is_office,
      }});
      toast.success(editingId ? "Número atualizado!" : "Número adicionado!");
      setTab("numeros");
      setEditingId(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleConnect = async (inst: Instance) => {
    setBusy(inst.id + "-connect");
    try {
      await connectFn({ data: { id: inst.id } });
      setShowQR(inst.id);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleDisconnect = async (inst: Instance) => {
    if (!confirm(`Desconectar ${inst.instance_name}?`)) return;
    setBusy(inst.id + "-disconnect");
    try { await disconnectFn({ data: { id: inst.id } }); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleDelete = async (inst: Instance) => {
    if (!confirm(`Remover ${inst.instance_name}? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("whatsapp_instances").delete().eq("id", inst.id);
    load();
  };

  const handleSaveConfig = async () => {
    if (!globalConfig.evolution_api_url || !globalConfig.evolution_api_key) {
      toast.error("Preencha URL e API Key"); return;
    }
    setSavingConfig(true);
    try {
      await saveFn({ data: globalConfig });
      toast.success("Configurações salvas!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingConfig(false); }
  };

  const TABS = [
    { id: "numeros",        label: "Meus números",       icon: Smartphone, badge: instances.length },
    { id: "adicionar",      label: editingId ? "Editar número" : "Adicionar número", icon: Plus },
    { id: "configuracoes",  label: "Configurações",      icon: Settings },
  ] as const;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0a0f1e" }}>
      <Toaster />

      {/* Header */}
      <div className="px-6 py-5 border-b border-white/8">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white">WhatsApp</h1>
        </div>
        <p className="text-slate-500 text-sm">Gerencie seus números de atendimento e configurações da Evolution API</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-white/8">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t.id
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
            )}>
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.id === "numeros" && instances.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400 text-[10px]">{instances.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── ABA: MEUS NÚMEROS ── */}
        {tab === "numeros" && (
          <div className="max-w-3xl mx-auto space-y-4">
            {instances.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed border-white/8 rounded-2xl">
                <Smartphone className="h-14 w-14 mx-auto mb-4 text-slate-700" />
                <p className="text-white font-medium mb-1">Nenhum número configurado</p>
                <p className="text-slate-500 text-sm mb-4">Adicione os números de WhatsApp para cada funil de atendimento</p>
                <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                  <Plus className="h-4 w-4" /> Adicionar primeiro número
                </Button>
              </div>
            )}

            {instances.map(inst => {
              const status = STATUS_CONFIG[inst.status] || STATUS_CONFIG.disconnected;
              const StatusIcon = status.icon;
              const funil = funis.find(f => f.id === inst.funnel_id);
              const webhookUrl = typeof window !== "undefined"
                ? `${window.location.origin}/api/public/whatsapp-webhook?id=${inst.id}&secret=${inst.webhook_secret}`
                : "";

              return (
                <div key={inst.id} className="rounded-2xl border border-white/8 overflow-hidden" style={{ background: "#0d1424" }}>
                  {/* Card header */}
                  <div className="flex items-center gap-4 p-5">
                    {/* Avatar */}
                    <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                      inst.is_office ? "bg-blue-500/20" : "bg-emerald-500/20")}>
                      {inst.is_office
                        ? <Building2 className="h-6 w-6 text-blue-400" />
                        : <Bot className="h-6 w-6 text-emerald-400" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-white">{inst.phone_number || inst.instance_name}</h3>
                        {inst.is_office
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">Escritório</span>
                          : funil && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">{funil.name}</span>
                        }
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", status.color)} />
                        <span className={cn("text-xs", status.textColor)}>{status.label}</span>
                        {inst.phone_number && <span className="text-xs text-slate-600">· {inst.phone_number}</span>}
                      </div>
                      {!inst.is_office && !inst.funnel_id && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Sem funil vinculado — mensagens não serão respondidas
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      {inst.status === "connected" ? (
                        <button onClick={() => handleDisconnect(inst)} disabled={busy === inst.id + "-disconnect"}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20">
                          <LogOut className="h-3.5 w-3.5" /> Desconectar
                        </button>
                      ) : (
                        <button onClick={() => handleConnect(inst)} disabled={busy === inst.id + "-connect"}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                          <QrCode className="h-3.5 w-3.5" />
                          {busy === inst.id + "-connect" ? "Aguarde..." : "Conectar"}
                        </button>
                      )}
                      <button onClick={() => refreshFn({ data: { id: inst.id } }).then(load)}
                        className="p-2 rounded-lg hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                        title="Atualizar status">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button onClick={async () => {
                        const debugUrl = `/api/debug-webhook?id=${inst.id}&action=set-webhook`;
                        try {
                          const res = await fetch(debugUrl);
                          const data = await res.json();
                          if (data.ok) {
                            toast.success("Webhook configurado automaticamente!");
                          } else {
                            toast.error("Erro: " + JSON.stringify(data.response ?? data.error));
                          }
                        } catch (e: any) { toast.error(e.message); }
                      }} className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400 transition-colors" title="Configurar webhook automaticamente">
                        <Zap className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(inst)}
                        className="p-2 rounded-lg hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(inst)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* QR Code */}
                  {inst.qr_code && inst.status !== "connected" && (showQR === inst.id || inst.status === "qr") && (
                    <div className="border-t border-white/8 p-5 flex flex-col items-center gap-4" style={{ background: "#060b15" }}>
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <QrCode className="h-4 w-4" />
                        <span>Escaneie com o WhatsApp</span>
                      </div>
                      <img
                        src={inst.qr_code.startsWith("data:") ? inst.qr_code : `data:image/png;base64,${inst.qr_code}`}
                        alt="QR Code" className="w-52 h-52 rounded-xl bg-white p-2"
                      />
                      <p className="text-xs text-slate-500 text-center">
                        WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
                      </p>
                    </div>
                  )}

                  {/* Webhook URL */}
                  <div className="border-t border-white/5 px-5 py-3" style={{ background: "#060b15" }}>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">URL do Webhook (configure na Evolution API)</p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] text-slate-500 flex-1 truncate">{webhookUrl}</code>
                      <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado!"); }}
                        className="shrink-0 text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {instances.length > 0 && (
              <button onClick={openNew}
                className="w-full py-4 border-2 border-dashed border-white/8 rounded-2xl text-slate-600 hover:text-slate-400 hover:border-white/15 transition-all flex items-center justify-center gap-2 text-sm">
                <Plus className="h-4 w-4" /> Adicionar outro número
              </button>
            )}
          </div>
        )}

        {/* ── ABA: ADICIONAR / EDITAR ── */}
        {tab === "adicionar" && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-bold text-white">
                {editingId ? "Editar número" : "Adicionar número"}
              </h2>
            </div>

            {/* Tipo do número */}
            <div className="space-y-3">
              <Label className="text-slate-400 text-xs uppercase tracking-wide">Tipo deste número</Label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setForm({ ...form, is_office: false })}
                  className={cn("p-4 rounded-xl border text-left transition-all",
                    !form.is_office ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/8 hover:border-white/15 bg-white/3"
                  )}>
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className={cn("h-5 w-5", !form.is_office ? "text-emerald-400" : "text-slate-600")} />
                    {!form.is_office && <Check className="h-3.5 w-3.5 text-emerald-400 ml-auto" />}
                  </div>
                  <p className={cn("font-medium text-sm", !form.is_office ? "text-white" : "text-slate-500")}>Número de funil</p>
                  <p className="text-xs text-slate-600 mt-0.5">A IA atende automaticamente pelos funis</p>
                </button>
                <button onClick={() => setForm({ ...form, is_office: true, funnel_id: "" })}
                  className={cn("p-4 rounded-xl border text-left transition-all",
                    form.is_office ? "border-blue-500/40 bg-blue-500/10" : "border-white/8 hover:border-white/15 bg-white/3"
                  )}>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className={cn("h-5 w-5", form.is_office ? "text-blue-400" : "text-slate-600")} />
                    {form.is_office && <Check className="h-3.5 w-3.5 text-blue-400 ml-auto" />}
                  </div>
                  <p className={cn("font-medium text-sm", form.is_office ? "text-white" : "text-slate-500")}>Número do escritório</p>
                  <p className="text-xs text-slate-600 mt-0.5">Recebe notificações de todos os funis</p>
                </button>
              </div>
            </div>

            {/* Nome */}
            <div>
              <Label className="text-slate-400 text-xs">Nome da instância *</Label>
              <Input className="mt-1 bg-white/5 border-white/10 text-white placeholder-slate-600"
                value={form.instance_name} onChange={e => setForm({ ...form, instance_name: e.target.value })}
                placeholder={form.is_office ? "escritorio" : "creche, tirzepatida..."} />
              <p className="text-[11px] text-slate-600 mt-1">Identificador interno, sem espaços</p>
            </div>

            {/* Evolution API */}
            <div className="rounded-xl border border-white/8 p-4 space-y-4" style={{ background: "#060b15" }}>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-medium text-white">Evolution API</p>
                {globalConfig.evolution_api_url && (
                  <button onClick={() => setForm({ ...form, api_url: globalConfig.evolution_api_url, api_key: globalConfig.evolution_api_key })}
                    className="ml-auto text-xs text-emerald-400 hover:text-emerald-300">
                    Usar configuração global
                  </button>
                )}
              </div>
              <div>
                <Label className="text-slate-500 text-xs">URL da Evolution API *</Label>
                <Input className="mt-1 bg-white/5 border-white/10 text-white placeholder-slate-600"
                  value={form.api_url} onChange={e => setForm({ ...form, api_url: e.target.value })}
                  placeholder="https://evo.seudominio.com" />
              </div>
              <div>
                <Label className="text-slate-500 text-xs">API Key *</Label>
                <div className="relative mt-1">
                  <Input className="bg-white/5 border-white/10 text-white placeholder-slate-600 pr-10"
                    type={showKey ? "text" : "password"}
                    value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
                    placeholder="sua-chave-global" />
                  <button onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Funil — só para números de funil */}
            {!form.is_office && (
              <div className="rounded-xl border border-white/8 p-4 space-y-3" style={{ background: "#060b15" }}>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-medium text-white">Funil de atendimento *</p>
                </div>
                <p className="text-xs text-slate-500">Toda mensagem recebida neste número será atendida por este funil automaticamente.</p>
                {funis.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Nenhum funil ativo. Crie um em Funis de Atendimento primeiro.
                  </div>
                ) : (
                  <Select value={form.funnel_id} onValueChange={v => setForm({ ...form, funnel_id: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Selecione o funil..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1e293b] border-white/10">
                      {funis.map(f => (
                        <SelectItem key={f.id} value={f.id} className="text-white focus:bg-white/10">
                          {f.name} {f.is_default ? "(padrão)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-3">
              <Button onClick={() => { setTab("numeros"); setEditingId(null); }} variant="outline"
                className="border-white/10 text-slate-400 hover:bg-white/5">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={busy === "save"}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                {busy === "save" ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar número"}
              </Button>
            </div>

            {!editingId && (
              <div className="rounded-xl border border-white/8 p-4 space-y-3" style={{ background: "#060b15" }}>
                <p className="text-xs font-medium text-slate-400">📋 Próximos passos após adicionar:</p>
                <div className="space-y-2">
                  {[
                    "Clique em Conectar no card do número",
                    "Escaneie o QR Code com o WhatsApp",
                    "Configure a URL do Webhook na Evolution API",
                    "Teste enviando uma mensagem para o número",
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                      <span className="h-4 w-4 rounded-full bg-white/5 text-slate-600 flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: CONFIGURAÇÕES GLOBAIS ── */}
        {tab === "configuracoes" && (
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Configurações globais</h2>
              <p className="text-slate-500 text-sm">
                Configure uma vez e use em todos os números. Ao adicionar um novo número, estes valores são preenchidos automaticamente.
              </p>
            </div>

            {/* Evolution API global */}
            <div className="rounded-xl border border-white/8 p-5 space-y-4" style={{ background: "#0d1424" }}>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-medium text-white">Evolution API — configuração padrão</p>
                  <p className="text-xs text-slate-500 mt-0.5">Usada automaticamente ao criar novos números</p>
                </div>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">URL da Evolution API</Label>
                <Input className="mt-1 bg-white/5 border-white/10 text-white placeholder-slate-600"
                  value={globalConfig.evolution_api_url}
                  onChange={e => setGlobalConfig({ ...globalConfig, evolution_api_url: e.target.value })}
                  placeholder="https://evo.seudominio.com" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">API Key padrão</Label>
                <Input type="password" className="mt-1 bg-white/5 border-white/10 text-white placeholder-slate-600"
                  value={globalConfig.evolution_api_key}
                  onChange={e => setGlobalConfig({ ...globalConfig, evolution_api_key: e.target.value })}
                  placeholder="sua-chave-global" />
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                {savingConfig ? "Salvando..." : "Salvar configuração global"}
              </Button>
            </div>

            {/* Info sobre os números */}
            <div className="rounded-xl border border-white/8 p-5 space-y-4" style={{ background: "#0d1424" }}>
              <p className="font-medium text-white flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-slate-400" /> Resumo dos números
              </p>
              {instances.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum número configurado ainda.</p>
              ) : (
                <div className="space-y-3">
                  {instances.map(inst => {
                    const status = STATUS_CONFIG[inst.status] || STATUS_CONFIG.disconnected;
                    const funil = funis.find(f => f.id === inst.funnel_id);
                    return (
                      <div key={inst.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div className={cn("h-2 w-2 rounded-full shrink-0", status.color)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium">{inst.phone_number || inst.instance_name}</p>
                          <p className="text-xs text-slate-500">
                            {inst.is_office ? "Escritório" : funil?.name || "Sem funil"}
                          </p>
                        </div>
                        <button onClick={() => openEdit(inst)}
                          className="text-slate-600 hover:text-slate-300 text-xs flex items-center gap-1">
                          Editar <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={openNew} variant="outline"
                className="w-full border-white/10 text-slate-400 hover:bg-white/5 gap-2">
                <Plus className="h-4 w-4" /> Adicionar número
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
