import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileSignature,
  TrendingUp,
  Clock,
  Flame,
  Activity,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

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

type Kpi = {
  leadsToday: number;
  contractsMonth: number;
  conversionRate: number;
  avgResponseMin: number;
};

type FunnelStep = { name: string; value: number; fill: string };

type HotLead = {
  id: string;
  contact_name: string | null;
  phone: string;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type ActivityItem = {
  id: string;
  type: "message" | "conversation" | "contract" | "case";
  title: string;
  subtitle?: string;
  at: string;
};

function DashboardPage() {
  const [kpi, setKpi] = useState<Kpi>({
    leadsToday: 0,
    contractsMonth: 0,
    conversionRate: 0,
    avgResponseMin: 0,
  });
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const loadAll = async () => {
    const now = new Date();
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [
      leadsTodayRes,
      contractsRes,
      convsAllRes,
      convsWonRes,
      hotRes,
      msgsRes,
      contractsRecentRes,
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDay.toISOString()),
      supabase
        .from("contracts")
        .select("id, status, created_at, signed_at")
        .gte("created_at", startMonth.toISOString()),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "assinado"),
      supabase
        .from("conversations")
        .select("id, contact_name, phone, last_message_at, last_message_preview, status")
        .eq("status", "open")
        .lt("last_message_at", twoHoursAgo.toISOString())
        .order("last_message_at", { ascending: true })
        .limit(8),
      supabase
        .from("messages")
        .select("id, content, direction, created_at, conversation_id")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("contracts")
        .select("id, status, created_at, signed_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const contracts = contractsRes.data ?? [];
    const signedThisMonth = contracts.filter((c) => c.status === "assinado").length;
    const totalConvs = convsAllRes.count ?? 0;
    const totalSigned = convsWonRes.count ?? 0;
    const conversion = totalConvs > 0 ? (totalSigned / totalConvs) * 100 : 0;

    // Tempo médio de resposta: diferença entre primeira inbound e primeira outbound seguinte por conversa (amostra)
    const { data: msgSample } = await supabase
      .from("messages")
      .select("conversation_id, direction, created_at")
      .order("created_at", { ascending: true })
      .limit(500);
    const byConv: Record<string, { in?: string; out?: string }> = {};
    (msgSample ?? []).forEach((m: any) => {
      const c = byConv[m.conversation_id] ?? {};
      if (m.direction === "inbound" && !c.in) c.in = m.created_at;
      if (m.direction === "outbound" && c.in && !c.out) c.out = m.created_at;
      byConv[m.conversation_id] = c;
    });
    const diffs = Object.values(byConv)
      .filter((c) => c.in && c.out)
      .map((c) => (new Date(c.out!).getTime() - new Date(c.in!).getTime()) / 60000);
    const avg = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

    setKpi({
      leadsToday: leadsTodayRes.count ?? 0,
      contractsMonth: signedThisMonth,
      conversionRate: Math.round(conversion * 10) / 10,
      avgResponseMin: Math.round(avg),
    });

    // Funnel: conversas → qualificados → propostas → contratos assinados
    const [{ count: qualifiedCount }, { count: proposalsCount }] = await Promise.all([
      supabase
        .from("lead_qualifications")
        .select("id", { count: "exact", head: true })
        .eq("qualified", true),
      supabase.from("proposals").select("id", { count: "exact", head: true }),
    ]);

    setFunnel([
      { name: "Leads", value: totalConvs || 1, fill: "hsl(217 91% 60%)" },
      { name: "Qualificados", value: qualifiedCount ?? 0, fill: "hsl(199 89% 48%)" },
      { name: "Propostas", value: proposalsCount ?? 0, fill: "hsl(43 96% 56%)" },
      { name: "Contratos", value: totalSigned, fill: "hsl(142 71% 45%)" },
    ]);

    setHotLeads((hotRes.data ?? []) as HotLead[]);

    const acts: ActivityItem[] = [];
    (msgsRes.data ?? []).slice(0, 8).forEach((m: any) => {
      acts.push({
        id: `m-${m.id}`,
        type: "message",
        title: m.direction === "inbound" ? "Nova mensagem recebida" : "Mensagem enviada",
        subtitle: (m.content ?? "").slice(0, 80),
        at: m.created_at,
      });
    });
    (contractsRecentRes.data ?? []).forEach((c: any) => {
      acts.push({
        id: `c-${c.id}`,
        type: "contract",
        title: c.status === "assinado" ? "Contrato assinado" : "Contrato atualizado",
        subtitle: `Status: ${c.status}`,
        at: c.signed_at ?? c.created_at,
      });
    });
    acts.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setActivity(acts.slice(0, 12));
  };

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => loadAll())
      .subscribe();
    const t = setInterval(loadAll, 60000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, []);

  const cards = useMemo(
    () => [
      {
        label: "Leads hoje",
        value: kpi.leadsToday,
        icon: Users,
        accent: "from-blue-500/20 to-blue-500/5",
        ring: "ring-blue-500/30",
        iconColor: "text-blue-400",
      },
      {
        label: "Contratos no mês",
        value: kpi.contractsMonth,
        icon: FileSignature,
        accent: "from-emerald-500/20 to-emerald-500/5",
        ring: "ring-emerald-500/30",
        iconColor: "text-emerald-400",
      },
      {
        label: "Taxa de conversão",
        value: `${kpi.conversionRate}%`,
        icon: TrendingUp,
        accent: "from-amber-500/20 to-amber-500/5",
        ring: "ring-amber-500/30",
        iconColor: "text-amber-400",
      },
      {
        label: "Tempo médio resp.",
        value: kpi.avgResponseMin > 0 ? `${kpi.avgResponseMin} min` : "—",
        icon: Clock,
        accent: "from-violet-500/20 to-violet-500/5",
        ring: "ring-violet-500/30",
        iconColor: "text-violet-400",
      },
    ],
    [kpi],
  );

  return (
    <div className="min-h-full bg-[#0f172a] text-slate-100">
      <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1 text-sm flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Em tempo real
            </p>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card
              key={c.label}
              className={`bg-gradient-to-br ${c.accent} border-slate-800 ring-1 ${c.ring} backdrop-blur`}
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400">{c.label}</p>
                  <p className="text-3xl font-bold mt-2 text-white">{c.value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-slate-900/60 ${c.iconColor}`}>
                  <c.icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funil */}
          <Card className="bg-slate-900/60 border-slate-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                Funil de conversão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <FunnelChart>
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: 8,
                        color: "#f1f5f9",
                      }}
                    />
                    <Funnel dataKey="value" data={funnel} isAnimationActive>
                      <LabelList
                        position="right"
                        fill="#f1f5f9"
                        stroke="none"
                        dataKey="name"
                        className="text-sm"
                      />
                      <LabelList
                        position="center"
                        fill="#fff"
                        stroke="none"
                        dataKey="value"
                        className="font-bold"
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Leads quentes */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                Leads quentes
                <Badge variant="secondary" className="ml-auto bg-orange-500/20 text-orange-300 border-orange-500/30">
                  {hotLeads.length}
                </Badge>
              </CardTitle>
              <p className="text-xs text-slate-400">Parados há mais de 2h</p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              {hotLeads.length === 0 && (
                <p className="text-sm text-slate-500 py-6 text-center">Nenhum lead pendente 🎉</p>
              )}
              {hotLeads.map((l) => (
                <div
                  key={l.id}
                  className="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {l.contact_name || l.phone}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {l.last_message_preview || "—"}
                      </p>
                      <p className="text-xs text-orange-300/80 mt-1">
                        {timeAgo(l.last_message_at)}
                      </p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 shrink-0"
                    >
                      <Link to="/inbox">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Atividade */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Atividade recente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.length === 0 && (
              <p className="text-sm text-slate-500 py-6 text-center">Sem atividade recente.</p>
            )}
            {activity.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/40 transition-colors"
              >
                <div className="p-2 rounded-md bg-slate-800/60 text-slate-300">
                  {a.type === "message" ? (
                    <MessageSquare className="h-4 w-4" />
                  ) : a.type === "contract" ? (
                    <FileSignature className="h-4 w-4" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{a.title}</p>
                  {a.subtitle && (
                    <p className="text-xs text-slate-400 truncate">{a.subtitle}</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 shrink-0">{timeAgo(a.at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}
