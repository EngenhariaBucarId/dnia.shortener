import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; clicks: number };

function formatDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/**
 * Cliques por dia — série ÚNICA, então: um só tom (o azul da marca), sem
 * legenda (o título já nomeia a série), sem número em cima de cada barra.
 * Grid só horizontal e eixos recessivos, pra barra ser o que salta.
 */
export function DailyClicksChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground/70">
        Nenhum clique registrado ainda.
      </p>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeOpacity={0.6}
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            stroke="hsl(var(--border))"
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            stroke="hsl(var(--border))"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--primary))", fillOpacity: 0.08 }}
            labelFormatter={(value) => formatDay(String(value))}
            formatter={(value: number) => [value, "cliques"]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar
            dataKey="clicks"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
