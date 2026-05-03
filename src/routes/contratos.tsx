import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSignature, Send, ExternalLink, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { sendContract, checkZapsignToken } from "@/server/zapsign.functions";
import { useAuthServerFn } from "@/hooks/use-server-fn";

export const Route = createFileRoute("/contratos")({
  head: () => ({ meta: [{ title: "Propostas & Contratos — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ContractsPage />
      </AppShell>
    </AuthGate>
  ),
});

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-muted",
  enviada: "bg-blue-500/20 text-blue-700",
  aceita: "bg-green-500/20 text-green-700",
  recusada: "bg-red-500/20 text-red-700",
  pendente: "bg-muted",
  enviado: "bg-blue-500/20 text-blue-700",
  visualizado: "bg-amber-500/20 text-amber-700",
  assinado: "bg-green-500/20 text-green-700",
  recusado: "bg-red-500/20 text-red-700",
  expirado: "bg-muted",
};

function ContractsPage() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState<any>(null);
  const [signForm, setSignForm] = useState({ templateId: "", signerName: "", signerEmail: "", signerPhone: "" });
  const sendContractFn = useAuthServerFn(sendContract);

  const load = async () => {
    const [{ data: p }, { data: c }, { data: t }, { data: cl }] = await Promise.all([
      supabase.from("proposals").select("*").order("created_at", { ascending: false }),
      supabase.from("contracts").select("*").order("created_at", { ascending: false }),
      supabase.from("zapsign_templates").select("*").eq("active", true),
      supabase.from("clients").select("id, full_name, email, phone, whatsapp"),
    ]);
    setProposals(p ?? []);
    setContracts(c ?? []);
    setTemplates(t ?? []);
    setClients(cl ?? []);
  };

  useEffect(() => { load(); }, []);

  const openSendContract = (prop: any) => {
    const client = clients.find((c) => c.id === prop.client_id);
    setSelectedProp(prop);
    setSignForm({
      templateId: templates[0]?.id ?? "",
      signerName: client?.full_name ?? "",
      signerEmail: client?.email ?? "",
      signerPhone: client?.whatsapp ?? client?.phone ?? "",
    });
    setSignOpen(true);
  };

  const handleSendContract = async () => {
    if (!selectedProp || !signForm.templateId) { toast.error("Selecione um template"); return; }
    try {
      const res = await sendContractFn({ data: {
        proposalId: selectedProp.id,
        templateId: signForm.templateId,
        signerName: signForm.signerName,
        signerEmail: signForm.signerEmail,
        signerPhone: signForm.signerPhone || undefined,
        variables: {
          nome: signForm.signerName,
          email: signForm.signerEmail,
          valor: `R$ ${Number(selectedProp.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          escopo: selectedProp.scope,
          prazo: selectedProp.estimated_duration ?? "",
        },
      }});
      if (res.zapsignError) {
        toast.warning(`Contrato registrado, mas envio ZapSign falhou: ${res.zapsignError}`);
      } else {
        toast.success("Contrato enviado para assinatura!");
      }
      setSignOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateProposalStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("proposals").update({
      status: status as any,
      responded_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Status atualizado"); load(); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Toaster />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FileSignature className="h-6 w-6 text-gold" /> Propostas & Contratos</h1>
        <p className="text-sm text-muted-foreground">Gerencie propostas geradas pela IA e envie contratos via ZapSign</p>
      </header>

      <Tabs defaultValue="proposals">
        <TabsList>
          <TabsTrigger value="proposals">Propostas ({proposals.length})</TabsTrigger>
          <TabsTrigger value="contracts">Contratos ({contracts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="space-y-3 mt-4">
          {proposals.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">Nenhuma proposta gerada ainda. Use o botão "IA: Gerar proposta" no Kanban ou na Inbox.</p>}
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{p.title}</h3>
                      <Badge className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                      {p.ai_generated && <Badge variant="outline" className="text-gold border-gold/40">IA</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{p.scope}</p>
                    <div className="flex gap-4 text-sm">
                      <span><strong>R$ {Number(p.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                      {p.payment_terms && <span className="text-muted-foreground">{p.payment_terms}</span>}
                      {p.estimated_duration && <span className="text-muted-foreground">⏱ {p.estimated_duration}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {p.status === "rascunho" && <Button size="sm" variant="outline" onClick={() => updateProposalStatus(p.id, "enviada")}>Marcar enviada</Button>}
                    {(p.status === "rascunho" || p.status === "enviada") && (
                      <Button size="sm" onClick={() => openSendContract(p)}><Send className="h-3 w-3 mr-1" /> Enviar contrato</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="contracts" className="space-y-3 mt-4">
          {contracts.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">Nenhum contrato enviado.</p>}
          {contracts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                    {c.zapsign_document_id && <span className="text-xs text-muted-foreground">Doc: {c.zapsign_document_id}</span>}
                  </div>
                  <p className="text-sm">Criado em {new Date(c.created_at).toLocaleDateString("pt-BR")}</p>
                  {c.signed_at && <p className="text-sm text-green-700">Assinado em {new Date(c.signed_at).toLocaleString("pt-BR")}</p>}
                </div>
                {c.signing_url && (
                  <a href={c.signing_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Link de assinatura</Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar contrato via ZapSign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cadastre um template em <a href="/agentes" className="text-primary underline">Agentes IA</a> primeiro.</p>
            ) : (
              <div>
                <Label>Template *</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={signForm.templateId}
                  onChange={(e) => setSignForm({ ...signForm, templateId: e.target.value })}
                >
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div><Label>Nome do signatário *</Label><Input value={signForm.signerName} onChange={(e) => setSignForm({ ...signForm, signerName: e.target.value })} /></div>
            <div><Label>Email *</Label><Input type="email" value={signForm.signerEmail} onChange={(e) => setSignForm({ ...signForm, signerEmail: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={signForm.signerPhone} onChange={(e) => setSignForm({ ...signForm, signerPhone: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={handleSendContract} disabled={templates.length === 0}>Enviar para assinatura</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
