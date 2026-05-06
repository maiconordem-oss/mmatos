import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, LogOut,
  FileSignature, Smartphone, Bot, BookOpen, Wand2, Settings,
  Zap, ChevronLeft, ChevronRight, Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function useBadges() {
  const [unread, setUnread]       = useState(0);
  const [stuck, setStuck]         = useState(0);
  const [waStatus, setWaStatus]   = useState<"connected"|"disconnected">("disconnected");
  const [activeLeads, setActive]  = useState(0);

  const load = async () => {
    const [convRes, caseRes, waRes, stateRes] = await Promise.all([
      supabase.from("conversations").select("unread_count").gt("unread_count", 0),
      supabase.from("cases").select("id, updated_at, stage"),
      supabase.from("whatsapp_instances").select("status").eq("status", "connected").limit(1),
      supabase.from("funnel_states").select("id").neq("fase", "encerrado"),
    ]);
    setUnread((convRes.data ?? []).reduce((a, c) => a + (c.unread_count || 0), 0));
    const sixH = new Date(Date.now() - 6 * 3600000).toISOString();
    setStuck((caseRes.data ?? []).filter(c => ["qualificacao","proposta"].includes(c.stage) && c.updated_at < sixH).length);
    setWaStatus((waRes.data ?? []).length > 0 ? "connected" : "disconnected");
    setActive((stateRes.data ?? []).length);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const ch = supabase.channel("shell-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { unread, stuck, waStatus, activeLeads };
}

function NavBadge({ count, color = "bg-red-500" }: { count: number; color?: string }) {
  if (!count) return null;
  return (
    <span className={`ml-auto shrink-0 h-4.5 min-w-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${color}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const badges    = useBadges();
  const [collapsed, setCollapsed] = useState(false);

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); };

  const navMain = [
    { to: "/dashboard", label: "Dashboard",          icon: LayoutDashboard, badge: 0 },
    { to: "/funis",     label: "Funis",              icon: Bot,             badge: 0 },
    { to: "/inbox",     label: "Inbox WhatsApp",     icon: MessageSquare,   badge: badges.unread },
    { to: "/kanban",    label: "Kanban",             icon: Kanban,          badge: badges.stuck,  badgeColor: "bg-amber-500" },
    { to: "/clientes",  label: "Clientes",           icon: Users,           badge: 0 },
    { to: "/contratos", label: "Contratos",          icon: FileSignature,   badge: 0 },
    { to: "/manual",    label: "Manual de Prompts",  icon: BookOpen,        badge: 0 },
    { to: "/wizard",    label: "Criar Funil com IA", icon: Wand2,           badge: 0 },
  ] as const;

  const navBottom = [
    { to: "/whatsapp",      label: "WhatsApp & Config", icon: Smartphone },
    { to: "/configuracoes", label: "Configurações",      icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Sidebar */}
      <aside className={cn(
        "shrink-0 flex flex-col border-r border-border bg-sidebar transition-all duration-300 shadow-sm",
        collapsed ? "w-[60px]" : "w-56"
      )}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-sidebar-foreground leading-tight">Lex CRM</p>
              <p className="text-[10px] text-sidebar-foreground/50">Advocacia Digital</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors">
            {collapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft  className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Status WhatsApp */}
        {!collapsed && (
          <div className="mx-3 mt-3 px-3 py-1.5 rounded-lg bg-sidebar-accent/60 flex items-center gap-2">
            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0",
              badges.waStatus === "connected" ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            <span className="text-[11px] text-sidebar-foreground/60 truncate">
              {badges.waStatus === "connected"
                ? `${badges.activeLeads} leads ativos`
                : "WhatsApp desconectado"}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-2">
          {navMain.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                title={collapsed ? item.label : undefined}>
                <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "")} />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    <NavBadge count={item.badge ?? 0} color={(item as any).badgeColor} />
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Ações rápidas */}
        {!collapsed && (
          <div className="mx-3 mb-2 rounded-lg border border-sidebar-border p-2">
            <p className="text-[9px] uppercase tracking-widest text-sidebar-foreground/30 mb-1.5 px-1">Ação rápida</p>
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: "Conversa", icon: MessageSquare, to: "/inbox" },
                { label: "Lead",     icon: Kanban,        to: "/kanban" },
                { label: "Funil",    icon: Zap,           to: "/wizard" },
              ].map(a => (
                <Link key={a.to} to={a.to}
                  className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-sidebar-accent/50 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-all">
                  <a.icon className="h-3.5 w-3.5" />
                  <span className="text-[9px]">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Nav inferior */}
        <div className="p-2 border-t border-sidebar-border space-y-0.5">
          {navBottom.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                title={collapsed ? item.label : undefined}>
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
          <button onClick={logout}
            className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
            title={collapsed ? "Sair" : undefined}>
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          {!collapsed && user && (
            <p className="text-[10px] text-sidebar-foreground/30 px-2.5 pt-1 truncate">{user.email}</p>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        {children}
      </main>
    </div>
  );
}
