import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, LogOut,
  FileSignature, FileText, Smartphone, Settings,
  ChevronLeft, ChevronRight, BarChart2, ChevronDown,
  Scale, Stethoscope, Instagram, Wand2, GitBranch,
  Reply, Brain, HelpCircle, FlaskConical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function useBadges() {
  const { user } = useAuth();
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
    if (!user?.id) return;
    const ch = supabase.channel(`user:${user.id}:shell-badges`, { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

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
  color: string;
  items: NavItem[];
};

function NavBadge({ count, color = "bg-red-500" }: { count: number; color?: string }) {
  if (!count) return null;
  return (
    <span className={`ml-auto shrink-0 min-w-[18px] h-4 px-1 rounded-full text-[10px] font-semibold text-white flex items-center justify-center tabular-nums ${color}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const badges    = useBadges();
  const [collapsed, setCollapsed] = useState(() => location.pathname.startsWith("/inbox"));
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

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/inbox")) {
      setCollapsed(true);
    }
    if (["/inbox", "/kanban", "/clientes", "/dashboard"].some(p => path.startsWith(p))) {
      setOpenGroups(prev => ({ ...prev, atendimento: true }));
    } else if (["/construtor", "/funis", "/templates", "/conteudo", "/conhecimento", "/manual", "/instagram"].some(p => path.startsWith(p))) {
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
      color: "#0d9488",
      items: [
        { to: "/dashboard", label: "Início",          icon: LayoutDashboard },
        { to: "/inbox",     label: "Atendimentos",    icon: MessageSquare,  badge: badges.unread },
        { to: "/kanban",    label: "Kanban",          icon: Kanban },
        { to: "/clientes",  label: "Clientes",        icon: Users },
      ],
    },
    {
      id: "automacao",
      label: "Automação",
      color: "#7c3aed",
      items: [
        { to: "/construtor",   label: "Criar atendimento",  icon: Wand2 },
        { to: "/funis",        label: "Meus atendimentos",  icon: GitBranch },
        { to: "/templates",    label: "Respostas prontas",  icon: Reply },
        { to: "/conteudo",     label: "Conteúdo",           icon: FileText },
        { to: "/instagram",    label: "Instagram",           icon: Instagram },
        { to: "/conhecimento", label: "Conhecimento da IA", icon: Brain },
        { to: "/manual",       label: "Ajuda de prompts",   icon: HelpCircle },
      ],
    },
    {
      id: "juridico",
      label: "Jurídico",
      color: "#d97706",
      items: [
        { to: "/contratos",  label: "Contratos",   icon: FileSignature },
        { to: "/processos",  label: "Processos",   icon: Scale },
        { to: "/relatorios", label: "Relatórios",  icon: BarChart2 },
        { to: "/ia-debug",   label: "Teste da IA", icon: FlaskConical },
      ],
    },
    {
      id: "config",
      label: "Ajustes",
      color: "#64748b",
      items: [
        { to: "/whatsapp",      label: "Conectar WhatsApp", icon: Smartphone },
        { to: "/configuracoes", label: "Configurações",     icon: Settings },
        { to: "/diagnostico",   label: "Diagnóstico",       icon: Stethoscope },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className={cn(
        "shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-[52px]" : "w-56"
      )}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-[14px] border-b border-sidebar-border/70">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Scale className="h-[14px] w-[14px] text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-sidebar-foreground tracking-tight leading-tight">Lex CRM</p>
              <p className="text-[10px] text-sidebar-foreground/40 tracking-wide">Advocacia Digital</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </button>
        </div>

        {/* Status WhatsApp */}
        {!collapsed && (
          <div className="mx-3 mt-2.5 px-2.5 py-1.5 rounded-md border border-sidebar-border/50 bg-sidebar-accent/40 flex items-center gap-2">
            <div className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              badges.waStatus === "connected" ? "bg-emerald-500" : "bg-slate-400"
            )} />
            <span className="text-[11px] text-sidebar-foreground/50 truncate">
              {badges.waStatus === "connected"
                ? `${badges.activeLeads} leads ativos`
                : "WhatsApp desconectado"}
            </span>
          </div>
        )}

        {/* Nav por grupos */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 relative">
          {groups.map(group => {
            const isOpen    = openGroups[group.id];
            const hasActive = group.items.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + "/"));
            const groupBadge = group.items.reduce((a, i) => a + (i.badge || 0), 0);

            return (
              <div key={group.id}>
                {/* Header do grupo */}
                <button
                  onClick={() => !collapsed && toggleGroup(group.id)}
                  title={collapsed ? group.label : undefined}
                  className={cn(
                    "w-full flex items-center px-3 py-1.5 text-left transition-colors",
                    collapsed ? "justify-center" : "justify-between",
                    "text-sidebar-foreground/35 hover:text-sidebar-foreground/55"
                  )}>
                  {collapsed ? (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: group.color }} />
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: group.color }} />
                        <span className={cn(
                          "text-[10px] font-semibold uppercase tracking-widest",
                          hasActive && "text-sidebar-foreground/55"
                        )}>{group.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {groupBadge > 0 && !isOpen && (
                          <span className="min-w-[16px] h-3.5 px-1 rounded-full text-[9px] font-semibold text-white bg-red-500 flex items-center justify-center">
                            {groupBadge}
                          </span>
                        )}
                        <ChevronDown className={cn("h-2.5 w-2.5 transition-transform duration-150", isOpen && "rotate-180")} />
                      </div>
                    </>
                  )}
                </button>

                {/* Itens do grupo */}
                {(isOpen || collapsed) && (
                  <div className={cn("space-y-px", collapsed ? "px-1.5" : "px-2 pb-1.5")}>
                    {group.items.map(item => {
                      const active = location.pathname === item.to;
                      return (
                        <Link key={item.to} to={item.to}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
                            collapsed ? "p-2 justify-center" : "px-2.5 py-[7px]",
                            active
                              ? "bg-primary/[0.08] text-primary"
                              : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                          )}>
                          <item.icon className={cn(
                            "h-[15px] w-[15px] shrink-0",
                            active ? "text-primary" : "text-sidebar-foreground/45"
                          )} />
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
                {!collapsed && <div className="mx-3 h-px bg-sidebar-border/40 mt-1" />}
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-sidebar-border/70">
          <button onClick={logout}
            className={cn(
              "flex items-center gap-2.5 rounded-md text-[13px] font-medium text-sidebar-foreground/40 hover:text-red-500 hover:bg-red-500/8 transition-colors w-full",
              collapsed ? "p-2 justify-center" : "px-2.5 py-[7px]"
            )}
            title={collapsed ? "Sair" : undefined}>
            <LogOut className="h-[15px] w-[15px] shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          {!collapsed && user && (
            <p className="text-[10px] text-sidebar-foreground/25 px-2.5 pt-1 truncate">{user.email}</p>
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
