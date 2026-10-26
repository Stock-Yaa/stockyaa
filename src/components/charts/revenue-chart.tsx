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

/** Revenue per calendar month (YYYY-MM) as bars; one series, so no legend. */
export function RevenueChart({
  data,
  currency,
  label,
}: {
  data: { month: string; revenue: number }[];
  currency: string;
  label: string;
}) {
  const f = useFormat(currency);
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={(month: string) => f.month(month)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={8}
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
            formatter={(value) => [f.money(Number(value)), label]}
            labelFormatter={(month) => f.month(String(month))}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 13,
            }}
          />
          <Bar dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
