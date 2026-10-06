import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LinkRow, LinkStatsRow } from "@/lib/types";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { LinkList } from "@/components/LinkList";
import { LinkStats } from "@/components/LinkStats";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/StatTile";

export default function Dashboard() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [stats, setStats] = useState<Map<string, LinkStatsRow>>(new Map());
  const [selected, setSelected] = useState<LinkRow | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [linksRes, statsRes] = await Promise.all([
      supabase.from("links").select("*").order("created_at", { ascending: false }),
      supabase.from("v_link_stats").select("*"),
    ]);

    if (linksRes.error) {
      setError(linksRes.error.message);
      setLinks([]);
      return;
    }

    setLinks(linksRes.data ?? []);
    setStats(
      new Map((statsRes.data ?? []).map((row) => [row.link_id, row]))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const knownCampaigns = useMemo(() => {
    const set = new Set<string>();
    for (const link of links ?? []) {
      if (link.campaign) set.add(link.campaign);
    }
    return [...set].sort();
  }, [links]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links ?? [];
    return (links ?? []).filter((link) =>
      [link.slug, link.title, link.campaign, link.rosto, link.canal]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [links, query]);

  const totals = useMemo(() => {
    let clicks = 0;
    let unique = 0;
    for (const stat of stats.values()) {
      clicks += stat.clicks;
      unique += stat.unique_clicks;
    }
    return { clicks, unique, links: links?.length ?? 0 };
  }, [stats, links]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
          Links e UTMs
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted-foreground">
          Encurte, marque com UTM na convenção e acompanhe o clique por
          campanha, rosto e canal.
        </p>
      </div>

      <div className="panel flex flex-wrap gap-x-12 gap-y-5 p-6">
        <StatTile label="Links ativos" value={totals.links} />
        <StatTile label="Cliques totais" value={totals.clicks} />
        <StatTile
          label="Cliques únicos"
          value={totals.unique}
          hint="sem prévias de link"
        />
      </div>

      <CreateLinkForm
        knownCampaigns={knownCampaigns}
        onCreated={(link) => {
          setLinks((prev) => [link, ...(prev ?? [])]);
          setSelected(link);
          load();
        }}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em]">
            Links criados
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por slug, campanha, rosto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-destructive">{error}</p>}

        {links === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <LinkList
            links={filtered}
            stats={stats}
            selectedId={selected?.id ?? null}
            onSelect={(link) =>
              setSelected((prev) => (prev?.id === link.id ? null : link))
            }
            onChanged={load}
          />
        )}
      </div>

      {selected && <LinkStats link={selected} />}
    </div>
  );
}
