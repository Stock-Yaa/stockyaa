"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat } from "@/components/pharmacy-context";

const ROW_HEIGHT = 40;

/**
 * Revenue per category as horizontal bars, largest first. The chart grows
 * with the number of categories so each bar keeps its label readable.
 */
export function CategoryBarChart({
  data,
  label,
}: {
  data: { name: string; revenue: number }[];
  /** Names the series in the tooltip. */
  label: string;
}) {
  const f = useFormat();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * ROW_HEIGHT + 48) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(value: number) => compact.format(value)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => [f.money(Number(value)), label]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 13,
            }}
          />
          <Bar dataKey="revenue" fill="var(--chart-3)" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
