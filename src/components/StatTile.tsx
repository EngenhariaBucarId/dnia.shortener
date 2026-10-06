import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="eyebrow">{label}</span>
      <p className="stat-number mt-1">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

/**
 * Lista ranqueada com barra de magnitude.
 *
 * De propósito NÃO usa uma cor por categoria: a paleta da marca reprova como
 * paleta categórica em fundo escuro (âmbar e verde ficam a ΔE 5.7 em
 * protanopia — indistinguíveis pra quem tem daltonismo vermelho-verde). Com
 * um tom único e a barra proporcional, a magnitude é lida pelo tamanho, não
 * pela cor, e o gráfico funciona pra todo mundo.
 */
export function RankedList({
  title,
  rows,
  emptyLabel = "Sem dados.",
  limit = 6,
}: {
  title: string;
  rows: { key: string; count: number }[];
  emptyLabel?: string;
  limit?: number;
}) {
  const visible = rows.slice(0, limit);
  const max = Math.max(1, ...visible.map((r) => r.count));

  return (
    <div className="min-w-0">
      <span className="eyebrow">{title}</span>

      {visible.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {visible.map((row) => (
            <div key={row.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-foreground/90">
                  {row.key}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular text-muted-foreground">
                  {row.count}
                </span>
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Agrupa valores e devolve [{key, count}] ordenado do maior pro menor. */
export function groupCount(
  values: (string | null | undefined)[],
  fallback = "(não informado)"
): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const key = raw && raw.trim() ? raw : fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
