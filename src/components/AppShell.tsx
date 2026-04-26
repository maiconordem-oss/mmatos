import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Kanban,
  MessageSquare,
  Users,
  LogOut,
  FileSignature,
  Smartphone,
  Bot,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navMain = [
  { to: "/dashboard",  label: "Dashboard",            icon: LayoutDashboard },
  { to: "/funis",      label: "Funis de Atendimento", icon: Bot },
  { to: "/inbox",      label: "Inbox WhatsApp",       icon: MessageSquare },
  { to: "/kanban",     label: "Kanban",               icon: Kanban },
  { to: "/clientes",   label: "Clientes",             icon: Users },
  { to: "/contratos",  label: "Propostas & Contratos",icon: FileSignature },
  { to: "/manual",     label: "Manual de Prompts",    icon: BookOpen },
] as const;

const navBottom = [
  { to: "/whatsapp", label: "Conectar WhatsApp", icon: Smartphone },
] as const;

function NavItem({ to, label, icon: Icon, active }: { to: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function AppShell({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r flex flex-col bg-card">
        {/* Logo */}
        <div className="px-4 py-5 border-b">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Lex CRM</p>
              <p className="text-[10px] text-muted-foreground">Advocacia Digital</p>
            </div>
          </div>
        </div>

        {/* Nav principal */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navMain.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={location.pathname === item.to}
            />
          ))}
        </nav>

        {/* Nav inferior */}
        <div className="p-3 border-t space-y-1">
          {navBottom.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={location.pathname === item.to}
            />
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
          {user && (
            <p className="text-[10px] text-muted-foreground px-3 pt-1 truncate">{user.email}</p>
          )}
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        {children}
      </main>
    </div>
  );
}
