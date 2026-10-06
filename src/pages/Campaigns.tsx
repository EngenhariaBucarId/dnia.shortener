import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CampaignStatsRow, GroupStatsRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/StatTile";
import { formatDateTime } from "@/lib/utils";

type Row = {
  label: string;
  clicks: number;
  unique_clicks: number;
  links: number;
  last_click_at: string | null;
};

function StatsTable({ rows, firstColumn }: { rows: Row[]; firstColumn: string }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Nenhum clique registrado ainda neste corte.
      </p>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.clicks));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <th className="eyebrow pb-2 font-normal">{firstColumn}</th>
            <th className="eyebrow pb-2 text-right font-normal">Cliques</th>
            <th className="eyebrow pb-2 text-right font-normal">Únicos</th>
            <th className="eyebrow pb-2 text-right font-normal">Links</th>
            <th className="eyebrow pb-2 text-right font-normal">
              Último clique
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-border-subtle/60 last:border-0"
            >
              <td className="py-3 pr-4">
                <span className="text-[13px] text-foreground/90">
                  {row.label}
                </span>
                {/* Barra de magnitude em tom único — a leitura é pelo
                    tamanho, não pela cor (ver nota em StatTile.tsx). */}
                <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(row.clicks / max) * 100}%` }}
                  />
                </div>
              </td>
              <td className="py-3 text-right font-mono text-[13px] tabular">
                {row.clicks}
              </td>
              <td className="py-3 text-right font-mono text-[13px] tabular text-muted-foreground">
                {row.unique_clicks}
              </td>
              <td className="py-3 text-right font-mono text-[13px] tabular text-muted-foreground">
                {row.links}
              </td>
              <td className="py-3 text-right font-mono text-[11px] text-muted-foreground">
                {formatDateTime(row.last_click_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Row[] | null>(null);
  const [rostos, setRostos] = useState<Row[]>([]);
  const [canais, setCanais] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const [campaignRes, rostoRes, canalRes] = await Promise.all([
        supabase
          .from("v_campaign_stats")
          .select("*")
          .order("clicks", { ascending: false }),
        supabase
          .from("v_rosto_stats")
          .select("*")
          .order("clicks", { ascending: false }),
        supabase
          .from("v_canal_stats")
          .select("*")
          .order("clicks", { ascending: false }),
      ]);

      if (!active) return;

      const firstError =
        campaignRes.error ?? rostoRes.error ?? canalRes.error ?? null;
      if (firstError) {
        setError(firstError.message);
        setCampaigns([]);
        return;
      }

      setCampaigns(
        (campaignRes.data ?? []).map((row: CampaignStatsRow) => ({
          label: row.campaign ?? "(sem campanha)",
          clicks: row.clicks,
          unique_clicks: row.unique_clicks,
          links: row.links,
          last_click_at: row.last_click_at,
        }))
      );
      setRostos(mapGroup(rostoRes.data ?? []));
      setCanais(mapGroup(canalRes.data ?? []));
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const totalClicks = (campaigns ?? []).reduce((sum, r) => sum + r.clicks, 0);
  const topCampaign = (campaigns ?? [])[0];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
          Campanhas
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted-foreground">
          De qual campanha, rosto e canal vieram os cliques. Prévias de link
          (WhatsApp, Instagram) já saem da conta.
        </p>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {campaigns === null ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="panel flex flex-wrap gap-x-12 gap-y-5 p-6">
            <StatTile label="Cliques no período" value={totalClicks} />
            <StatTile label="Campanhas ativas" value={campaigns.length} />
            <StatTile
              label="Campanha com mais clique"
              value={topCampaign?.label ?? "—"}
              hint={topCampaign ? `${topCampaign.clicks} cliques` : undefined}
              className="max-w-[260px]"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Desempenho por corte</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="campanha">
                <TabsList>
                  <TabsTrigger value="campanha">Campanha</TabsTrigger>
                  <TabsTrigger value="rosto">Rosto</TabsTrigger>
                  <TabsTrigger value="canal">Canal</TabsTrigger>
                </TabsList>

                <TabsContent value="campanha">
                  <StatsTable rows={campaigns} firstColumn="Campanha" />
                </TabsContent>
                <TabsContent value="rosto">
                  <StatsTable rows={rostos} firstColumn="Rosto" />
                </TabsContent>
                <TabsContent value="canal">
                  <StatsTable rows={canais} firstColumn="Canal" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function mapGroup(rows: GroupStatsRow[]): Row[] {
  return rows.map((row) => ({
    label: row.label ?? "(não informado)",
    clicks: row.clicks,
    unique_clicks: row.unique_clicks,
    links: row.links,
    last_click_at: row.last_click_at,
  }));
}
