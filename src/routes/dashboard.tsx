import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, MessageSquare, TrendingUp } from "lucide-react";
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

type Stats = {
  clients: number;
  cases: number;
  activeCases: number;
  conversations: number;
  byStage: Record<string, number>;
  byArea: Record<string, number>;
};

function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      const [clientsRes, casesRes, convsRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("cases").select("stage, area"),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
      ]);
      const cases = casesRes.data ?? [];
      const byStage: Record<string, number> = {};
      const byArea: Record<string, number> = {};
      cases.forEach((c) => {
        byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
        byArea[c.area] = (byArea[c.area] ?? 0) + 1;
      });
      setStats({
        clients: clientsRes.count ?? 0,
        cases: cases.length,
        activeCases: cases.filter((c) => !["concluido", "arquivado"].includes(c.stage)).length,
        conversations: convsRes.count ?? 0,
        byStage,
        byArea,
      });
    };
    load();
  }, []);

  const cards = [
    { label: "Clientes", value: stats?.clients ?? 0, icon: Users, color: "text-primary" },
    { label: "Casos totais", value: stats?.cases ?? 0, icon: Briefcase, color: "text-gold" },
    { label: "Casos ativos", value: stats?.activeCases ?? 0, icon: TrendingUp, color: "text-success" },
    { label: "Conversas", value: stats?.conversations ?? 0, icon: MessageSquare, color: "text-primary-glow" },
  ];

  const stageLabels: Record<string, string> = {
    lead: "Leads",
    qualificacao: "Qualificação",
    proposta: "Proposta",
    em_andamento: "Em andamento",
    aguardando: "Aguardando",
    concluido: "Concluído",
    arquivado: "Arquivado",
  };

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do escritório</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-3xl font-bold mt-1">{c.value}</p>
              </div>
              <c.icon className={`h-8 w-8 ${c.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Casos por estágio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(stageLabels).map(([key, label]) => {
              const count = stats?.byStage[key] ?? 0;
              const max = Math.max(...Object.values(stats?.byStage ?? { x: 1 }), 1);
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{label}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Casos por área</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(stats?.byArea ?? {}).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum caso cadastrado.</p>
            )}
            {Object.entries(stats?.byArea ?? {}).map(([area, count]) => (
              <div key={area} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <span className="capitalize text-sm">{area.replace("_", " ")}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
