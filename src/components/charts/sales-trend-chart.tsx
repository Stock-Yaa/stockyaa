"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat } from "@/components/pharmacy-context";

const REVENUE = "var(--chart-1)";
const COUNT = "var(--chart-3)";

/**
 * Revenue per day as a filled area (left axis) with the number of sales as a
 * dashed line (right axis). The legend names both series, so colour is not
 * the only cue.
 */
export function SalesTrendChart({
  data,
  revenueLabel,
  countLabel,
}: {
  data: { day: string; revenue: number; count: number }[];
  revenueLabel: string;
  countLabel: string;
}) {
  const f = useFormat();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: REVENUE }} />
          {revenueLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: COUNT }} />
          {countLabel}
        </li>
      </ul>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sales-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REVENUE} stopOpacity={0.35} />
                <stop offset="100%" stopColor={REVENUE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => f.dayShort(day)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={16}
            />
            <YAxis
              yAxisId="revenue"
              tickFormatter={(value: number) => compact.format(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              formatter={(value, name) =>
                name === "revenue"
                  ? [f.money(Number(value)), revenueLabel]
                  : [f.number(Number(value)), countLabel]
              }
              labelFormatter={(day) => f.day(String(day))}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: 13,
              }}
            />
            <Area
              yAxisId="revenue"
              dataKey="revenue"
              type="monotone"
              stroke={REVENUE}
              strokeWidth={2}
              fill="url(#sales-trend-fill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="count"
              dataKey="count"
              type="monotone"
              stroke={COUNT}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
