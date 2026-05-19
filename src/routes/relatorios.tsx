import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  TrendingUp, Clock, FileSignature, Users, Calendar,
  ChevronRight, MessageSquare, Zap, Star, Download,
  AlertTriangle, ArrowUp, ArrowDown, Minus, Bot,
} from "lucide-react";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { aiMetrics } from "@/server/ai-debug.functions";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell><RelatoriosPage /></AppShell></AuthGate>
  ),
});

const FASE_COLORS: Record<string, string> = {
  abertura: "#64748b", triagem: "#3b82f6", conexao: "#f97316",
  fechamento: "#ec4899", coleta: "#8b5cf6", assinatura: "#22c55e", encerrado: "#10b981",
};

const PERIOD_OPTIONS = [
  { label: "7 dias",  days: 7  },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function fmtMs(ms: number) {
  if (!ms) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function Tendencia({ v }: { v: number }) {
  if (v > 0) return <span className="text-emerald-500 text-xs flex items-center gap-0.5"><ArrowUp className="h-3 w-3" />+{v}%</span>;
  if (v < 0) return <span className="text-red-500 text-xs flex items-center gap-0.5"><ArrowDown className="h-3 w-3" />{v}%</span>;
  return <span className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>;
}

function RelatoriosPage() {
  const [period, setPeriod]           = useState(30);
  const [tab, setTab]                 = useState<"funis"|"leads"|"agenda"|"retencao"|"ia">("funis");
  const [aiData, setAiData]           = useState<any>(null);
  const fetchAI                       = useAuthServerFn(aiMetrics);
  const [loading, setLoading]         = useState(true);

  // Dados por funil
  const [funisPerfomance, setFunisPerf] = useState<any[]>([]);

  // Dados de leads por origem/fase
  const [taxaConversaoPorFase, setTaxaPorFase] = useState<any[]>([]);
  const [dropoffPorFase, setDropoff]    = useState<any[]>([]);
  const [comparativoFunis, setComparativo] = useState<any[]>([]);

  // Dados de tempo
  const [tempoMedioPorFase, setTempoPorFase] = useState<any[]>([]);
  const [horariosPico, setHorariosPico]  = useState<any[]>([]);

  // Agenda
  const [appointments, setAppointments]  = useState<any[]>([]);
  const [apptStats, setApptStats]        = useState({ total: 0, realizados: 0, pendentes: 0, taxa: 0 });

  // Retenção
  const [retencao, setRetencao]          = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - period * 86400000).toISOString();

    const [statesRes, apptRes, funisRes, convsRes] = await Promise.all([
      supabase.from("funnel_states").select("*, funnels(name), conversations(contact_name, phone)").gte("created_at", since),
      supabase.from("appointments").select("*, conversations(contact_name, phone)").order("start_at", { ascending: true }),
      supabase.from("funnels").select("id, name").eq("is_active", true),
      supabase.from("conversations").select("id, created_at, ticket_status, last_message_at").gte("created_at", since),
    ]);

    const states = statesRes.data ?? [];
    const funnels = funisRes.data ?? [];
    const convs   = convsRes.data ?? [];
    const apts    = apptRes.data ?? [];

    // ── 1. Performance por funil ──────────────────────────────
    const perfMap: Record<string, any> = {};
    funnels.forEach(f => {
      perfMap[f.id] = { nome: f.name, total: 0, encerrados: 0, assinados: 0, tempos: [] };
    });
    states.forEach(s => {
      const fid = (s as any).funnels?.name ? s.funnel_id : null;
      const fname = (s as any).funnels?.name || "Sem funil";
      if (!perfMap[fname]) perfMap[fname] = { nome: fname, total: 0, encerrados: 0, assinados: 0, tempos: [] };
      const key = fid || fname;
      if (!perfMap[key]) perfMap[key] = { nome: fname, total: 0, encerrados: 0, assinados: 0, tempos: [] };
      perfMap[key].total++;
      if (s.fase === "encerrado") {
        perfMap[key].encerrados++;
        const h = (new Date(s.updated_at).getTime() - new Date(s.created_at).getTime()) / 3600000;
        perfMap[key].tempos.push(h);
      }
      if (["assinatura", "encerrado"].includes(s.fase)) perfMap[key].assinados++;
    });
    const perfList = Object.values(perfMap).filter((f: any) => f.total > 0).map((f: any) => ({
      nome: f.nome.length > 20 ? f.nome.slice(0, 18) + "…" : f.nome,
      leads: f.total,
      contratos: f.assinados,
      conversao: f.total > 0 ? Math.round((f.assinados / f.total) * 100) : 0,
      tempoMedio: f.tempos.length ? Math.round(f.tempos.reduce((a: number, b: number) => a + b, 0) / f.tempos.length) : 0,
    }));
    setFunisPerf(perfList);

    // ── 2. Dropoff por fase (onde os leads abandonam) ─────────
    const fases = ["abertura", "triagem", "conexao", "fechamento", "coleta", "assinatura", "encerrado"];
    const faseCounts = fases.map(f => ({ fase: f, count: states.filter(s => s.fase === f).length, color: FASE_COLORS[f] }));

    // Taxa de conversão entre fases
    const conversoes = fases.slice(0, -1).map((f, i) => {
      const atual = faseCounts[i].count;
      const proximo = faseCounts[i + 1].count;
      return {
        de: f, para: fases[i + 1],
        taxa: atual > 0 ? Math.round((proximo / atual) * 100) : 0,
        perdidos: Math.max(0, atual - proximo),
      };
    });
    setDropoff(conversoes);
    setTaxaPorFase(faseCounts);

    // ── 3. Horários de pico (hora do dia) ─────────────────────
    const horas: Record<number, number> = {};
    for (let i = 0; i < 24; i++) horas[i] = 0;
    convs.forEach(c => { const h = new Date(c.created_at).getHours(); horas[h]++; });
    setHorariosPico(Object.entries(horas)
      .map(([h, count]) => ({ hora: `${h}h`, count }))
      .filter((_, i) => i >= 6 && i <= 22));

    // ── 4. Agenda ─────────────────────────────────────────────
    setAppointments(apts);
    const realizados = apts.filter(a => new Date(a.end_at) < new Date()).length;
    const pendentes  = apts.filter(a => new Date(a.start_at) > new Date()).length;
    setApptStats({ total: apts.length, realizados, pendentes, taxa: apts.length > 0 ? Math.round((realizados / apts.length) * 100) : 0 });

    // ── 5. Retenção — leads que voltaram vs novos ──────────────
    const semanas: Record<string, { novos: number; retorno: number }> = {};
    const phoneCounts: Record<string, number> = {};
    convs.forEach(c => {
      const week = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (7 * 86400000));
      const key  = `Sem -${week}`;
      if (!semanas[key]) semanas[key] = { novos: 0, retorno: 0 };
      // Simplificado: considera retorno se ticket foi reaberto
      if (c.ticket_status === "open") semanas[key].novos++;
      else semanas[key].retorno++;
    });
    setRetencao(Object.entries(semanas).slice(0, 8).reverse().map(([sem, v]) => ({ sem, ...v })));

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const exportarCSV = () => {
    const rows = [
      ["Funil", "Leads", "Contratos", "Conversão %", "Tempo Médio (h)"],
      ...funisPerfomance.map(f => [f.nome, f.leads, f.contratos, f.conversao, f.tempoMedio]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `relatorio_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const TABS = [
    { id: "funis",   label: "Por funil",         icon: Zap },
    { id: "leads",   label: "Onde perdem leads",  icon: TrendingUp },
    { id: "agenda",  label: "Agenda",             icon: Calendar },
    { id: "retencao",label: "Horários de pico",   icon: Clock },
    { id: "ia",      label: "IA & Atendimento",   icon: Bot },
  ] as const;

  useEffect(() => {
    if (tab !== "ia") return;
    fetchAI({ data: { days: period } }).then(r => setAiData(r)).catch(() => setAiData(null));
  }, [tab, period, fetchAI]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Análise histórica — o que aconteceu no período</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
          {PERIOD_OPTIONS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                period === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2.5 border-b border-border shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              tab === t.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/50")}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* ── POR FUNIL ── */}
          {tab === "funis" && (
            <>
              {/* Tabela de performance */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <p className="font-semibold text-foreground">Performance por funil</p>
                  <p className="text-xs text-muted-foreground">{funisPerfomance.length} funil(s) ativo(s)</p>
                </div>
                {funisPerfomance.length === 0
                  ? <p className="text-center text-muted-foreground py-8 text-sm">Nenhum dado no período</p>
                  : <div className="divide-y divide-border">
                      <div className="grid grid-cols-5 px-5 py-2.5 bg-muted/30">
                        {["Funil","Leads","Contratos","Conversão","Tempo médio"].map(h => (
                          <span key={h} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                        ))}
                      </div>
                      {funisPerfomance.map((f, i) => (
                        <div key={i} className="grid grid-cols-5 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                          <span className="text-sm font-medium text-foreground">{f.nome}</span>
                          <span className="text-sm text-foreground">{f.leads}</span>
                          <span className="text-sm text-emerald-600 font-medium">{f.contratos}</span>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted max-w-[80px]">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${f.conversao}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-primary">{f.conversao}%</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{f.tempoMedio}h</span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Gráfico comparativo */}
              {funisPerfomance.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="font-semibold text-foreground mb-4">Leads vs Contratos por funil</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={funisPerfomance} barGap={4}>
                      <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={25} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey="contratos" name="Contratos" fill="#22c55e" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* ── ONDE PERDEM LEADS ── */}
          {tab === "leads" && (
            <>
              {/* Dropoff por fase */}
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-1">Onde os leads abandonam</p>
                <p className="text-xs text-muted-foreground mb-4">Taxa de conversão entre cada fase do funil</p>
                <div className="space-y-3">
                  {dropoffPorFase.map((d, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs capitalize text-muted-foreground w-20 text-right shrink-0">{d.de}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs capitalize text-muted-foreground w-20 shrink-0">{d.para}</span>
                      <div className="flex-1 h-6 rounded-lg bg-muted relative overflow-hidden">
                        <div className="h-full rounded-lg transition-all" style={{ width: `${d.taxa}%`, background: d.taxa >= 70 ? "#22c55e" : d.taxa >= 40 ? "#f59e0b" : "#ef4444" }} />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-foreground mix-blend-multiply">{d.taxa}%</span>
                      </div>
                      {d.perdidos > 0 && (
                        <span className="text-xs text-red-500 shrink-0 flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" />-{d.perdidos}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pizza por fase */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="font-semibold text-foreground mb-4">Distribuição atual por fase</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={taxaConversaoPorFase.filter(f => f.count > 0)} dataKey="count" nameKey="fase"
                        cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                        {taxaConversaoPorFase.filter(f => f.count > 0).map(f => <Cell key={f.fase} fill={f.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {taxaConversaoPorFase.filter(f => f.count > 0).map(f => (
                      <span key={f.fase} className="text-[10px] flex items-center gap-1 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full inline-block" style={{ background: f.color }} />{f.fase} ({f.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Alertas de perda */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />Pontos críticos
                  </p>
                  <div className="space-y-3">
                    {dropoffPorFase.filter(d => d.taxa < 50).length === 0
                      ? <p className="text-sm text-emerald-600 font-medium">✅ Nenhum gargalo crítico!</p>
                      : dropoffPorFase.filter(d => d.taxa < 50).sort((a, b) => a.taxa - b.taxa).map((d, i) => (
                          <div key={i} className="p-3 rounded-lg bg-red-50 border border-red-200">
                            <p className="text-xs font-semibold text-red-700 capitalize">{d.de} → {d.para}</p>
                            <p className="text-xs text-red-600 mt-0.5">Apenas {d.taxa}% avançam — {d.perdidos} leads perdidos</p>
                            <p className="text-[10px] text-red-500 mt-1">
                              {d.de === "triagem" ? "💡 Revise as perguntas de triagem ou os critérios de exclusão" :
                               d.de === "conexao" ? "💡 O vídeo de conexão pode precisar de mais emoção" :
                               d.de === "fechamento" ? "💡 O áudio de fechamento pode não estar persuasivo" :
                               "💡 Verifique o fluxo desta fase"}
                            </p>
                          </div>
                        ))
                    }
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── AGENDA ── */}
          {tab === "agenda" && (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total agendado", value: apptStats.total,     color: "text-blue-500" },
                  { label: "Realizados",      value: apptStats.realizados,color: "text-emerald-500" },
                  { label: "Pendentes",       value: apptStats.pendentes, color: "text-amber-500" },
                ].map(k => (
                  <div key={k.label} className="rounded-xl border border-border bg-card p-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{k.label}</p>
                    <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="font-semibold text-foreground">Agendamentos</p>
                </div>
                {appointments.length === 0
                  ? <div className="text-center py-12 text-muted-foreground"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Nenhum agendamento encontrado</p></div>
                  : <div className="divide-y divide-border">
                      {appointments.map((a: any) => {
                        const start = new Date(a.start_at);
                        const isPast = start < new Date();
                        const isSoon = !isPast && (start.getTime() - Date.now()) < 3600000;
                        return (
                          <div key={a.id} className={cn("flex items-center gap-4 px-5 py-3.5", isPast && "opacity-50")}>
                            <div className="text-center shrink-0 w-12">
                              <p className="text-xl font-bold text-foreground">{start.getDate()}</p>
                              <p className="text-[10px] text-muted-foreground">{start.toLocaleDateString("pt-BR", { month: "short" })}</p>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{a.title}</p>
                              <p className="text-xs text-muted-foreground">{start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — {(a.conversations as any)?.contact_name || "Lead"}</p>
                            </div>
                            <span className={cn("text-xs px-2 py-1 rounded-full font-medium",
                              isPast ? "bg-muted text-muted-foreground" : isSoon ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                              {isPast ? "Encerrado" : isSoon ? "Em breve" : "Confirmado"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                }
              </div>
            </>
          )}

          {/* ── HORÁRIOS DE PICO ── */}
          {tab === "retencao" && (
            <>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-1">Horários de pico — quando os leads chegam</p>
                <p className="text-xs text-muted-foreground mb-4">Ótimo para saber quando gravar vídeos e estar disponível</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={horariosPico}>
                    <XAxis dataKey="hora" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" name="Leads" radius={[4,4,0,0]}
                      fill="#3b82f6"
                      label={false} />
                  </BarChart>
                </ResponsiveContainer>
                {horariosPico.length > 0 && (() => {
                  const pico = horariosPico.reduce((a, b) => a.count > b.count ? a : b);
                  return <p className="text-xs text-muted-foreground mt-2">🏆 Horário de maior movimento: <strong className="text-foreground">{pico.hora}</strong> ({pico.count} leads)</p>;
                })()}
              </div>

              {/* Leads por dia da semana */}
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-1">Tempo médio por fase (dias)</p>
                <p className="text-xs text-muted-foreground mb-4">Quanto tempo em média o lead passa em cada fase antes de avançar</p>
                {taxaConversaoPorFase.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-4">Sem dados suficientes</p>
                  : <div className="space-y-2">
                      {taxaConversaoPorFase.filter(f => f.count > 0).map(f => (
                        <div key={f.fase} className="flex items-center gap-3">
                          <span className="text-xs capitalize text-muted-foreground w-24 text-right shrink-0">{f.fase}</span>
                          <div className="flex-1 h-5 rounded-lg bg-muted relative overflow-hidden">
                            <div className="h-full rounded-lg" style={{ width: `${Math.min(100, (f.count / Math.max(...taxaConversaoPorFase.map(x => x.count))) * 100)}%`, background: f.color + "80" }} />
                            <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-foreground">{f.count} lead{f.count !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </>
          )}

          {/* ── IA & ATENDIMENTO ── */}
          {tab === "ia" && (
            <>
              {!aiData && <p className="text-sm text-muted-foreground">Carregando métricas…</p>}
              {aiData && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Conversas no período", value: aiData.totals.conversations, hint: "" },
                      { label: "% respondidas pela IA", value: aiData.totals.ai_pct + "%", hint: `${aiData.totals.ai_handled} conversas` },
                      { label: "Precisam de humano", value: aiData.totals.needs_human, hint: "marcadas como handoff" },
                      { label: "Retornos pendentes", value: aiData.totals.follow_ups, hint: "fora do horário" },
                    ].map((k) => (
                      <div key={k.label} className="rounded-xl border border-border bg-card p-4">
                        <p className="text-[11px] text-muted-foreground">{k.label}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                        {k.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{k.hint}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="font-semibold text-foreground mb-1">Tempo de 1ª resposta</p>
                      <p className="text-xs text-muted-foreground mb-3">Da chegada da mensagem até a primeira resposta enviada</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Média</span><strong>{fmtMs(aiData.response.avg_ms)}</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Mediana</span><strong>{fmtMs(aiData.response.median_ms)}</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Amostra</span><strong>{aiData.response.sample} conversas</strong></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="font-semibold text-foreground mb-1">Saúde do agente IA</p>
                      <p className="text-xs text-muted-foreground mb-3">Logs de chamadas ao modelo no período</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Respostas geradas</span><strong>{aiData.ai.replies}</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Erros</span><strong className={aiData.ai.errors ? "text-red-600" : ""}>{aiData.ai.errors}</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Latência média</span><strong>{aiData.ai.avg_latency_ms} ms</strong></div>
                        {(aiData.ai.variant_a + aiData.ai.variant_b) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">A/B (A · B)</span><strong>{aiData.ai.variant_a} · {aiData.ai.variant_b}</strong></div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5">
                    <p className="font-semibold text-foreground mb-3">Sentimento das conversas</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aiData.sentiment as Record<string, number>).map(([s, n]) => (
                        <div key={s} className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border",
                          s === "negativo" || s === "urgente" ? "border-red-300 bg-red-50 text-red-700"
                            : s === "positivo" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border bg-muted/40 text-muted-foreground"
                        )}>
                          {s}: {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
