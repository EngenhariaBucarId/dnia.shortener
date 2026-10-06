import { Suspense, lazy, useState } from "react";
import { BarChart3, Check, Copy, Pencil, Power, QrCode } from "lucide-react";
import { supabase, shortUrl } from "@/lib/supabase";
import type { LinkRow, LinkStatsRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditLinkDialog } from "@/components/EditLinkDialog";
import { cn, formatDate } from "@/lib/utils";

// A lib de QR code só desce quando alguém abre o QR de um link.
const QrCodeDialog = lazy(() =>
  import("@/components/QrCodeDialog").then((m) => ({ default: m.QrCodeDialog }))
);

export function LinkList({
  links,
  stats,
  selectedId,
  onSelect,
  onChanged,
}: {
  links: LinkRow[];
  stats: Map<string, LinkStatsRow>;
  selectedId: string | null;
  onSelect: (link: LinkRow) => void;
  onChanged: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [showingQr, setShowingQr] = useState<LinkRow | null>(null);

  async function copy(link: LinkRow) {
    await navigator.clipboard.writeText(shortUrl(link.slug));
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function toggle(link: LinkRow) {
    const { error } = await supabase
      .from("links")
      .update({ is_active: !link.is_active })
      .eq("id", link.id);
    if (!error) onChanged();
  }

  if (links.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-[13px] text-muted-foreground">
          Nenhum link ainda. Crie o primeiro no formulário acima.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {links.map((link) => {
          const stat = stats.get(link.id);
          const isSelected = selectedId === link.id;

          return (
            <div
              key={link.id}
              className={cn(
                "panel panel-hover flex flex-wrap items-center gap-x-5 gap-y-3 p-4",
                isSelected && "border-primary/40"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-[13px] text-primary-light">
                    /{link.slug}
                  </span>
                  {link.title && (
                    <span className="truncate text-[13px] text-foreground/90">
                      {link.title}
                    </span>
                  )}
                  {!link.is_active && <Badge variant="destructive">inativo</Badge>}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  {link.campaign && <span>{link.campaign}</span>}
                  {link.rosto && <span>· {link.rosto}</span>}
                  {link.canal && <span>· {link.canal}</span>}
                  <span>· {formatDate(link.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="font-display text-xl font-bold tabular leading-none">
                    {stat?.clicks ?? 0}
                  </p>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    cliques
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold tabular leading-none text-muted-foreground">
                    {stat?.unique_clicks ?? 0}
                  </p>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    únicos
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => copy(link)}>
                  {copiedId === link.id ? <Check /> : <Copy />}
                  {copiedId === link.id ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  variant={isSelected ? "outline" : "ghost"}
                  size="sm"
                  onClick={() => onSelect(link)}
                >
                  <BarChart3 />
                  Métricas
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Editar destino"
                  aria-label="Editar destino"
                  onClick={() => setEditing(link)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="QR code"
                  aria-label="QR code"
                  onClick={() => setShowingQr(link)}
                >
                  <QrCode />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={link.is_active ? "Desativar link" : "Reativar link"}
                  aria-label={link.is_active ? "Desativar link" : "Reativar link"}
                  onClick={() => toggle(link)}
                >
                  <Power className={link.is_active ? "" : "text-destructive"} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditLinkDialog
          link={editing}
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={onChanged}
        />
      )}

      {showingQr && (
        <Suspense fallback={null}>
          <QrCodeDialog
            link={showingQr}
            open={Boolean(showingQr)}
            onOpenChange={(open) => !open && setShowingQr(null)}
          />
        </Suspense>
      )}
    </>
  );
}
