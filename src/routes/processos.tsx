import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
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
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { consultarProcesso, cadastrarProcesso, atualizarProcesso, marcarMovsLidas, buscarProcessosPorOAB } from "@/server/datajud.functions";
import { cn } from "@/lib/utils";
import {
  Search, Plus, RefreshCw, Trash2, Scale, Clock, Building2,
  FileText, Bell, BellOff, User, ChevronRight, X, AlertCircle,
  CheckCircle2, Loader2, MessageSquare, ExternalLink, Filter,
} from "lucide-react";

export const Route = createFileRoute("/processos")({
  head: () => ({ meta: [{ title: "Processos — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell noPadding><ProcessosPage /></AppShell></AuthGate>
  ),
});

type Processo = {
  id: string; numero_processo: string; tribunal: string; classe: string | null;
  assunto: string | null; orgao_julgador: string | null; ultima_movimentacao_em: string | null;
  ultima_consulta_em: string | null; client_id: string | null; case_id: string | null;
  notas: string | null; ativo: boolean;
};
type Mov = {
  id: string; codigo: number | null; nome: string | null;
  data_movimentacao: string | null; complemento: string | null; is_new: boolean;
};
type ClienteOpt = { id: string; full_name: string; whatsapp: string | null; phone: string | null };

function fmtCnj(n: string) {
  const d = (n || "").replace(/\D/g, "");
  if (d.length !== 20) return n;
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`;
}
function fmtData(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
  catch { return s; }
}
function fmtDataCurta(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR"); }
  catch { return s; }
}
function diasAtras(s: string | null) {
  if (!s) return null;
  const diff = (Date.now() - new Date(s).getTime()) / 86400000;
  if (diff < 1) return "hoje";
  if (diff < 2) return "ontem";
  return `${Math.floor(diff)}d atrás`;
}

// ── Painel de detalhe lateral ────────────────────────────────
function ProcessoDetalhe({ processo, movs, clientes, loading, onAtualizar, onExcluir, onClose, onNotificar }: {
  processo: Processo; movs: Mov[]; clientes: ClienteOpt[];
  loading: boolean; onAtualizar: () => void; onExcluir: () => void;
  onClose: () => void; onNotificar: () => void;
}) {
  const cliente = clientes.find(c => c.id === processo.client_id);
  const novas = movs.filter(m => m.is_new);

  return (
    <div className="w-[420px] shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-border shrink-0">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Scale className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-sm text-foreground leading-tight">{fmtCnj(processo.numero_processo)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{processo.tribunal}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
        <Button size="sm" onClick={onAtualizar} disabled={loading} className="gap-1.5 h-8 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
        {(cliente?.whatsapp || cliente?.phone) && (
          <Button size="sm" variant="outline" onClick={onNotificar} className="gap-1.5 h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50">
            <MessageSquare className="h-3.5 w-3.5" /> Notificar cliente
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onExcluir}
          className="gap-1.5 h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto">
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
      </div>

      {/* Dados */}
      <div className="flex-1 overflow-y-auto">
        {/* Info do processo */}
        <div className="p-5 space-y-3 border-b border-border">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Classe",      value: processo.classe },
              { label: "Tribunal",    value: processo.tribunal },
              { label: "Assunto",     value: processo.assunto },
              { label: "Órgão",       value: processo.orgao_julgador },
            ].map(({ label, value }) => (
              <div key={label} className={cn("rounded-lg border border-border bg-muted/30 p-2.5", label === "Assunto" || label === "Órgão" ? "col-span-2" : "")}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{label}</p>
                <p className="text-xs text-foreground font-medium">{value || "—"}</p>
              </div>
            ))}
          </div>

          {/* Datas */}
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Consultado: {fmtDataCurta(processo.ultima_consulta_em)}</span>
            <span>·</span>
            <span>Última mov.: {diasAtras(processo.ultima_movimentacao_em)}</span>
          </div>

          {/* Cliente vinculado */}
          {cliente && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <User className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{cliente.full_name}</p>
                <p className="text-[10px] text-muted-foreground">{cliente.whatsapp || cliente.phone}</p>
              </div>
            </div>
          )}

          {/* Notas */}
          {processo.notas && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] text-amber-700 uppercase tracking-wide font-semibold mb-0.5">Notas</p>
              <p className="text-xs text-amber-800">{processo.notas}</p>
            </div>
          )}
        </div>

        {/* Movimentações */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Movimentações ({movs.length})
            </h3>
            {novas.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">
                {novas.length} nova{novas.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {movs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhuma movimentação registrada</p>
              <p className="text-xs mt-0.5 opacity-70">Clique em Atualizar para buscar</p>
            </div>
          )}

          <div className="space-y-2">
            {movs.map((m, i) => (
              <div key={m.id} className={cn(
                "rounded-xl border p-3 transition-all",
                m.is_new ? "border-primary/40 bg-primary/5" : "border-border bg-card"
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {m.is_new && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-snug">
                        {m.nome || `Código ${m.codigo}`}
                      </p>
                      {m.complemento && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{m.complemento}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{fmtDataCurta(m.data_movimentacao)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────
function ProcessosPage() {
  const [processos, setProcessos]     = useState<Processo[]>([]);
  const [movsCount, setMovsCount]     = useState<Record<string, { total: number; novos: number }>>({});
  const [clientes, setClientes]       = useState<ClienteOpt[]>([]);
  const [casos, setCasos]             = useState<any[]>([]);
  const [filtro, setFiltro]           = useState("");
  const [filtroTribunal, setFiltroTribunal] = useState("");
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [movs, setMovs]               = useState<Mov[]>([]);
  const [loading, setLoading]         = useState(false);
  const [novoOpen, setNovoOpen]       = useState(false);
  const [consultaRapida, setConsultaRapida] = useState(false);
  const [consultaNum, setConsultaNum] = useState("");
  const [consultaRes, setConsultaRes] = useState<any>(null);
  const [consultaLoading, setConsultaLoading] = useState(false);

  // Form novo
  const [form, setForm] = useState({ numero: "", client_id: "", case_id: "", notas: "" });
  const [salvando, setSalvando] = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifMsg, setNotifMsg]           = useState("");
  const [oabOpen, setOabOpen]             = useState(false);
  const [oabNumero, setOabNumero]         = useState("");
  const [oabEstado, setOabEstado]         = useState("RS");
  const [oabResultados, setOabResultados] = useState<any[]>([]);
  const [oabLoading, setOabLoading]       = useState(false);
  const [oabSelecionados, setOabSelecionados] = useState<Set<string>>(new Set());
  const [oabSalvando, setOabSalvando]     = useState(false);

  const fnConsultar = useAuthServerFn(consultarProcesso);
  const fnCadastrar = useAuthServerFn(cadastrarProcesso);
  const fnAtualizar = useAuthServerFn(atualizarProcesso);
  const fnMarcarLidas = useAuthServerFn(marcarMovsLidas);
  const fnBuscarOAB   = useAuthServerFn(buscarProcessosPorOAB);

  const carregar = useCallback(async () => {
    const { data: procs } = await supabase
      .from("processos_monitorados").select("*")
      .order("ultima_movimentacao_em", { ascending: false, nullsFirst: false });
    setProcessos(procs ?? []);
    if (procs?.length) {
      const ids = procs.map(p => p.id);
      const { data: mvs } = await supabase
        .from("processo_movimentacoes").select("processo_id, is_new").in("processo_id", ids);
      const counts: Record<string, { total: number; novos: number }> = {};
      ids.forEach(id => counts[id] = { total: 0, novos: 0 });
      (mvs ?? []).forEach((m: any) => {
        counts[m.processo_id].total++;
        if (m.is_new) counts[m.processo_id].novos++;
      });
      setMovsCount(counts);
    }
  }, []);

  useEffect(() => {
    carregar();
    supabase.from("clients").select("id, full_name, whatsapp, phone").order("full_name")
      .then(({ data }) => setClientes(data ?? []));
    supabase.from("cases").select("id, title").order("created_at", { ascending: false })
      .then(({ data }) => setCasos(data ?? []));
  }, [carregar]);

  const abrirDetalhe = async (id: string) => {
    setActiveId(id);
    const { data } = await supabase.from("processo_movimentacoes").select("*")
      .eq("processo_id", id).order("data_movimentacao", { ascending: false });
    setMovs(data ?? []);
    try {
      await fnMarcarLidas({ data: { processo_id: id } });
      setMovsCount(prev => ({ ...prev, [id]: { ...(prev[id] ?? { total:0, novos:0 }), novos: 0 } }));
    } catch {}
  };

  const handleAtualizar = async (id: string) => {
    setLoading(true);
    try {
      const r = await fnAtualizar({ data: { id } });
      toast.success(`${r.novos} nova(s) movimentação(ões) encontrada(s)`);
      await carregar();
      if (activeId === id) await abrirDetalhe(id);
    } catch (e: any) { toast.error(e.message || "Erro ao atualizar"); }
    finally { setLoading(false); }
  };

  const handleAtualizarTodos = async () => {
    setLoading(true);
    let total = 0;
    for (const p of processos) {
      try { const r = await fnAtualizar({ data: { id: p.id } }); total += r.novos; } catch {}
    }
    toast.success(`Atualização concluída — ${total} nova(s) movimentação(ões)`);
    await carregar();
    setLoading(false);
  };

  const handleExcluir = async (id: string) => {
    if (!confirm("Remover este processo do monitoramento?")) return;
    await supabase.from("processos_monitorados").delete().eq("id", id);
    toast.success("Processo removido");
    setActiveId(null); carregar();
  };

  const handleCadastrar = async () => {
    if ((form.numero.replace(/\D/g, "")).length !== 20) {
      toast.error("Informe o número CNJ completo (20 dígitos)"); return;
    }
    setSalvando(true);
    try {
      await fnCadastrar({ data: { numero: form.numero, client_id: form.client_id || null, case_id: form.case_id || null, notas: form.notas || undefined } });
      toast.success("Processo cadastrado e monitorado!");
      setNovoOpen(false); setForm({ numero: "", client_id: "", case_id: "", notas: "" });
      carregar();
    } catch (e: any) { toast.error(e.message || "Erro ao cadastrar"); }
    finally { setSalvando(false); }
  };

  const handleConsultaRapida = async () => {
    if (!consultaNum.trim()) return;
    setConsultaLoading(true); setConsultaRes(null);
    try {
      const r = await fnConsultar({ data: { numero: consultaNum } });
      setConsultaRes(r);
    } catch (e: any) { toast.error(e.message || "Processo não encontrado"); }
    finally { setConsultaLoading(false); }
  };

  const handleNotificar = async () => {
    const processo = processos.find(p => p.id === activeId);
    const cliente = clientes.find(c => c.id === processo?.client_id);
    if (!cliente || (!cliente.whatsapp && !cliente.phone)) { toast.error("Cliente sem WhatsApp"); return; }

    const novasMovs = movs.filter(m => m.is_new);
    const msgPadrao = novasMovs.length > 0
      ? `Olá, *${cliente.full_name}*! Há novidades no seu processo *${fmtCnj(processo!.numero_processo)}*:\n\n${novasMovs.slice(0,3).map(m => `• ${m.nome}`).join("\n")}\n\nQualquer dúvida estou à disposição! 🏛️`
      : `Olá, *${cliente.full_name}*! Atualização do seu processo *${fmtCnj(processo!.numero_processo)}*.\n\nQualquer dúvida estou à disposição! 🏛️`;

    setNotifMsg(msgPadrao);
    setNotifOpen(true);
  };

  const handleBuscarOAB = async () => {
    if (!oabNumero.trim()) return;
    setOabLoading(true); setOabResultados([]); setOabSelecionados(new Set());
    try {
      const r = await fnBuscarOAB({ data: { oabNumero: oabNumero.trim(), oabEstado } });
      setOabResultados(r.processos);
      if (r.processos.length === 0) toast.info(`Nenhum processo encontrado para OAB ${oabNumero}/${oabEstado}`);
      else toast.success(`${r.processos.length} processo(s) encontrado(s) em ${r.tribunaisConsultados.length} tribunal(is)`);
    } catch (e: any) { toast.error(e.message || "Erro na busca"); }
    finally { setOabLoading(false); }
  };

  const handleSalvarSelecionados = async () => {
    if (oabSelecionados.size === 0) return;
    setOabSalvando(true);
    let salvos = 0;
    for (const numero of oabSelecionados) {
      try {
        await fnCadastrar({ data: { numero, client_id: null, case_id: null } });
        salvos++;
      } catch {}
    }
    toast.success(`${salvos} processo(s) adicionado(s) ao monitoramento!`);
    setOabOpen(false); setOabResultados([]); setOabSelecionados(new Set());
    setOabSalvando(false); carregar();
  };

  const enviarNotificacao = async () => {
    const processo = processos.find(p => p.id === activeId);
    const cliente = clientes.find(c => c.id === processo?.client_id);
    const numero = (cliente?.whatsapp || cliente?.phone || "").replace(/\D/g, "");
    if (!numero) return;

    const { data: inst } = await supabase.from("whatsapp_instances")
      .select("*").eq("status", "connected").eq("is_office", false).limit(1).maybeSingle();
    if (!inst?.api_url) { toast.error("Nenhuma instância WhatsApp conectada"); return; }

    const res = await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key ?? "" },
      body: JSON.stringify({ number: numero, text: notifMsg, options: { delay: 500 } }),
    }).catch(() => null);

    if (res?.ok) { toast.success("Notificação enviada via WhatsApp!"); setNotifOpen(false); }
    else toast.error("Erro ao enviar notificação");
  };

  // Filtros
  const tribunais = [...new Set(processos.map(p => p.tribunal))].sort();
  const filtrados = processos.filter(p => {
    const f = filtro.toLowerCase();
    const matchText = !f || p.numero_processo.includes(f.replace(/\D/g,"")) ||
      (p.classe || "").toLowerCase().includes(f) || (p.assunto || "").toLowerCase().includes(f);
    const matchTribunal = !filtroTribunal || p.tribunal === filtroTribunal;
    return matchText && matchTribunal;
  });

  const totalNovos = Object.values(movsCount).reduce((a, c) => a + c.novos, 0);
  const activeProcesso = processos.find(p => p.id === activeId);

  return (
    <div className="flex h-full overflow-hidden">
      <Toaster />

      {/* ── Lista ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Scale className="h-5 w-5 text-muted-foreground" /> Processos
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {processos.length} monitorado{processos.length !== 1 ? "s" : ""}
              {totalNovos > 0 && <span className="ml-2 text-red-500 font-semibold">· {totalNovos} nova{totalNovos > 1 ? "s" : ""} movimentação{totalNovos > 1 ? "ões" : ""}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOabOpen(true)} className="gap-1.5 text-xs h-8 text-violet-600 border-violet-200 hover:bg-violet-50">
              <Search className="h-3.5 w-3.5" /> Buscar por OAB
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConsultaRapida(true)} className="gap-1.5 text-xs h-8">
              <Search className="h-3.5 w-3.5" /> Consulta rápida
            </Button>
            <Button variant="outline" size="sm" onClick={handleAtualizarTodos} disabled={loading || processos.length === 0} className="gap-1.5 text-xs h-8">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar todos
            </Button>
            <Button size="sm" onClick={() => setNovoOpen(true)} className="gap-1.5 text-xs h-8">
              <Plus className="h-3.5 w-3.5" /> Monitorar processo
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={filtro} onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar por número, classe ou assunto..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted/50 border border-border text-sm outline-none focus:border-primary/50 transition-colors" />
          </div>
          {tribunais.length > 1 && (
            <select value={filtroTribunal} onChange={e => setFiltroTribunal(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background text-xs px-2 outline-none">
              <option value="">Todos os tribunais</option>
              {tribunais.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <span className="text-xs text-muted-foreground shrink-0">{filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Lista de processos */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtrados.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{processos.length === 0 ? "Nenhum processo monitorado" : "Nenhum resultado"}</p>
              {processos.length === 0 && (
                <>
                  <p className="text-xs mt-1 opacity-70">Clique em "Monitorar processo" para começar</p>
                  <Button className="mt-4 gap-2" onClick={() => setNovoOpen(true)}>
                    <Plus className="h-4 w-4" /> Monitorar primeiro processo
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            {filtrados.map(p => {
              const c = movsCount[p.id] ?? { total: 0, novos: 0 };
              const cliente = clientes.find(cl => cl.id === p.client_id);
              const isActive = activeId === p.id;
              return (
                <div key={p.id}
                  onClick={() => abrirDetalhe(p.id)}
                  className={cn(
                    "rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-sm",
                    isActive ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border hover:border-primary/20"
                  )}>
                  <div className="flex items-start gap-3">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      c.novos > 0 ? "bg-red-500/10" : "bg-primary/10")}>
                      {c.novos > 0
                        ? <Bell className="h-5 w-5 text-red-500" />
                        : <Building2 className="h-5 w-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-foreground">{fmtCnj(p.numero_processo)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{p.tribunal}</span>
                        {c.novos > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">
                            {c.novos} nova{c.novos > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {p.classe || "—"}{p.assunto ? ` · ${p.assunto}` : ""}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {cliente && (
                          <span className="text-[10px] text-primary flex items-center gap-1">
                            <User className="h-3 w-3" />{cliente.full_name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />{diasAtras(p.ultima_movimentacao_em)} · {c.total} mov.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleAtualizar(p.id); }}
                        disabled={loading}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </button>
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isActive && "rotate-90")} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Painel lateral de detalhe ── */}
      {activeId && activeProcesso && (
        <ProcessoDetalhe
          processo={activeProcesso} movs={movs} clientes={clientes}
          loading={loading}
          onAtualizar={() => handleAtualizar(activeId)}
          onExcluir={() => handleExcluir(activeId)}
          onClose={() => setActiveId(null)}
          onNotificar={handleNotificar}
        />
      )}

      {/* ── Modal: Monitorar novo ── */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Monitorar processo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Número CNJ *</Label>
              <Input className="mt-1 font-mono" value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
                placeholder="0000000-00.0000.0.00.0000" />
              <p className="text-[10px] text-muted-foreground mt-1">20 dígitos — o sistema detecta o tribunal automaticamente</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cliente vinculado (opcional)</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm outline-none"
                value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
                <option value="">— nenhum —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Caso do Kanban (opcional)</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm outline-none"
                value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}>
                <option value="">— nenhum —</option>
                {casos.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notas internas</Label>
              <Textarea className="mt-1 resize-none text-sm" rows={2} value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                placeholder="Ex: Ação de vaga em creche — 1ª instância..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={handleCadastrar} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
              {salvando ? "Consultando CNJ..." : "Salvar e monitorar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Busca por OAB ── */}
      <Dialog open={oabOpen} onOpenChange={v => { setOabOpen(v); if (!v) { setOabResultados([]); setOabSelecionados(new Set()); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-violet-600" />
              Buscar processos por OAB
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 shrink-0">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Número OAB *</Label>
                <Input className="mt-1 font-mono" value={oabNumero}
                  onChange={e => setOabNumero(e.target.value.replace(/\D/g, ""))}
                  placeholder="136221" onKeyDown={e => e.key === "Enter" && handleBuscarOAB()} />
              </div>
              <div className="w-24">
                <Label className="text-xs text-muted-foreground">Estado</Label>
                <select value={oabEstado} onChange={e => setOabEstado(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm outline-none">
                  {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleBuscarOAB} disabled={oabLoading || !oabNumero.trim()} className="gap-1.5 h-9">
                  {oabLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {oabLoading ? "Buscando..." : "Buscar"}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Consulta os tribunais do estado selecionado (TJ, TRT e TRF). Pode levar alguns segundos.
            </p>
          </div>

          {/* Resultados */}
          {oabResultados.length > 0 && (
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              <div className="flex items-center justify-between sticky top-0 bg-background py-2">
                <p className="text-sm font-semibold text-foreground">{oabResultados.length} processo(s) encontrado(s)</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOabSelecionados(new Set(oabResultados.map(p => p.numero)))}
                    className="text-xs text-primary hover:underline">Selecionar todos</button>
                  <span className="text-muted-foreground">·</span>
                  <button onClick={() => setOabSelecionados(new Set())}
                    className="text-xs text-muted-foreground hover:underline">Limpar</button>
                </div>
              </div>

              {oabResultados.map(p => {
                const sel = oabSelecionados.has(p.numero);
                const jaMonitorado = processos.some(pm => pm.numero_processo.replace(/\D/g,"") === p.numero.replace(/\D/g,""));
                return (
                  <div key={p.numero}
                    onClick={() => !jaMonitorado && setOabSelecionados(prev => {
                      const n = new Set(prev);
                      sel ? n.delete(p.numero) : n.add(p.numero);
                      return n;
                    })}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      jaMonitorado ? "border-border bg-muted/30 opacity-50 cursor-not-allowed" :
                      sel ? "border-primary bg-primary/5 cursor-pointer" :
                      "border-border bg-card hover:border-primary/30 cursor-pointer"
                    )}>
                    <div className="flex items-start gap-3">
                      <div className={cn("h-4 w-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-all",
                        sel ? "bg-primary border-primary" : "border-muted-foreground")}>
                        {sel && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-foreground">{fmtCnj(p.numero)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.tribunal}</span>
                          {p.grau && <span className="text-[10px] text-muted-foreground">{p.grau}</span>}
                          {jaMonitorado && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">já monitorado</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {p.classe || "—"}{p.assunto ? ` · ${p.assunto}` : ""}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          {p.orgaoJulgador && <span>{p.orgaoJulgador}</span>}
                          {p.dataAjuizamento && <span>Ajuizado: {fmtDataCurta(p.dataAjuizamento)}</span>}
                          {p.totalMovimentos > 0 && <span>{p.totalMovimentos} mov.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-muted-foreground flex-1">
                {oabSelecionados.size > 0 ? `${oabSelecionados.size} selecionado(s)` : "Selecione os processos para monitorar"}
              </span>
              <Button variant="outline" onClick={() => setOabOpen(false)}>Fechar</Button>
              <Button onClick={handleSalvarSelecionados} disabled={oabSelecionados.size === 0 || oabSalvando} className="gap-1.5">
                {oabSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {oabSalvando ? "Adicionando..." : `Monitorar ${oabSelecionados.size > 0 ? oabSelecionados.size : ""} selecionado(s)`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Consulta rápida ── */}
      <Dialog open={consultaRapida} onOpenChange={v => { setConsultaRapida(v); if (!v) setConsultaRes(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Search className="h-4 w-4" />Consulta rápida — CNJ</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input className="font-mono flex-1" value={consultaNum} onChange={e => setConsultaNum(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                onKeyDown={e => e.key === "Enter" && handleConsultaRapida()} />
              <Button onClick={handleConsultaRapida} disabled={consultaLoading} className="gap-1.5">
                {consultaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar
              </Button>
            </div>
            {consultaRes && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm">{fmtCnj(consultaRes.numero)}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{consultaRes.tribunal}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground text-xs">Classe: </span>{consultaRes.classe || "—"}</div>
                  <div><span className="text-muted-foreground text-xs">Movimentações: </span>{consultaRes.movimentacoes?.length ?? 0}</div>
                  <div className="col-span-2"><span className="text-muted-foreground text-xs">Assunto: </span>{consultaRes.assunto || "—"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground text-xs">Órgão: </span>{consultaRes.orgaoJulgador || "—"}</div>
                </div>
                <Button size="sm" className="gap-1.5 w-full" onClick={() => {
                  setForm(p => ({ ...p, numero: consultaRes.numero }));
                  setConsultaRapida(false); setConsultaRes(null);
                  setNovoOpen(true);
                }}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar ao monitoramento
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Notificar cliente ── */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-emerald-600" />Notificar cliente via WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Mensagem será enviada para o cliente vinculado ao processo.</p>
            <Textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} rows={6} className="text-sm resize-none font-mono" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifOpen(false)}>Cancelar</Button>
            <Button onClick={enviarNotificacao} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500">
              <MessageSquare className="h-4 w-4" /> Enviar no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
