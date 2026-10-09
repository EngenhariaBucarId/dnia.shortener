import { useCallback, useEffect, useState } from "react";
import { supabase, SHORT_DOMAIN } from "@/lib/supabase";
import type { BioPageRow } from "@/lib/types";
import { splitBioPages } from "@/lib/bio-pages";
import { BioPageEditor, CreateBioPageForm } from "@/components/BioPageEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Aba = "ativas" | "arquivadas";

export default function BioPages() {
  const [pages, setPages] = useState<BioPageRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("ativas");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("bio_pages")
      .select("*")
      .order("created_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setPages([]);
      return [];
    }

    setPages(data ?? []);
    return data ?? [];
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { active, archived } = splitBioPages(pages ?? []);
  const visible = aba === "ativas" ? active : archived;
  // A página selecionada precisa estar na aba aberta; se não estiver (acabou de
  // ser arquivada, reativada ou apagada), cai na primeira da aba.
  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  /** Arquivou ou reativou: abre a aba onde a página foi parar, com ela selecionada. */
  async function handleChanged() {
    const before = selected;
    const fresh = await load();
    const after = fresh.find((p) => p.id === before?.id);
    if (before && after && after.is_active !== before.is_active) {
      setAba(after.is_active ? "ativas" : "arquivadas");
      setSelectedId(after.id);
    }
  }

  async function handleDeleted() {
    setSelectedId(null);
    await load();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
          Link na bio
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted-foreground">
          Uma página de links por perfil, no domínio da marca. Cada botão é um
          link rastreado, então o clique na bio entra no mesmo relatório.
        </p>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <CreateBioPageForm onCreated={load} />

      {pages === null ? (
        <Skeleton className="h-10 w-full max-w-md" />
      ) : (
        <div className="space-y-6">
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <TabsList>
              <TabsTrigger value="ativas">
                Ativas <span className="ml-1.5 tabular text-muted-foreground">{active.length}</span>
              </TabsTrigger>
              <TabsTrigger value="arquivadas">
                Arquivadas <span className="ml-1.5 tabular text-muted-foreground">{archived.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {visible.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {aba === "ativas"
                ? "Nenhuma página no ar. Crie uma acima ou reative uma arquivada."
                : "Nenhuma página arquivada."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {visible.map((page) => (
                  <Button
                    key={page.id}
                    variant={page.id === selected?.id ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedId(page.id)}
                    className={cn("font-code", page.id === selected?.id && "border-primary text-primary-ink")}
                  >
                    @{page.slug}
                  </Button>
                ))}
              </div>

              {selected && (
                <BioPageEditor
                  key={selected.id}
                  page={selected}
                  onChanged={handleChanged}
                  onDeleted={handleDeleted}
                />
              )}
            </>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        As páginas são servidas pelo mesmo domínio curto ({SHORT_DOMAIN}), em
        HTML de servidor — por isso a prévia funciona quando alguém compartilha
        o endereço. Página arquivada sai do ar e o endereço leva pro site da dn.ia.
      </p>
    </div>
  );
}
