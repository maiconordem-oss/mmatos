import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  TrendingUp, Clock, FileSignature, Users, Calendar,
  ChevronRight, CheckCircle, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <RelatoriosPage />
      </AppShell>
    </AuthGate>
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

function RelatoriosPage() {
  const [period, setPeriod]       = useState(30);
  const [tab, setTab]             = useState<"leads"|"agenda"|"funil">("leads");
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [kpis, setKpis]           = useState({ total: 0, contratos: 0, conversao: 0, tempoMedio: 0 });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [funnelStates, setFunnelStates] = useState<any[]>([]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - period * 86400000).toISOString();

    const [statesRes, apptRes, casesRes] = await Promise.all([
      supabase.from("funnel_states").select("*, conversations(contact_name, phone)").gte("created_at", since),
      supabase.from("appointments").select("*, conversations(contact_name, phone)").order("start_at", { ascending: true }),
      supabase.from("cases").select("*").gte("created_at", since),
    ]);

    const states = statesRes.data ?? [];
    const cases  = casesRes.data ?? [];

    // KPIs
    const contratos   = states.filter(s => ["assinatura","encerrado"].includes(s.fase)).length;
    const total       = states.length || 1;
    const conversao   = Math.round((contratos / total) * 100);
    const withTime    = states.filter(s => s.fase === "encerrado");
    const tempoMedio  = withTime.length
      ? Math.round(withTime.reduce((a, s) => {
          return a + (new Date(s.updated_at).getTime() - new Date(s.created_at).getTime()) / 3600000;
        }, 0) / withTime.length)
      : 0;
    setKpis({ total, contratos, conversao, tempoMedio });

    // Leads por dia
    const days: Record<string, number> = {};
    for (let i = 0; i < Math.min(period, 30); i++) {
      const d = new Date(Date.now() - (Math.min(period,30) - 1 - i) * 86400000);
      days[d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })] = 0;
    }
    states.forEach(s => {
      const d = new Date(s.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (days[d] !== undefined) days[d]++;
    });
    setLeadsData(Object.entries(days).map(([day, leads]) => ({ day, leads })));

    // Funil por fase
    const faseCounts: Record<string, number> = {};
    states.forEach(s => { faseCounts[s.fase] = (faseCounts[s.fase] || 0) + 1; });
    const fases = ["abertura","triagem","conexao","fechamento","coleta","assinatura","encerrado"];
    setFunnelData(fases.map(f => ({ fase: f, count: faseCounts[f] || 0, color: FASE_COLORS[f] })));

    // Agendamentos
    setAppointments(apptRes.data ?? []);

    // Estados para linha do tempo
    setFunnelStates(states.slice(0, 20));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const TABS = [
    { id: "leads",  label: "Leads & Conversão", icon: TrendingUp },
    { id: "agenda", label: "Agenda",             icon: Calendar },
    { id: "funil",  label: "Linha do tempo",     icon: Users },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Análise de desempenho</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                period === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-border shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/50")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── LEADS & CONVERSÃO ── */}
        {tab === "leads" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Leads no período", value: kpis.total,              icon: Users,         color: "text-blue-500" },
                { label: "Contratos",         value: kpis.contratos,          icon: FileSignature, color: "text-green-500" },
                { label: "Taxa de conversão", value: `${kpis.conversao}%`,    icon: TrendingUp,    color: "text-violet-500" },
                { label: "Tempo médio (h)",   value: `${kpis.tempoMedio}h`,   icon: Clock,         color: "text-amber-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {/* Gráfico de leads por dia */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="font-semibold text-foreground mb-4">Leads por dia</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={leadsData}>
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={20} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} fill="url(#lg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Funil */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-4">Funil de conversão</p>
                <div className="space-y-2">
                  {funnelData.map(({ fase, count, color }) => {
                    const max = funnelData[0]?.count || 1;
                    const pct = Math.round((count / max) * 100);
                    return (
                      <div key={fase} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 text-right capitalize shrink-0">{fase}</span>
                        <div className="flex-1 h-6 rounded-md bg-muted relative overflow-hidden">
                          <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: color + "80" }} />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-foreground">{count}</span>
                        </div>
                        <span className="text-xs text-muted-foreground w-10 shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-4">Distribuição por fase</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={funnelData.filter(f => f.count > 0)} dataKey="count" nameKey="fase"
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {funnelData.filter(f => f.count > 0).map((f) => (
                        <Cell key={f.fase} fill={f.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {funnelData.filter(f => f.count > 0).map(f => (
                    <div key={f.fase} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                      {f.fase}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">Próximos agendamentos</p>
              <span className="text-xs text-muted-foreground">{appointments.length} total</span>
            </div>
            {appointments.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum agendamento. Configure o Google Calendar nos funis.</p>
              </div>
            )}
            {appointments.map((appt: any) => {
              const start = new Date(appt.start_at);
              const isPast = start < new Date();
              const isSoon = !isPast && (start.getTime() - Date.now()) < 3600000;
              return (
                <div key={appt.id} className={cn("rounded-xl border bg-card p-4 flex items-start gap-4",
                  isPast ? "border-border opacity-60" : isSoon ? "border-amber-500/40 bg-amber-500/5" : "border-border")}>
                  <div className="shrink-0 text-center min-w-[50px]">
                    <p className="text-2xl font-bold text-foreground">{start.getDate()}</p>
                    <p className="text-xs text-muted-foreground">{start.toLocaleDateString("pt-BR", { month: "short" })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{appt.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} —
                      {new Date(appt.end_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                    </p>
                    {(appt.conversations as any)?.contact_name && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {(appt.conversations as any).contact_name}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isPast ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Encerrado</span>
                    ) : isSoon ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-600 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Em breve
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600">Confirmado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LINHA DO TEMPO ── */}
        {tab === "funil" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <p className="font-semibold text-foreground">Progresso dos leads nas fases</p>
            {funnelStates.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum lead no período selecionado.</p>
              </div>
            )}
            {funnelStates.map((state: any) => {
              const fases = ["abertura","triagem","conexao","fechamento","coleta","assinatura","encerrado"];
              const idx = fases.indexOf(state.fase);
              const nome = (state.conversations as any)?.contact_name || (state.conversations as any)?.phone || "Lead";
              const dados = state.dados as any;
              return (
                <div key={state.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: FASE_COLORS[state.fase] || "#64748b" }}>
                        {nome[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{nome}</p>
                        {dados?.municipio && <p className="text-xs text-muted-foreground">{dados.municipio}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(state.updated_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {/* Barra de progresso de fases */}
                  <div className="flex items-center gap-1">
                    {fases.map((fase, i) => (
                      <div key={fase} className="flex items-center gap-1 flex-1">
                        <div className={cn("h-2 flex-1 rounded-full transition-all",
                          i <= idx ? "opacity-100" : "opacity-20")}
                          style={{ background: FASE_COLORS[fase] }} />
                        {i < fases.length - 1 && (
                          <ChevronRight className={cn("h-3 w-3 shrink-0", i < idx ? "text-muted-foreground" : "text-border")} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">abertura</span>
                    <span className="text-[10px] font-medium" style={{ color: FASE_COLORS[state.fase] }}>{state.fase}</span>
                    <span className="text-[10px] text-muted-foreground">encerrado</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
