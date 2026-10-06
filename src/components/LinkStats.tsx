import { Suspense, lazy, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase, shortUrl } from "@/lib/supabase";
import type { ClickRow, DailyClickRow, LinkRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RankedList, StatTile, groupCount } from "@/components/StatTile";
import { formatDateTime } from "@/lib/utils";

/**
 * O gráfico carrega sob demanda: a biblioteca de chart é ~400 kB, e quem só
 * entra pra criar um link não precisa baixar isso. Só desce quando alguém
 * abre a métrica de um link.
 */
const DailyClicksChart = lazy(() =>
  import("@/components/DailyClicksChart").then((m) => ({
    default: m.DailyClicksChart,
  }))
);

export function LinkStats({ link }: { link: LinkRow }) {
  const [clicks, setClicks] = useState<ClickRow[] | null>(null);
  const [daily, setDaily] = useState<DailyClickRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setClicks(null);
    setError(null);

    async function load() {
      const [clicksRes, dailyRes] = await Promise.all([
        supabase
          .from("clicks")
          .select("*")
          .eq("link_id", link.id)
          .order("clicked_at", { ascending: false })
          .limit(5000),
        supabase
          .from("v_daily_clicks")
          .select("*")
          .eq("link_id", link.id)
          .order("day", { ascending: true }),
      ]);

      if (!active) return;

      if (clicksRes.error || dailyRes.error) {
        setError(clicksRes.error?.message ?? dailyRes.error?.message ?? null);
        setClicks([]);
        return;
      }

      setClicks(clicksRes.data ?? []);
      setDaily(dailyRes.data ?? []);
    }

    load();
    return () => {
      active = false;
    };
  }, [link.id]);

  if (clicks === null) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[220px] w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview de link (WhatsApp, Instagram, LinkedIn) busca a URL sem ninguém
  // ter clicado. Conta como acesso de bot e fica FORA da métrica de clique,
  // senão todo link compartilhado nasce com cliques fantasma.
  const human = clicks.filter((c) => !c.is_bot);
  const botHits = clicks.length - human.length;
  const unique = new Set(human.map((c) => c.ip_hash).filter(Boolean)).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-code text-sm font-medium text-primary-ink">
            {shortUrl(link.slug)}
          </span>
          {link.title && (
            <span className="text-sm font-normal text-muted-foreground">
              {link.title}
            </span>
          )}
          <a
            href={link.final_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary-ink"
          >
            abrir destino <ExternalLink className="h-3 w-3" />
          </a>
        </CardTitle>

        <div className="flex flex-wrap gap-2 pt-1">
          {link.campaign && <Badge variant="primary">{link.campaign}</Badge>}
          {link.rosto && <Badge>{link.rosto}</Badge>}
          {link.canal && <Badge>{link.canal}</Badge>}
          {!link.is_active && <Badge variant="destructive">inativo</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {error && <p className="text-[13px] text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <StatTile label="Cliques" value={human.length} />
          <StatTile
            label="Cliques únicos"
            value={unique}
            hint="por IP (hash), sem bots"
          />
          <StatTile
            label="Último clique"
            value={
              human[0] ? formatDateTime(human[0].clicked_at).split(" ")[0] : "—"
            }
            hint={human[0] ? formatDateTime(human[0].clicked_at) : undefined}
          />
          <StatTile
            label="Prévias / bots"
            value={botHits}
            hint="não contam como clique"
          />
        </div>

        <div>
          <span className="eyebrow">Cliques por dia</span>
          <div className="mt-3">
            <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
              <DailyClicksChart
                data={daily.map((d) => ({ day: d.day, clicks: d.clicks }))}
              />
            </Suspense>
          </div>
        </div>

        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          <RankedList
            title="Origem (utm_source)"
            rows={groupCount(human.map((c) => c.utm_source), "(sem utm)")}
          />
          <RankedList
            title="Referrer"
            rows={groupCount(human.map((c) => c.referrer_host), "(direto)")}
          />
          <RankedList
            title="Dispositivo"
            rows={groupCount(human.map((c) => c.device_type))}
          />
          <RankedList
            title="País"
            rows={groupCount(human.map((c) => c.country))}
          />
        </div>

        <div className="rounded-md border border-border-subtle bg-muted p-4">
          <span className="eyebrow">Destino final</span>
          <p className="mt-2 break-all font-code text-[11px] leading-relaxed text-muted-foreground">
            {link.final_url}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
