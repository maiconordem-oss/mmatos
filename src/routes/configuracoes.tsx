import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { getUserSettings, saveUserSettings } from "@/server/whatsapp.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ConfiguracoesPage />
      </AppShell>
    </AuthGate>
  ),
});

function ConfiguracoesPage() {
  const [form, setForm] = useState({ evolution_api_url: "", evolution_api_key: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const getFn = useAuthServerFn(getUserSettings);
  const saveFn = useAuthServerFn(saveUserSettings);

  useEffect(() => {
    (async () => {
      try {
        const s = await getFn({ data: {} });
        setForm({
          evolution_api_url: s.evolution_api_url ?? "",
          evolution_api_key: s.evolution_api_key ?? "",
        });
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!form.evolution_api_url || !form.evolution_api_key) {
      toast.error("Preencha URL e API Key");
      return;
    }
    setBusy(true);
    try {
      await saveFn({ data: form });
      toast.success("Configurações salvas!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Toaster />
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="h-7 w-7" /> Configurações
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure suas integrações uma única vez. Depois disso, criar instâncias do WhatsApp fica em 1 clique.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Evolution API (WhatsApp)</CardTitle>
          <CardDescription>
            Servidor da Evolution que será usado para todas as suas conexões de WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div>
                <Label>URL da Evolution API *</Label>
                <Input
                  value={form.evolution_api_url}
                  onChange={(e) => setForm({ ...form, evolution_api_url: e.target.value })}
                  placeholder="https://evo.seudominio.com"
                />
              </div>
              <div>
                <Label>API Key *</Label>
                <Input
                  type="password"
                  value={form.evolution_api_key}
                  onChange={(e) => setForm({ ...form, evolution_api_key: e.target.value })}
                  placeholder="sua-chave-evolution"
                />
              </div>
              <Button onClick={save} disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
