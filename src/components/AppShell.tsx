import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, LogOut,
  FileSignature, Smartphone, Bot, BookOpen, Wand2, Settings,
  Bell, Search, Zap, Plus, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function useBadges() {
  const [unread, setUnread]         = useState(0);
  const [stuckLeads, setStuckLeads] = useState(0);
  const [alerts, setAlerts]         = useState(0);
  const [waStatus, setWaStatus]     = useState<"connected"|"disconnected">("disconnected");
  const [activeLeads, setActiveLeads] = useState(0);

  const load = async () => {
    const [convRes, caseRes, waRes, stateRes] = await Promise.all([
      supabase.from("conversations").select("unread_count").gt("unread_count", 0),
      supabase.from("cases").select("id, updated_at, stage"),
      supabase.from("whatsapp_instances").select("status").eq("status", "connected").limit(1),
      supabase.from("funnel_states").select("id, fase").neq("fase", "encerrado"),
    ]);

    const totalUnread = (convRes.data ?? []).reduce((a, c) => a + (c.unread_count || 0), 0);
    setUnread(totalUnread);

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const stuck = (caseRes.data ?? []).filter(c =>
      ["qualificacao","proposta"].includes(c.stage) && c.updated_at < sixHoursAgo
    ).length;
    setStuckLeads(stuck);
    setWaStatus((waRes.data ?? []).length > 0 ? "connected" : "disconnected");
    setActiveLeads((stateRes.data ?? []).length);
    setAlerts(waStatus === "disconnected" ? 1 : 0);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const ch = supabase.channel("appshell-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { unread, stuckLeads, alerts, waStatus, activeLeads };
}

function Badge({ count, color = "bg-red-500" }: { count: number; color?: string }) {
  if (!count) return null;
  return (
    <span className={`ml-auto shrink-0 h-5 min-w-5 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${color}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  const location   = useLocation();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const badges     = useBadges();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const navMain = [
    { to: "/dashboard", label: "Dashboard",         icon: LayoutDashboard, badge: 0 },
    { to: "/funis",     label: "Funis",             icon: Bot,             badge: badges.alerts,    badgeColor: "bg-amber-500" },
    { to: "/inbox",     label: "Inbox WhatsApp",    icon: MessageSquare,   badge: badges.unread },
    { to: "/kanban",    label: "Kanban",            icon: Kanban,          badge: badges.stuckLeads, badgeColor: "bg-amber-500" },
    { to: "/clientes",  label: "Clientes",          icon: Users,           badge: 0 },
    { to: "/contratos", label: "Contratos",         icon: FileSignature,   badge: 0 },
    { to: "/manual",    label: "Manual",            icon: BookOpen,        badge: 0 },
    { to: "/wizard",    label: "Criar Funil",       icon: Wand2,           badge: 0 },
  ];

  const navBottom = [
    { to: "/whatsapp",     label: "WhatsApp",      icon: Smartphone },
    { to: "/configuracoes",label: "Configurações", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0a0f1e" }}>
      {/* Sidebar */}
      <aside className={cn("shrink-0 flex flex-col border-r border-white/8 transition-all duration-300", collapsed ? "w-16" : "w-56")}
        style={{ background: "#0d1424" }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/8">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-sm text-white leading-tight">Lex CRM</p>
              <p className="text-[10px] text-slate-500">Advocacia Digital</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-slate-600 hover:text-slate-400 shrink-0">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed ? "-rotate-90" : "rotate-90")} />
          </button>
        </div>

        {/* Status WhatsApp */}
        {!collapsed && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: "#111827" }}>
            <div className={cn("h-2 w-2 rounded-full shrink-0", badges.waStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
            <span className="text-xs text-slate-400 truncate">
              {badges.waStatus === "connected" ? `WhatsApp • ${badges.activeLeads} leads ativos` : "WhatsApp desconectado"}
            </span>
          </div>
        )}

        {/* Nav principal */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-2">
          {navMain.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                  active
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
                )}>
                <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-300")} />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{item.label}</span>
                    <Badge count={item.badge ?? 0} color={item.badgeColor} />
                  </>
                )}
                {collapsed && (item.badge ?? 0) > 0 && (
                  <span className="absolute left-8 top-1 h-2 w-2 rounded-full bg-red-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Ações rápidas */}
        {!collapsed && (
          <div className="mx-3 mb-2 p-2 rounded-lg border border-white/8" style={{ background: "#111827" }}>
            <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2 px-1">Ação rápida</p>
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: "Conversa", icon: MessageSquare, to: "/inbox" },
                { label: "Lead",     icon: Kanban,        to: "/kanban" },
                { label: "Funil",    icon: Zap,           to: "/wizard" },
              ].map(a => (
                <Link key={a.label} to={a.to}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all">
                  <a.icon className="h-3.5 w-3.5" />
                  <span className="text-[9px]">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Nav inferior */}
        <div className="p-2 border-t border-white/8 space-y-0.5">
          {navBottom.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active ? "text-emerald-400 bg-emerald-500/10" : "text-slate-600 hover:text-slate-300 hover:bg-white/5"
                )}>
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all w-full">
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          {!collapsed && user && (
            <p className="text-[10px] text-slate-600 px-3 pt-1 truncate">{user.email}</p>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"} style={{ background: "#0a0f1e" }}>
        {children}
      </main>
    </div>
  );
}
