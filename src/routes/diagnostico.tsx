import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Loader2, Play, Smartphone,
  Users, FileSignature, Calendar, Database, Bot,
  ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({ meta: [{ title: "Diagnóstico — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell><DiagnosticoPage /></AppShell></AuthGate>
  ),
});

type TesteStatus = "idle" | "loading" | "ok" | "erro";
type Resultado = { ok: boolean; etapas: string[]; erro?: string; extra?: any };

function StatusIcon({ status }: { status: TesteStatus }) {
  if (status === "loading") return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
  if (status === "ok")      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === "erro")    return <XCircle className="h-5 w-5 text-red-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-border" />;
}

function TesteCard({
  icon: Icon, cor, titulo, desc, status, resultado, onTestar, children,
}: {
  icon: any; cor: string; titulo: string; desc: string;
  status: TesteStatus; resultado: Resultado | null;
  onTestar: () => void; children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("rounded-xl border bg-card transition-all",
      status === "ok" ? "border-emerald-200" : status === "erro" ? "border-red-200" : "border-border")}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: cor + "20" }}>
            <Icon className="h-5 w-5" style={{ color: cor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusIcon status={status} />
                <Button size="sm" onClick={onTestar} disabled={status === "loading"}
                  variant={status === "ok" ? "outline" : "default"}
                  className="gap-1.5 text-xs h-8">
                  <Play className="h-3 w-3" />
                  {status === "loading" ? "Testando..." : "Testar"}
                </Button>
              </div>
            </div>

            {/* Campos de config */}
            {children && <div className="mt-4 space-y-2">{children}</div>}

            {/* Resultado */}
            {resultado && (
              <div className="mt-4">
                <button onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {resultado.etapas.length} etapa{resultado.etapas.length !== 1 ? "s" : ""}
                  {resultado.ok ? " — tudo ok" : " — ver erros"}
                </button>
                {expanded && (
                  <div className="space-y-1.5 pl-2 border-l-2" style={{ borderColor: resultado.ok ? "#22c55e" : "#ef4444" }}>
                    {resultado.etapas.map((e, i) => (
                      <p key={i} className={cn("text-xs leading-relaxed",
                        e.startsWith("✅") ? "text-emerald-700" :
                        e.startsWith("❌") ? "text-red-600" :
                        e.startsWith("⚠️") ? "text-amber-600" : "text-muted-foreground")}>
                        {e}
                      </p>
                    ))}
                    {resultado.erro && <p className="text-xs text-red-600 font-medium">{resultado.erro}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticoPage() {
  const [instancias, setInstancias] = useState<any[]>([]);
  const [funnels, setFunnels]       = useState<any[]>([]);
  const [instSel, setInstSel]       = useState("");
  const [numeroTeste, setNumeroTeste] = useState("");
  const [numerosGrupo, setNumerosGrupo] = useState("");
  const [nomeGrupo, setNomeGrupo]   = useState("Teste — Lex CRM");
  const [zapsignToken, setZapsignToken] = useState("");
  const [zapsignTemplate, setZapsignTemplate] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");

  const [statusWA, setStatusWA]     = useState<TesteStatus>("idle");
  const [statusGrupo, setStatusGrupo] = useState<TesteStatus>("idle");
  const [statusZap, setStatusZap]   = useState<TesteStatus>("idle");
  const [statusCal, setStatusCal]   = useState<TesteStatus>("idle");
  const [statusDB, setStatusDB]     = useState<TesteStatus>("idle");
  const [statusIA, setStatusIA]     = useState<TesteStatus>("idle");

  const [resWA, setResWA]     = useState<Resultado | null>(null);
  const [resGrupo, setResGrupo] = useState<Resultado | null>(null);
  const [resZap, setResZap]   = useState<Resultado | null>(null);
  const [resCal, setResCal]   = useState<Resultado | null>(null);
  const [resDB, setResDB]     = useState<Resultado | null>(null);
  const [resIA, setResIA]     = useState<Resultado | null>(null);

  useEffect(() => {
    supabase.from("whatsapp_instances").select("*").then(({ data }) => {
      setInstancias(data ?? []);
      if (data?.[0]) setInstSel(data[0].id);
    });
    supabase.from("funnels").select("id, name, zapsign_template_id").then(({ data }) => setFunnels(data ?? []));
  }, []);

  const testar = async (acao: string, payload: any, setStatus: any, setRes: any) => {
    setStatus("loading");
    try {
      const res = await fetch("/api/diagnostico", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, payload }),
      });
      const data: Resultado = await res.json();
      setRes(data);
      setStatus(data.ok ? "ok" : "erro");
      if (!data.ok) toast.error(data.erro || "Teste falhou — veja os detalhes");
      else toast.success("Teste concluído com sucesso!");
    } catch (e: any) {
      setRes({ ok: false, etapas: [], erro: e.message });
      setStatus("erro");
      toast.error("Erro: " + e.message);
    }
  };

  const testarTudo = async () => {
    await testar("test-db", {}, setStatusDB, setResDB);
    await testar("test-ia", {}, setStatusIA, setResIA);
    if (instSel) await testar("test-whatsapp", { instanceId: instSel, numero: numeroTeste }, setStatusWA, setResWA);
  };

  const okCount = [statusWA, statusGrupo, statusZap, statusCal, statusDB, statusIA].filter(s => s === "ok").length;
  const erroCount = [statusWA, statusGrupo, statusZap, statusCal, statusDB, statusIA].filter(s => s === "erro").length;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Diagnóstico de integrações</h1>
          <p className="text-muted-foreground text-sm mt-1">Teste cada integração individualmente antes de usar com clientes</p>
        </div>
        <div className="flex items-center gap-3">
          {(okCount + erroCount) > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {okCount > 0 && <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{okCount} ok</span>}
              {erroCount > 0 && <span className="text-red-500 font-medium flex items-center gap-1"><XCircle className="h-4 w-4" />{erroCount} erro</span>}
            </div>
          )}
          <Button onClick={testarTudo} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Testar tudo
          </Button>
        </div>
      </div>

      <div className="space-y-4">

        {/* Banco de dados */}
        <TesteCard icon={Database} cor="#6366f1" titulo="Banco de dados (Supabase)"
          desc="Verifica se todas as tabelas necessárias existem e estão acessíveis"
          status={statusDB} resultado={resDB}
          onTestar={() => testar("test-db", {}, setStatusDB, setResDB)} />

        {/* IA Anthropic */}
        <TesteCard icon={Bot} cor="#8b5cf6" titulo="IA — Anthropic Claude"
          desc="Verifica se a IA está respondendo corretamente"
          status={statusIA} resultado={resIA}
          onTestar={() => testar("test-ia", {}, setStatusIA, setResIA)} />

        {/* WhatsApp */}
        <TesteCard icon={Smartphone} cor="#25d366" titulo="WhatsApp — Evolution API"
          desc="Verifica conexão da instância e envia mensagem de teste"
          status={statusWA} resultado={resWA}
          onTestar={() => testar("test-whatsapp", { instanceId: instSel, numero: numeroTeste }, setStatusWA, setResWA)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Instância</Label>
              <select value={instSel} onChange={e => setInstSel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background text-sm px-3 py-2 outline-none">
                {instancias.map(i => <option key={i.id} value={i.id}>{i.instance_name} {i.is_office ? "(escritório)" : ""}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Enviar teste para (opcional)</Label>
              <Input className="mt-1 text-xs" placeholder="5551999999999" value={numeroTeste} onChange={e => setNumeroTeste(e.target.value)} />
            </div>
          </div>
        </TesteCard>

        {/* Grupo WhatsApp */}
        <TesteCard icon={Users} cor="#0ea5e9" titulo="Grupo WhatsApp"
          desc="Cria um grupo real com os números informados e envia mensagem de boas-vindas"
          status={statusGrupo} resultado={resGrupo}
          onTestar={() => {
            const nums = numerosGrupo.split("\n").map(n => n.trim()).filter(Boolean);
            testar("test-grupo", { instanceId: instSel, numeros: nums, nomeGrupo }, setStatusGrupo, setResGrupo);
          }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Instância</Label>
              <select value={instSel} onChange={e => setInstSel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background text-sm px-3 py-2 outline-none">
                {instancias.map(i => <option key={i.id} value={i.id}>{i.instance_name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Nome do grupo</Label>
              <Input className="mt-1 text-xs" value={nomeGrupo} onChange={e => setNomeGrupo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Números a adicionar (um por linha, com DDI)</Label>
            <textarea value={numerosGrupo} onChange={e => setNumerosGrupo(e.target.value)} rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background text-sm px-3 py-2 outline-none resize-none font-mono"
              placeholder={"5551997417926\n5551988887777"} />
          </div>
          <p className="text-[10px] text-amber-600 flex items-center gap-1">
            ⚠️ Isso criará um grupo REAL no WhatsApp. Use números de teste.
          </p>
        </TesteCard>

        {/* ZapSign */}
        <TesteCard icon={FileSignature} cor="#f59e0b" titulo="Contrato — ZapSign"
          desc="Verifica autenticação e lista templates disponíveis"
          status={statusZap} resultado={resZap}
          onTestar={() => testar("test-zapsign", { token: zapsignToken, templateId: zapsignTemplate }, setStatusZap, setResZap)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Token ZapSign</Label>
              <Input type="password" className="mt-1 text-xs font-mono" placeholder="seu-token-aqui"
                value={zapsignToken} onChange={e => setZapsignToken(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Template ID (opcional)</Label>
              <select value={zapsignTemplate} onChange={e => setZapsignTemplate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background text-sm px-3 py-2 outline-none">
                <option value="">Verificar só autenticação</option>
                {funnels.filter(f => f.zapsign_template_id).map(f => (
                  <option key={f.id} value={f.zapsign_template_id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        </TesteCard>

        {/* Google Calendar */}
        <TesteCard icon={Calendar} cor="#ef4444" titulo="Google Calendar"
          desc="Verifica se a URL do calendário está acessível"
          status={statusCal} resultado={resCal}
          onTestar={() => testar("test-calendar", { calendarUrl }, setStatusCal, setResCal)}>
          <div>
            <Label className="text-xs">URL do Google Calendar (webcal ou iCal)</Label>
            <Input className="mt-1 text-xs font-mono" placeholder="https://calendar.google.com/calendar/ical/..."
              value={calendarUrl} onChange={e => setCalendarUrl(e.target.value)} />
          </div>
        </TesteCard>

      </div>

      {/* Legenda */}
      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-foreground mb-2">Legenda</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Funcionando corretamente</span>
          <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-red-500" />Erro — ver detalhes</span>
          <span className="flex items-center gap-1.5">✅ Etapa bem-sucedida</span>
          <span className="flex items-center gap-1.5">⚠️ Aviso — atenção necessária</span>
        </div>
      </div>
    </div>
  );
}
