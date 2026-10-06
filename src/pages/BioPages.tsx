import { useCallback, useEffect, useState } from "react";
import { supabase, SHORT_DOMAIN } from "@/lib/supabase";
import type { BioPageRow } from "@/lib/types";
import { BioPageEditor, CreateBioPageForm } from "@/components/BioPageEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function BioPages() {
  const [pages, setPages] = useState<BioPageRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("bio_pages")
      .select("*")
      .order("created_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setPages([]);
      return;
    }

    setPages(data ?? []);
    setSelectedId((prev) => prev ?? data?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = pages?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Link na bio
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Uma página de links por perfil, no domínio da marca. Cada botão é um
          link rastreado, então o clique na bio entra no mesmo relatório.
        </p>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <CreateBioPageForm onCreated={load} />

      {pages === null ? (
        <Skeleton className="h-10 w-full max-w-md" />
      ) : pages.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma página criada ainda.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {pages.map((page) => (
              <Button
                key={page.id}
                variant={page.id === selectedId ? "outline" : "ghost"}
                size="sm"
                onClick={() => setSelectedId(page.id)}
                className={cn("font-mono", page.id === selectedId && "border-primary")}
              >
                @{page.slug}
                {!page.is_active && <Badge variant="destructive">inativa</Badge>}
              </Button>
            ))}
          </div>

          {selected && (
            <BioPageEditor key={selected.id} page={selected} onChanged={load} />
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground/70">
        As páginas são servidas pelo mesmo domínio curto ({SHORT_DOMAIN}), em
        HTML de servidor — por isso a prévia funciona quando alguém compartilha
        o endereço.
      </p>
    </div>
  );
}
