import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Kanban, MessageSquare, Users, LogOut, Scale, Sparkles, FileSignature, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kanban", label: "Kanban", icon: Kanban },
  { to: "/inbox", label: "Inbox WhatsApp", icon: MessageSquare },
  { to: "/whatsapp", label: "Conectar WhatsApp", icon: Smartphone },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/contratos", label: "Propostas & Contratos", icon: FileSignature },
  { to: "/agentes", label: "Agentes IA", icon: Sparkles },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gold flex items-center justify-center">
            <Scale className="h-5 w-5 text-gold-foreground" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Lex CRM</div>
            <div className="text-xs text-sidebar-foreground/60">Advocacia</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
