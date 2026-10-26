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

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Revenue per clock hour (0-23) as bars; the tooltip adds the number of sales. */
export function HourlySalesChart({
  data,
  revenueLabel,
  countLabel,
}: {
  data: { hour: number; revenue: number; count: number }[];
  revenueLabel: string;
  countLabel: string;
}) {
  const f = useFormat();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            tickFormatter={(hour: number) => String(hour).padStart(2, "0")}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={1}
          />
          <YAxis
            tickFormatter={(value: number) => compact.format(value)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground shadow-sm">
                  <p className="font-medium">
                    {hourLabel(row.hour)}–{hourLabel((row.hour + 1) % 24)}
                  </p>
                  <p className="text-muted-foreground">
                    {revenueLabel}:{" "}
                    <span className="font-medium text-foreground">{f.money(row.revenue)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {countLabel}:{" "}
                    <span className="font-medium text-foreground">{f.number(row.count)}</span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
