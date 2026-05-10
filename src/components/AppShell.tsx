import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, LogOut,
  FileSignature, Smartphone, Bot, BookOpen, Wand2, Settings,
  Zap, ChevronLeft, ChevronRight, BarChart2, ChevronDown,
  Scale, Stethoscope,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function useBadges() {
  const [unread, setUnread]     = useState(0);
  const [waStatus, setWaStatus] = useState<"connected"|"disconnected">("disconnected");
  const [activeLeads, setActive]= useState(0);

  const load = async () => {
    const [convRes, waRes, stateRes] = await Promise.all([
      supabase.from("conversations").select("unread_count").gt("unread_count", 0),
      supabase.from("whatsapp_instances").select("status").eq("status", "connected").limit(1),
      supabase.from("funnel_states").select("id").neq("fase", "encerrado"),
    ]);
    setUnread((convRes.data ?? []).reduce((a, c) => a + (c.unread_count || 0), 0));
    setWaStatus((waRes.data ?? []).length > 0 ? "connected" : "disconnected");
    setActive((stateRes.data ?? []).length);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ch = supabase.channel("shell-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { unread, waStatus, activeLeads };
}

type NavItem = {
  to: string;
  label: string;
  icon: any;
  badge?: number;
  badgeColor?: string;
};

type NavGroup = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  items: NavItem[];
};

function NavBadge({ count, color = "bg-red-500" }: { count: number; color?: string }) {
  if (!count) return null;
  return (
    <span className={`ml-auto shrink-0 min-w-[18px] h-4.5 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${color}`}>
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    atendimento: true,
    automacao: false,
    juridico: false,
    config: false,
  });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Abrir grupo automaticamente quando rota ativa pertence a ele
  useEffect(() => {
    const path = location.pathname;
    if (["/inbox", "/kanban", "/clientes", "/dashboard"].some(p => path.startsWith(p))) {
      setOpenGroups(prev => ({ ...prev, atendimento: true }));
    } else if (["/construtor", "/funis", "/wizard", "/manual"].some(p => path.startsWith(p))) {
      setOpenGroups(prev => ({ ...prev, automacao: true }));
    } else if (["/contratos", "/relatorios"].some(p => path.startsWith(p))) {
      setOpenGroups(prev => ({ ...prev, juridico: true }));
    } else if (["/whatsapp", "/configuracoes", "/diagnostico"].some(p => path.startsWith(p))) {
      setOpenGroups(prev => ({ ...prev, config: true }));
    }
  }, [location.pathname]);

  const groups: NavGroup[] = [
    {
      id: "atendimento",
      label: "Atendimento",
      emoji: "💬",
      color: "#0d9488",
      items: [
        { to: "/dashboard", label: "Dashboard",       icon: LayoutDashboard },
        { to: "/inbox",     label: "Inbox WhatsApp",  icon: MessageSquare,  badge: badges.unread },
        { to: "/kanban",    label: "Kanban",          icon: Kanban },
        { to: "/clientes",  label: "Clientes",        icon: Users },
      ],
    },
    {
      id: "automacao",
      label: "Automação IA",
      emoji: "🤖",
      color: "#7c3aed",
      items: [
        { to: "/construtor", label: "Construtor de Funil", icon: Zap },
        { to: "/funis",      label: "Meus Funis",         icon: Bot },
        { to: "/wizard",     label: "Wizard (avançado)",  icon: Wand2 },
        { to: "/manual",     label: "Manual de Prompts",  icon: BookOpen },
      ],
    },
    {
      id: "juridico",
      label: "Jurídico",
      emoji: "⚖️",
      color: "#d97706",
      items: [
        { to: "/contratos",  label: "Contratos",   icon: FileSignature },
        { to: "/processos",  label: "Processos",   icon: Scale },
        { to: "/relatorios", label: "Relatórios",  icon: BarChart2 },
      ],
    },
    {
      id: "config",
      label: "Configurações",
      emoji: "⚙️",
      color: "#64748b",
      items: [
        { to: "/whatsapp",      label: "WhatsApp",       icon: Smartphone },
        { to: "/configuracoes", label: "Configurações",  icon: Settings },
        { to: "/diagnostico",   label: "Diagnóstico",    icon: Stethoscope },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className={cn(
        "shrink-0 flex flex-col border-r border-border bg-sidebar transition-all duration-300 shadow-sm",
        collapsed ? "w-[52px]" : "w-56"
      )}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Scale className="h-4 w-4 text-primary-foreground" />
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

        {/* Nav por grupos */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          {groups.map(group => {
            const isOpen   = openGroups[group.id];
            const hasActive = group.items.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + "/"));
            const groupBadge = group.items.reduce((a, i) => a + (i.badge || 0), 0);

            return (
              <div key={group.id}>
                {/* Header do grupo */}
                <button
                  onClick={() => !collapsed && toggleGroup(group.id)}
                  title={collapsed ? group.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left transition-all",
                    collapsed ? "justify-center" : "justify-between",
                    hasActive ? "text-sidebar-foreground" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                  )}>
                  {collapsed ? (
                    <span className="text-base">{group.emoji}</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{group.emoji}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{group.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {groupBadge > 0 && !isOpen && (
                          <span className="min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white bg-red-500 flex items-center justify-center">
                            {groupBadge}
                          </span>
                        )}
                        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                      </div>
                    </>
                  )}
                </button>

                {/* Itens do grupo */}
                {(isOpen || collapsed) && (
                  <div className={cn("space-y-0.5", collapsed ? "px-1.5" : "px-2 pb-2")}>
                    {group.items.map(item => {
                      const active = location.pathname === item.to;
                      return (
                        <Link key={item.to} to={item.to}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all",
                            collapsed ? "p-2 justify-center" : "px-2.5 py-1.5",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                          )}>
                          <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{item.label}</span>
                              {item.badge ? <NavBadge count={item.badge} color={item.badgeColor} /> : null}
                            </>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Separador entre grupos */}
                {!collapsed && <div className="mx-3 h-px bg-sidebar-border/50 mt-0.5" />}
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-sidebar-border">
          <button onClick={logout}
            className={cn(
              "flex items-center gap-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-all w-full",
              collapsed ? "p-2 justify-center" : "px-2.5 py-1.5"
            )}
            title={collapsed ? "Sair" : undefined}>
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          {!collapsed && user && (
            <p className="text-[10px] text-sidebar-foreground/30 px-2.5 pt-1 truncate">{user.email}</p>
          )}
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        {children}
      </main>
    </div>
  );
}
