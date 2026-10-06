import { Link as RouterLink, useLocation } from "react-router-dom";
import { BarChart3, LinkIcon, LogOut, UserSquare2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SHORT_DOMAIN } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
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
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 sm:px-8">
          <RouterLink to="/" aria-label="Início" className="shrink-0">
            <BrandLogo />
          </RouterLink>

          {/* Desktop: navegação no topo. No celular ela vai pra barra inferior. */}
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(({ to, label, icon: Icon }) => (
              <RouterLink
                key={to}
                to={to}
                aria-current={pathname === to ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  pathname === to
                    ? "bg-primary/[0.08] text-primary-ink"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </RouterLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden rounded-[8px] border border-border-subtle bg-muted px-2 py-1 font-code text-[11px] text-muted-foreground lg:inline">
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

      <main className="mx-auto max-w-[1200px] px-4 pb-28 pt-10 sm:px-8 sm:pb-24">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border-subtle bg-card/95 backdrop-blur-xl sm:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <RouterLink
            key={to}
            to={to}
            aria-current={pathname === to ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              pathname === to ? "text-primary-ink" : "text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </RouterLink>
        ))}
      </nav>
    </div>
  );
}
