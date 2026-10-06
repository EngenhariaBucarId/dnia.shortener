import { Link as RouterLink, useLocation } from "react-router-dom";
import { BarChart3, LinkIcon, LogOut, UserSquare2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SHORT_DOMAIN } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Links", icon: LinkIcon },
  { to: "/campanhas", label: "Campanhas", icon: BarChart3 },
  { to: "/bio", label: "Link na bio", icon: UserSquare2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-6 px-5 sm:px-8">
          <span className="font-display text-base font-bold tracking-tight">
            links<span className="text-primary">.dn.ia</span>
          </span>

          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <RouterLink
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  pathname === to
                    ? "bg-primary/15 text-primary-light"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </RouterLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 sm:inline">
              {SHORT_DOMAIN}
            </span>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}
