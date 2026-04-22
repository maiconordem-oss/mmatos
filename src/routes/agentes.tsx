import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Bot, FileSignature, Trash2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/agentes")({
  head: () => ({ meta: [{ title: "Agentes IA — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AgentesPage />
    </AuthGate>
  ),
});

const MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (rápido, padrão)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (mais preciso)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 mini" },
  { value: "openai/gpt-5", label: "GPT-5 (top reasoning)" },
];

function AgentesPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: "", zapsign_template_id: "", description: "" });

  const loadAll = async () => {
    if (!user) return;
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from("ai_agent_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("zapsign_templates").select("*").order("created_at", { ascending: false }),
    ]);
    if (!s) {
      // criar default
      const { data: created } = await supabase.from("ai_agent_settings").insert({ user_id: user.id }).select().single();
      setSettings(created);
    } else {
      setSettings(s);
    }
    setTemplates(t ?? []);
  };

  useEffect(() => { loadAll(); }, [user]);

  const saveSettings = async () => {
    if (!settings || !user) return;
    const { error } = await supabase.from("ai_agent_settings").update({
      qualifier_enabled: settings.qualifier_enabled,
      qualifier_prompt: settings.qualifier_prompt,
      proposal_prompt: settings.proposal_prompt,
      ai_model: settings.ai_model,
      auto_send_proposal: settings.auto_send_proposal,
    }).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Configurações salvas");
  };

  const addTemplate = async () => {
    if (!user || !newTpl.name || !newTpl.zapsign_template_id) return;
    const { error } = await supabase.from("zapsign_templates").insert({
      user_id: user.id,
      name: newTpl.name,
      zapsign_template_id: newTpl.zapsign_template_id,
      description: newTpl.description || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Template cadastrado");
    setOpen(false);
    setNewTpl({ name: "", zapsign_template_id: "", description: "" });
    loadAll();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("zapsign_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Template removido"); loadAll(); }
  };

  if (!settings) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Toaster />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-6 w-6 text-gold" /> Agentes IA & Contratos</h1>
        <p className="text-sm text-muted-foreground">Configure os agentes de IA que qualificam leads e geram propostas, e cadastre os templates do ZapSign.</p>
      </header>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents"><Bot className="h-4 w-4 mr-2" /> Agentes IA</TabsTrigger>
          <TabsTrigger value="zapsign"><FileSignature className="h-4 w-4 mr-2" /> Templates ZapSign</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Modelo de IA</CardTitle>
              <CardDescription>Modelo usado pelos agentes</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={settings.ai_model}
                onChange={(e) => setSettings({ ...settings, ai_model: e.target.value })}
              >
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Agente Qualificador</CardTitle>
                <CardDescription>Conversa com o lead pelo WhatsApp e descobre área, urgência e descrição do caso</CardDescription>
              </div>
              <Switch checked={settings.qualifier_enabled} onCheckedChange={(v) => setSettings({ ...settings, qualifier_enabled: v })} />
            </CardHeader>
            <CardContent>
              <Label>Prompt do agente</Label>
              <Textarea
                rows={6}
                value={settings.qualifier_prompt}
                onChange={(e) => setSettings({ ...settings, qualifier_prompt: e.target.value })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Agente de Proposta</CardTitle>
                <CardDescription>Gera proposta de honorários a partir da qualificação</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>Auto-enviar</span>
                <Switch checked={settings.auto_send_proposal} onCheckedChange={(v) => setSettings({ ...settings, auto_send_proposal: v })} />
              </div>
            </CardHeader>
            <CardContent>
              <Label>Prompt do agente</Label>
              <Textarea
                rows={5}
                value={settings.proposal_prompt}
                onChange={(e) => setSettings({ ...settings, proposal_prompt: e.target.value })}
              />
            </CardContent>
          </Card>

          <Button onClick={saveSettings}>Salvar configurações</Button>
        </TabsContent>

        <TabsContent value="zapsign" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Como funciona</CardTitle>
              <CardDescription>
                Crie modelos de contrato no painel do ZapSign com variáveis ({"{{nome}}, {{cpf}}, {{valor}}"} etc.) e cole o ID do template aqui.
                Quando uma proposta for aceita, o sistema usa o template para gerar e enviar o contrato para assinatura.
                <br /><br />
                <strong>Para ativar o envio real:</strong> adicione o secret <code className="bg-muted px-1 rounded">ZAPSIGN_API_TOKEN</code> nas configurações do projeto. Sem ele, o contrato fica como <em>pendente</em> no CRM.
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Templates cadastrados ({templates.length})</h3>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo template</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar template ZapSign</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nome *</Label><Input value={newTpl.name} onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })} placeholder="Contrato de honorários trabalhista" /></div>
                  <div><Label>Template ID do ZapSign *</Label><Input value={newTpl.zapsign_template_id} onChange={(e) => setNewTpl({ ...newTpl, zapsign_template_id: e.target.value })} placeholder="abc123..." /></div>
                  <div><Label>Descrição</Label><Textarea value={newTpl.description} onChange={(e) => setNewTpl({ ...newTpl, description: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={addTemplate}>Cadastrar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum template cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {t.zapsign_template_id}</p>
                      {t.description && <p className="text-sm mt-1">{t.description}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
