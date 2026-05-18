import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { useAuthServerFn } from "@/hooks/use-server-fn";
import { listAIDebugLogs } from "@/server/ai-debug.functions";
import { Bot, AlertTriangle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ia-debug")({
  head: () => ({ meta: [{ title: "Debug IA — Lex CRM" }] }),
  component: () => (
    <AuthGate><AppShell><DebugPage /></AppShell></AuthGate>
  ),
});

function DebugPage() {
  const fetchLogs = useAuthServerFn(listAIDebugLogs);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "errors" | "blocked">("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchLogs({ data: { limit: 150 } });
      setLogs(res.logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(l => {
    if (filter === "errors") return !!l.error;
    if (filter === "blocked") return l.kind === "blocked";
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5" /> Debug IA</h1>
          <p className="text-xs text-muted-foreground">Histórico de chamadas ao modelo: prompt, resposta, latência e erros.</p>
        </div>
        <div className="flex gap-1">
          {(["all", "errors", "blocked"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium",
                filter === f ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/50")}>
              {f === "all" ? "Todos" : f === "errors" ? "Com erro" : "Bloqueados"}
            </button>
          ))}
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted/50">
            Recarregar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!loading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum log no filtro atual.</p>}
        {filtered.map(log => {
          const isOpen = !!expanded[log.id];
          return (
            <div key={log.id} className={cn(
              "rounded-lg border bg-card",
              log.error ? "border-red-300" : log.kind === "blocked" ? "border-amber-300" : "border-border"
            )}>
              <button onClick={() => setExpanded(p => ({ ...p, [log.id]: !p[log.id] }))}
                className="w-full px-4 py-3 flex items-center gap-3 text-left">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{log.kind}</span>
                    {log.variant && <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">var {log.variant}</span>}
                    {log.model && <span className="text-muted-foreground">{log.model}</span>}
                    {log.latency_ms != null && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {log.latency_ms}ms
                      </span>
                    )}
                    {log.error && <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-3 w-3" />erro</span>}
                    <span className="ml-auto text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-sm mt-1 truncate text-foreground/80">
                    {log.error ? log.error : (log.response ?? "(sem resposta)")}
                  </p>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border p-4 space-y-3 bg-muted/30">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Prompt</p>
                    <pre className="text-[11px] bg-background border border-border rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap">
{typeof log.prompt === "string" ? log.prompt : JSON.stringify(log.prompt, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Resposta</p>
                    <pre className="text-[11px] bg-background border border-border rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap">
{log.response ?? "(vazia)"}
                    </pre>
                  </div>
                  {log.conversation_id && (
                    <p className="text-[10px] text-muted-foreground">conv: <span className="font-mono">{log.conversation_id}</span></p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
