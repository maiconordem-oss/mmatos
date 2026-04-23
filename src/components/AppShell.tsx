import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Kanban,
  MessageSquare,
  Users,
  LogOut,
  Sparkles,
  FileSignature,
  Smartphone,
  Workflow,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navMain = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kanban", label: "Kanban", icon: Kanban },
  { to: "/inbox", label: "Inbox WhatsApp", icon: MessageSquare },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/contratos", label: "Propostas & Contratos", icon: FileSignature },
  { to: "/agentes", label: "Agentes IA", icon: Sparkles },
  { to: "/workflows", label: "Workflows", icon: Workflow },
] as const;

const navBottom = [
  { to: "/whatsapp", label: "Conectar WhatsApp", icon: Smartphone },
] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link to={to} className="relative group block">
      <div
        className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 mx-auto relative",
          active
            ? "text-[#c9a84c]"
            : "text-white/30 hover:text-white/75",
        )}
        style={active ? { background: "rgba(184,134,11,0.15)" } : undefined}
      >
        {active && (
          <span
            className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-r-full"
            style={{ background: "#c9a84c" }}
          />
        )}
        <Icon size={18} strokeWidth={1.7} />
      </div>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          className="relative text-white text-[11.5px] font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-lg"
          style={{ background: "#18150f" }}
        >
          <span
            className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
            style={{ borderRightColor: "#18150f", borderLeft: "none" }}
          />
          {label}
        </div>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "??";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Compact icon sidebar ── */}
      <aside
        className="w-[58px] flex-shrink-0 flex flex-col items-center py-3 gap-0.5 z-50"
        style={{ background: "oklch(0.17 0.035 260)" }}
      >
        {/* Logo mark */}
        <Link to="/dashboard" className="mb-2.5 group block">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[19px] text-white transition-opacity group-hover:opacity-85 select-none"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #b8860b)",
              boxShadow: "0 3px 10px rgba(184,134,11,0.4)",
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
            }}
          >
            L
          </div>
        </Link>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5 w-full px-2">
          {navMain.map(({ to, label, icon }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              icon={icon}
              active={location.pathname.startsWith(to)}
            />
          ))}
        </nav>

        {/* Separator */}
        <div
          className="w-[26px] h-px my-1.5 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.08)" }}
        />

        {/* Bottom nav */}
        <nav className="flex flex-col gap-0.5 w-full px-2">
          {navBottom.map(({ to, label, icon }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              icon={icon}
              active={location.pathname.startsWith(to)}
            />
          ))}
        </nav>

        {/* Avatar + logout */}
        <div className="mt-auto flex flex-col items-center gap-2 px-2">
          <div
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[11.5px] font-bold text-white cursor-default select-none flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #8a6020)",
              boxShadow: "0 2px 8px rgba(201,168,76,0.35)",
              border: "2px solid rgba(201,168,76,0.3)",
            }}
            title={user?.email ?? ""}
          >
            {initials}
          </div>

          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 text-white/25 hover:text-red-400 hover:bg-red-500/10"
            title="Sair"
          >
            <LogOut size={16} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
