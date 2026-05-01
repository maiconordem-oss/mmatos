import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, Users, FileSignature, Clock, Zap,
  ArrowRight, ArrowUpRight, ArrowDownRight, Bot,
  MessageSquare, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <DashboardPage />
      </AppShell>
    </AuthGate>
  ),
});

const FASE_COLORS: Record<string, string> = {
  abertura:   "#64748b",
  triagem:    "#3b82f6",
  conexao:    "#f97316",
  fechamento: "#ec4899",
  coleta:     "#8b5cf6",
  assinatura: "#22c55e",
  encerrado:  "#10b981",
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Leads", qualificacao: "Qualificação", proposta: "Proposta",
  em_andamento: "Em andamento", concluido: "Concluído",
};

function KpiCard({ label, value, sub, trend, icon: Icon, color }: any) {
  const up = trend >= 0;
  return (
    <div className="rounded-xl border border-white/8 p-5 flex flex-col gap-3" style={{ background: "#0d1424" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-500">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", up ? "text-emerald-400" : "text-red-400")}>
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(trend)}% vs ontem
        </div>
      )}
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [kpis, setKpis]       = useState({ leadsHoje: 0, contratos: 0, conversao: 0, tempoMedio: 0 });
  const [trends, setTrends]   = useState({ leads: 0, contratos: 0 });
  const [funil, setFunil]     = useState<{ fase: string; count: number }[]>([]);
  const [kanban, setKanban]   = useState<Record<string, number>>({});
  const [quentes, setQuentes] = useState<any[]>([]);
  const [atividade, setAtividade] = useState<any[]>([]);
  const [areaData, setAreaData]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const now     = new Date();
    const hoje    = new Date(now.setHours(0,0,0,0)).toISOString();
    const ontem   = new Date(now.getTime() - 86400000).toISOString();
    const semana  = new Date(Date.now() - 7 * 86400000).toISOString();
    const doisH   = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const [statesRes, casesRes, convRes, apptRes] = await Promise.all([
      supabase.from("funnel_states").select("fase, created_at, updated_at, conversation_id, dados"),
      supabase.from("cases").select("*"),
      supabase.from("conversations").select("id, phone, contact_name, last_message_at, last_message_preview, ai_handled"),
      supabase.from("appointments").select("id, created_at"),
    ]);

    const states  = statesRes.data ?? [];
    const cases   = casesRes.data ?? [];
    const convs   = convRes.data ?? [];

    // KPIs
    const leadsHoje    = states.filter(s => s.created_at >= hoje).length;
    const leadsOntem   = states.filter(s => s.created_at >= ontem && s.created_at < hoje).length;
    const contratos    = cases.filter(c => c.stage === "em_andamento" && c.created_at >= new Date(Date.now() - 30 * 86400000).toISOString()).length;
    const contratosOntem = cases.filter(c => c.stage === "em_andamento" && c.created_at >= ontem && c.created_at < hoje).length;
    const total        = states.length || 1;
    const assinados    = states.filter(s => s.fase === "assinatura" || s.fase === "encerrado").length;
    const conversao    = Math.round((assinados / total) * 100);

    const comDatas = states.filter(s => s.fase === "encerrado");
    const tempoMedio = comDatas.length
      ? Math.round(comDatas.reduce((a, s) => {
          const diff = new Date(s.updated_at).getTime() - new Date(s.created_at).getTime();
          return a + diff / (1000 * 60 * 60);
        }, 0) / comDatas.length)
      : 0;

    setKpis({ leadsHoje, contratos, conversao, tempoMedio });
    setTrends({
      leads: leadsOntem ? Math.round(((leadsHoje - leadsOntem) / leadsOntem) * 100) : 0,
      contratos: contratosOntem ? Math.round(((contratos - contratosOntem) / contratosOntem) * 100) : 0,
    });

    // Funil por fase
    const faseCounts: Record<string, number> = {};
    states.forEach(s => { faseCounts[s.fase] = (faseCounts[s.fase] || 0) + 1; });
    const fases = ["abertura","triagem","conexao","fechamento","coleta","assinatura","encerrado"];
    setFunil(fases.map(f => ({ fase: f, count: faseCounts[f] || 0 })));

    // Kanban
    const stageCount: Record<string, number> = {};
    cases.forEach(c => { stageCount[c.stage] = (stageCount[c.stage] || 0) + 1; });
    setKanban(stageCount);

    // Leads quentes (parados > 2h em fases importantes)
    const hotStates = states.filter(s =>
      ["conexao","fechamento","coleta"].includes(s.fase) && s.updated_at < doisH
    );
    const hotWithConv = hotStates.slice(0, 5).map(s => {
      const conv = convs.find(c => c.id === s.conversation_id);
      const horasParado = Math.round((Date.now() - new Date(s.updated_at).getTime()) / (1000 * 60 * 60));
      return { ...s, conv, horasParado };
    }).filter(s => s.conv);
    setQuentes(hotWithConv);

    // Atividade recente
    const recent = states
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6)
      .map(s => {
        const conv = convs.find(c => c.id === s.conversation_id);
        const dados = s.dados as any;
        const nome = dados?.nome ?? conv?.contact_name ?? conv?.phone ?? "Lead";
        const mins = Math.round((Date.now() - new Date(s.updated_at).getTime()) / 60000);
        return { nome, fase: s.fase, mins };
      });
    setAtividade(recent);

    // Área chart — leads por dia (últimos 7 dias)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const dayStr = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
      const dayStart = new Date(d.setHours(0,0,0,0)).toISOString();
      const dayEnd   = new Date(d.setHours(23,59,59,999)).toISOString();
      const count    = states.filter(s => s.created_at >= dayStart && s.created_at <= dayEnd).length;
      return { day: dayStr, leads: count };
    });
    setAreaData(days);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "funnel_states" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const Skeleton = () => (
    <div className="animate-pulse h-8 rounded bg-white/5 w-16" />
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Tempo real</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Leads hoje" value={loading ? "—" : kpis.leadsHoje} trend={trends.leads}
          icon={Users} color="bg-blue-500/80" sub="novos atendimentos" />
        <KpiCard label="Contratos (30d)" value={loading ? "—" : kpis.contratos} trend={trends.contratos}
          icon={FileSignature} color="bg-emerald-500/80" sub="casos em andamento" />
        <KpiCard label="Taxa de conversão" value={loading ? "—" : `${kpis.conversao}%`}
          icon={TrendingUp} color="bg-violet-500/80" sub="lead → assinatura" />
        <KpiCard label="Tempo médio" value={loading ? "—" : `${kpis.tempoMedio}h`}
          icon={Clock} color="bg-amber-500/80" sub="até o contrato" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de área */}
        <div className="lg:col-span-2 rounded-xl border border-white/8 p-5" style={{ background: "#0d1424" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-white">Leads por dia</p>
              <p className="text-xs text-slate-500">Últimos 7 dias</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={20} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#22c55e" }} />
              <Area type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2} fill="url(#lg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Kanban mini */}
        <div className="rounded-xl border border-white/8 p-5" style={{ background: "#0d1424" }}>
          <p className="text-sm font-semibold text-white mb-4">Pipeline</p>
          <div className="space-y-3">
            {Object.entries(STAGE_LABELS).map(([stage, label]) => {
              const count = kanban[stage] || 0;
              const total = Object.values(kanban).reduce((a, b) => a + b, 0) || 1;
              const pct   = Math.round((count / total) * 100);
              return (
                <div key={stage}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">{label}</span>
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil de conversão */}
        <div className="rounded-xl border border-white/8 p-5" style={{ background: "#0d1424" }}>
          <p className="text-sm font-semibold text-white mb-4">Funil de conversão</p>
          <div className="space-y-2">
            {funil.map(({ fase, count }) => {
              const max   = funil[0]?.count || 1;
              const pct   = Math.round((count / max) * 100);
              const color = FASE_COLORS[fase] || "#64748b";
              return (
                <div key={fase} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-20 text-right capitalize shrink-0">{fase}</span>
                  <div className="flex-1 h-6 rounded-md bg-white/5 relative overflow-hidden">
                    <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: color + "60" }} />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white">{count}</span>
                  </div>
                  <span className="text-xs text-slate-500 w-10 shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leads quentes */}
        <div className="rounded-xl border border-white/8 p-5" style={{ background: "#0d1424" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-semibold text-white">Precisam de atenção</p>
            </div>
            <span className="text-xs text-slate-500">parados &gt; 2h</span>
          </div>
          {quentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-600">
              <CheckCircle2 className="h-8 w-8 mb-2" />
              <p className="text-sm">Todos os leads estão em dia!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {quentes.map((q, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 group">
                  <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400 font-bold text-sm">
                    {(q.conv?.contact_name || q.conv?.phone || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{q.conv?.contact_name || q.conv?.phone}</p>
                    <p className="text-xs text-amber-400">
                      {q.fase} • parado há {q.horasParado}h
                    </p>
                  </div>
                  <button onClick={() => navigate({ to: "/inbox" })}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Atividade recente */}
      <div className="rounded-xl border border-white/8 p-5" style={{ background: "#0d1424" }}>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-emerald-400" />
          <p className="text-sm font-semibold text-white">Atividade recente</p>
        </div>
        <div className="space-y-2">
          {atividade.length === 0 && (
            <p className="text-sm text-slate-600 text-center py-4">Nenhuma atividade ainda.</p>
          )}
          {atividade.map((a, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: FASE_COLORS[a.fase] || "#64748b" }} />
              <p className="text-sm text-slate-300 flex-1">
                <span className="font-medium text-white">{a.nome}</span>
                {" "}entrou na fase{" "}
                <span className="font-medium" style={{ color: FASE_COLORS[a.fase] }}>{a.fase}</span>
              </p>
              <span className="text-xs text-slate-600 shrink-0">
                {a.mins < 60 ? `${a.mins}min` : `${Math.round(a.mins/60)}h`} atrás
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
