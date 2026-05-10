import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import {
  consultarProcesso, cadastrarProcesso, atualizarProcesso, marcarMovsLidas,
} from "@/server/datajud.functions";
import {
  Search, Plus, RefreshCw, Trash2, Scale, Clock, Building2,
  AlertCircle, CheckCircle2, FileText,
} from "lucide-react";

export const Route = createFileRoute("/processos")({
  head: () => ({ meta: [{ title: "Processos — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell><ProcessosPage /></AppShell></AuthGate>
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
type ClienteOpt = { id: string; full_name: string };
type CaseOpt = { id: string; title: string };

function fmtNumeroCnj(n: string) {
  const d = (n || "").replace(/\D/g, "");
  if (d.length !== 20) return n;
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`;
}
function fmtData(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
}

function ProcessosPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [movsCount, setMovsCount] = useState<Record<string, { total: number; novos: number }>>({});
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [casos, setCasos] = useState<CaseOpt[]>([]);
  const [filtro, setFiltro] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(false);

  // Form novo processo
  const [novoNumero, setNovoNumero] = useState("");
  const [novoCliente, setNovoCliente] = useState<string>("");
  const [novoCaso, setNovoCaso] = useState<string>("");
  const [novoNotas, setNovoNotas] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const fnConsultar = useAuthServerFn(consultarProcesso);
  const fnCadastrar = useAuthServerFn(cadastrarProcesso);
  const fnAtualizar = useAuthServerFn(atualizarProcesso);
  const fnMarcarLidas = useAuthServerFn(marcarMovsLidas);

  const carregar = useCallback(async () => {
    const { data: procs } = await supabase
      .from("processos_monitorados")
      .select("*")
      .order("ultima_movimentacao_em", { ascending: false, nullsFirst: false });
    setProcessos(procs ?? []);

    if (procs?.length) {
      const ids = procs.map(p => p.id);
      const { data: mvs } = await supabase
        .from("processo_movimentacoes")
        .select("processo_id, is_new")
        .in("processo_id", ids);
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
    supabase.from("clients").select("id, full_name").order("full_name").then(({ data }) => setClientes(data ?? []));
    supabase.from("cases").select("id, title").order("created_at", { ascending: false }).then(({ data }) => setCasos(data ?? []));
  }, [carregar]);

  const abrirDetalhe = async (id: string) => {
    setDetalheId(id);
    const { data } = await supabase
      .from("processo_movimentacoes")
      .select("*")
      .eq("processo_id", id)
      .order("data_movimentacao", { ascending: false });
    setMovs(data ?? []);
    // marca como lidas
    try {
      await fnMarcarLidas({ data: { processo_id: id } });
      setMovsCount(prev => ({ ...prev, [id]: { ...(prev[id] ?? { total:0, novos:0 }), novos: 0 } }));
    } catch {}
  };

  const handleAtualizar = async (id: string) => {
    setLoading(true);
    try {
      const r = await fnAtualizar({ data: { id } });
      toast.success(`${r.novos} nova(s) movimentação(ões)`);
      await carregar();
      if (detalheId === id) await abrirDetalhe(id);
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar");
    } finally { setLoading(false); }
  };

  const handleExcluir = async (id: string) => {
    if (!confirm("Remover este processo do acompanhamento?")) return;
    await supabase.from("processos_monitorados").delete().eq("id", id);
    toast.success("Processo removido");
    setDetalheId(null);
    carregar();
  };

  const handleCadastrar = async () => {
    if (!novoNumero || (novoNumero.replace(/\D/g, "")).length !== 20) {
      toast.error("Informe o número CNJ completo (20 dígitos)");
      return;
    }
    setPreviewing(true);
    try {
      await fnCadastrar({
        data: {
          numero: novoNumero,
          client_id: novoCliente || null,
          case_id: novoCaso || null,
          notas: novoNotas || undefined,
        },
      });
      toast.success("Processo cadastrado");
      setNovoOpen(false);
      setNovoNumero(""); setNovoCliente(""); setNovoCaso(""); setNovoNotas("");
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar processo");
    } finally { setPreviewing(false); }
  };

  // Consulta rápida (sem salvar)
  const [consultaNumero, setConsultaNumero] = useState("");
  const [consultaResult, setConsultaResult] = useState<any>(null);
  const [consultaLoading, setConsultaLoading] = useState(false);
  const handleConsultaRapida = async () => {
    setConsultaLoading(true); setConsultaResult(null);
    try {
      const r = await fnConsultar({ data: { numero: consultaNumero } });
      setConsultaResult(r);
    } catch (e: any) {
      toast.error(e.message || "Erro na consulta");
    } finally { setConsultaLoading(false); }
  };

  const filtrados = processos.filter(p => {
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return p.numero_processo.includes(f.replace(/\D/g,""))
      || (p.classe || "").toLowerCase().includes(f)
      || (p.assunto || "").toLowerCase().includes(f);
  });

  const detalhe = processos.find(p => p.id === detalheId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Toaster richColors />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scale className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Processos Judiciais</h1>
            <p className="text-sm text-muted-foreground">Acompanhamento via API CNJ Datajud</p>
          </div>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4" /> Acompanhar processo
        </Button>
      </div>

      {/* Consulta rápida */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" /> Consulta rápida
        </CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Número CNJ (ex: 0000000-00.0000.0.00.0000)"
              value={consultaNumero} onChange={e => setConsultaNumero(e.target.value)} />
            <Button variant="outline" onClick={handleConsultaRapida} disabled={consultaLoading}>
              {consultaLoading ? "..." : "Consultar"}
            </Button>
          </div>
          {consultaResult && (
            <div className="rounded-lg border p-3 text-sm space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="font-mono">{fmtNumeroCnj(consultaResult.numero)}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{consultaResult.tribunal}</span>
              </div>
              <div><b>Classe:</b> {consultaResult.classe || "—"}</div>
              <div><b>Assunto:</b> {consultaResult.assunto || "—"}</div>
              <div><b>Órgão:</b> {consultaResult.orgaoJulgador || "—"}</div>
              <div><b>Movimentações:</b> {consultaResult.movimentacoes.length}</div>
              <Button size="sm" variant="secondary" onClick={() => {
                setNovoNumero(consultaResult.numero); setNovoOpen(true);
              }}>
                <Plus className="h-3 w-3" /> Adicionar ao monitoramento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="flex items-center gap-2">
        <Input placeholder="Filtrar por número, classe ou assunto..."
          value={filtro} onChange={e => setFiltro(e.target.value)} className="max-w-sm" />
        <span className="text-sm text-muted-foreground">{filtrados.length} processo(s)</span>
      </div>

      <div className="grid gap-3">
        {filtrados.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum processo monitorado. Clique em "Acompanhar processo" para começar.
          </CardContent></Card>
        )}
        {filtrados.map(p => {
          const c = movsCount[p.id] ?? { total: 0, novos: 0 };
          return (
            <Card key={p.id} className="hover:shadow-md transition cursor-pointer"
              onClick={() => abrirDetalhe(p.id)}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{fmtNumeroCnj(p.numero_processo)}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">{p.tribunal}</span>
                    {c.novos > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">
                        {c.novos} nova(s)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {p.classe || "—"} · {p.assunto || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Última mov.: {fmtData(p.ultima_movimentacao_em)}
                    · {c.total} mov.
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={loading}
                  onClick={(e) => { e.stopPropagation(); handleAtualizar(p.id); }}>
                  <RefreshCw className={loading ? "animate-spin h-4 w-4" : "h-4 w-4"} />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog novo */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Acompanhar processo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Número CNJ</Label>
              <Input value={novoNumero} onChange={e => setNovoNumero(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000" />
            </div>
            <div>
              <Label>Cliente (opcional)</Label>
              <select className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={novoCliente} onChange={e => setNovoCliente(e.target.value)}>
                <option value="">— nenhum —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <Label>Caso/Card do Kanban (opcional)</Label>
              <select className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={novoCaso} onChange={e => setNovoCaso(e.target.value)}>
                <option value="">— nenhum —</option>
                {casos.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={novoNotas} onChange={e => setNovoNotas(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={handleCadastrar} disabled={previewing}>
              {previewing ? "Consultando..." : "Salvar e monitorar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalhe */}
      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{fmtNumeroCnj(detalhe.numero_processo)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><b>Tribunal:</b> {detalhe.tribunal}</div>
                  <div><b>Grau:</b> {(detalhe as any).grau || "—"}</div>
                  <div className="col-span-2"><b>Classe:</b> {detalhe.classe || "—"}</div>
                  <div className="col-span-2"><b>Assunto:</b> {detalhe.assunto || "—"}</div>
                  <div className="col-span-2"><b>Órgão julgador:</b> {detalhe.orgao_julgador || "—"}</div>
                  <div><b>Última consulta:</b> {fmtData(detalhe.ultima_consulta_em)}</div>
                  <div><b>Última mov.:</b> {fmtData(detalhe.ultima_movimentacao_em)}</div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => handleAtualizar(detalhe.id)} disabled={loading}>
                    <RefreshCw className={loading ? "animate-spin h-4 w-4" : "h-4 w-4"} /> Atualizar agora
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleExcluir(detalhe.id)}>
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                </div>

                <div className="pt-3">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Movimentações ({movs.length})
                  </h3>
                  <div className="space-y-2">
                    {movs.length === 0 && <p className="text-muted-foreground">Sem movimentações registradas.</p>}
                    {movs.map(m => (
                      <div key={m.id} className={`rounded-lg border p-3 ${m.is_new ? "border-primary bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.nome || `Código ${m.codigo}`}</span>
                          <span className="text-xs text-muted-foreground">{fmtData(m.data_movimentacao)}</span>
                        </div>
                        {m.complemento && <p className="text-xs text-muted-foreground mt-1">{m.complemento}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
