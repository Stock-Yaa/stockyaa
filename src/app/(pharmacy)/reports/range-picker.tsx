"use client";

import { CalendarRange } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Quick presets plus start/end date inputs; writes the period to the URL. */
export function RangePicker({
  from,
  to,
  today,
}: {
  from: string;
  to: string;
  /** Today in the pharmacy's timezone (YYYY-MM-DD). */
  today: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Keeps the other filters (such as the branch) in the URL.
  function go(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const presets: { label: MessageKey; from: string }[] = [
    { label: "reports.preset7", from: shiftDay(today, -6) },
    { label: "reports.preset30", from: shiftDay(today, -29) },
    { label: "reports.preset90", from: shiftDay(today, -89) },
    { label: "reports.presetMonth", from: `${today.slice(0, 8)}01` },
  ];

  return (
    <Card className="mb-6 flex flex-wrap items-end justify-between gap-4 p-5 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange className="size-4" />
          {t("reports.quickRange")}
        </span>
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant={preset.from === from && to === today ? "secondary" : "outline"}
            onClick={() => go(preset.from, today)}
          >
            {t(preset.label)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">{t("reports.start")}</Label>
          <Input
            id="from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => go(e.target.value, to)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">{t("reports.end")}</Label>
          <Input
            id="to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => go(from, e.target.value)}
            className="w-auto"
          />
        </div>
      </div>
    </Card>
  );
}
