import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { connectInstance, disconnectInstance, refreshStatus, upsertInstance } from "@/server/whatsapp.functions";
import { Smartphone, RefreshCw, LogOut, QrCode } from "lucide-react";

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
};

function WhatsappPage() {
  const { user } = useAuth();
  const [inst, setInst] = useState<Instance | null>(null);
  const [form, setForm] = useState({ instance_name: "lex", api_url: "", api_key: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("whatsapp_instances").select("*").eq("user_id", user.id).maybeSingle();
    if (data) {
      setInst(data as Instance);
      setForm({ instance_name: data.instance_name, api_url: data.api_url || "", api_key: data.api_key || "" });
    }
  };

  useEffect(() => { load(); }, [user]);

  // Realtime subscription for status/qr updates
  useEffect(() => {
    if (!inst) return;
    const ch = supabase
      .channel(`wa:${inst.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_instances", filter: `id=eq.${inst.id}` },
        (payload) => setInst(payload.new as Instance))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [inst?.id]);

  // Auto-poll status while QR
  useEffect(() => {
    if (!inst || inst.status === "connected") return;
    const t = setInterval(async () => {
      try { await refreshStatus({ data: { id: inst.id } }); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [inst?.id, inst?.status]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await upsertInstance({ data: form });
      setInst(r.instance as Instance);
      toast.success("Configuração salva");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!inst) return;
    setBusy(true);
    try {
      await connectInstance({ data: { id: inst.id } });
      toast.success("Escaneie o QR Code com o WhatsApp");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!inst) return;
    setBusy(true);
    try { await disconnectInstance({ data: { id: inst.id } }); await load(); toast.success("Desconectado"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const statusColor = inst?.status === "connected" ? "bg-emerald-500" : inst?.status === "qr" ? "bg-amber-500" : "bg-muted-foreground";

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Toaster />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Smartphone className="h-7 w-7" /> WhatsApp</h1>
          <p className="text-muted-foreground mt-1">Conecte via QR Code usando Evolution API</p>
        </div>
        {inst && (
          <Badge variant="outline" className="gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
            {inst.status}{inst.phone_number ? ` · ${inst.phone_number}` : ""}
          </Badge>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle>Configuração da Evolution API</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Nome da instância</Label><Input value={form.instance_name} onChange={(e) => setForm({ ...form, instance_name: e.target.value })} placeholder="lex" /></div>
            <div><Label>URL da Evolution API</Label><Input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} placeholder="https://evo.seudominio.com" /></div>
          </div>
          <div><Label>API Key (apikey global)</Label><Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="sua-chave-evolution" /></div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>Salvar configuração</Button>
            {inst && <Button onClick={connect} disabled={busy} variant="default"><QrCode className="h-4 w-4" /> Gerar QR Code</Button>}
            {inst && <Button onClick={() => refreshStatus({ data: { id: inst.id } }).then(load)} variant="outline"><RefreshCw className="h-4 w-4" /></Button>}
            {inst?.status === "connected" && <Button onClick={disconnect} variant="destructive"><LogOut className="h-4 w-4" /> Desconectar</Button>}
          </div>
          {inst && (
            <p className="text-xs text-muted-foreground break-all">
              Webhook: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/public/whatsapp-webhook?id={inst.id}&secret={inst.webhook_secret}</code>
            </p>
          )}
        </CardContent>
      </Card>

      {inst?.qr_code && inst.status !== "connected" && (
        <Card>
          <CardHeader><CardTitle>Escaneie o QR Code</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <img
              src={inst.qr_code.startsWith("data:") ? inst.qr_code : `data:image/png;base64,${inst.qr_code}`}
              alt="QR Code WhatsApp"
              className="w-72 h-72 border rounded-lg bg-white p-2"
            />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho.
              O QR expira rapidamente; clique em "Gerar QR Code" novamente se necessário.
            </p>
          </CardContent>
        </Card>
      )}

      {inst?.status === "connected" && (
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-emerald-600 font-medium">✓ Conectado{inst.phone_number ? ` como ${inst.phone_number}` : ""}</div>
            <p className="text-sm text-muted-foreground mt-2">Mensagens recebidas aparecerão automaticamente em /inbox</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
