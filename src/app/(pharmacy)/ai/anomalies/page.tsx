import { Info, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { RefreshButton } from "@/components/ui/refresh-button";
import { getDb } from "@/db";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import {
  ANOMALY_SEVERITIES,
  detectAnomalies,
  type Anomaly,
  type AnomalyItem,
  type AnomalySeverity,
  type AnomalyType,
} from "@/lib/anomalies";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { now } from "@/lib/time";
import { cn } from "@/lib/utils";

export const generateMetadata = pageTitle("anomalies.title");

// Chips shown per anomaly before "+N more".
const MAX_ITEMS = 20;

const SEVERITY: Record<
  AnomalySeverity,
  {
    icon: LucideIcon;
    label: MessageKey;
    cardLabel: MessageKey;
    text: string;
    card: string;
    panel: string;
    badge: string;
  }
> = {
  high: {
    icon: ShieldAlert,
    label: "anomalies.severityHigh",
    cardLabel: "anomalies.high",
    text: "text-destructive",
    card: "border-destructive/30",
    panel: "border-l-destructive bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
  },
  medium: {
    icon: TriangleAlert,
    label: "anomalies.severityMedium",
    cardLabel: "anomalies.medium",
    text: "text-warning",
    card: "border-warning/30",
    panel: "border-l-warning bg-warning/5",
    badge: "bg-warning/15 text-warning",
  },
  low: {
    icon: Info,
    label: "anomalies.severityLow",
    cardLabel: "anomalies.low",
    text: "text-info",
    card: "border-info/30",
    panel: "border-l-info bg-info/5",
    badge: "bg-info/15 text-info",
  },
};

// `titleOne` is the wording when exactly one record is affected.
const TYPE_TEXT: Record<
  AnomalyType,
  { label: MessageKey; title: MessageKey; titleOne?: MessageKey; body: MessageKey }
> = {
  expiredStock: { label: "anomalies.expiredStockLabel", title: "anomalies.expiredStockTitle", titleOne: "anomalies.expiredStockTitleOne", body: "anomalies.expiredStockBody" },
  soldBelowCost: { label: "anomalies.soldBelowCostLabel", title: "anomalies.soldBelowCostTitle", titleOne: "anomalies.soldBelowCostTitleOne", body: "anomalies.soldBelowCostBody" },
  cashShortage: { label: "anomalies.cashShortageLabel", title: "anomalies.cashShortageTitle", titleOne: "anomalies.cashShortageTitleOne", body: "anomalies.cashShortageBody" },
  volumeSpike: { label: "anomalies.volumeSpikeLabel", title: "anomalies.volumeSpikeTitle", titleOne: "anomalies.volumeSpikeTitleOne", body: "anomalies.volumeSpikeBody" },
  highRefunds: { label: "anomalies.highRefundsLabel", title: "anomalies.highRefundsTitle", body: "anomalies.highRefundsBody" },
  largeDiscounts: { label: "anomalies.largeDiscountsLabel", title: "anomalies.largeDiscountsTitle", titleOne: "anomalies.largeDiscountsTitleOne", body: "anomalies.largeDiscountsBody" },
  stockWriteOffs: { label: "anomalies.stockWriteOffsLabel", title: "anomalies.stockWriteOffsTitle", titleOne: "anomalies.stockWriteOffsTitleOne", body: "anomalies.stockWriteOffsBody" },
  pricedBelowCost: { label: "anomalies.pricedBelowCostLabel", title: "anomalies.pricedBelowCostTitle", titleOne: "anomalies.pricedBelowCostTitleOne", body: "anomalies.pricedBelowCostBody" },
  deadStock: { label: "anomalies.deadStockLabel", title: "anomalies.deadStockTitle", titleOne: "anomalies.deadStockTitleOne", body: "anomalies.deadStockBody" },
};

// How an item's unit count reads for each check.
const ITEM_UNITS: Partial<Record<AnomalyType, MessageKey>> = {
  expiredStock: "anomalies.itemUnits",
  volumeSpike: "anomalies.itemSold",
  highRefunds: "anomalies.itemRefunds",
  stockWriteOffs: "anomalies.itemUnits",
  deadStock: "anomalies.itemUnits",
};

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);
  const { severity: severityParam } = await searchParams;
  const severity = ANOMALY_SEVERITIES.find((s) => s === severityParam) ?? null;

  const anomalies = await detectAnomalies(
    db,
    branchScope(branch),
    pharmacy.timezone,
    todayInTimezone(pharmacy.timezone),
  );
  const scannedAt = f.dateTime(now());
  const counts = { high: 0, medium: 0, low: 0 };
  for (const a of anomalies) counts[a.severity]++;
  const shown = severity ? anomalies.filter((a) => a.severity === severity) : anomalies;

  const describe = (a: Anomaly) => {
    const vars = {
      ...a.vars,
      count: f.number(a.count),
      ...(a.vars.units !== undefined && { units: f.number(a.vars.units) }),
      ...(a.vars.total !== undefined && { total: f.number(a.vars.total) }),
      ...(a.amount !== undefined && { amount: f.money(a.amount) }),
    };
    const text = TYPE_TEXT[a.type];
    const title = a.count === 1 && text.titleOne ? text.titleOne : text.title;
    return { label: t(text.label), title: t(title, vars), body: t(text.body, vars) };
  };

  const itemText = (a: Anomaly, item: AnomalyItem) => {
    const label = a.type === "cashShortage" ? f.dateTime(item.label) : item.label;
    const unitsKey = ITEM_UNITS[a.type];
    const extra =
      item.amount !== undefined
        ? f.money(item.amount)
        : item.units !== undefined && unitsKey
          ? t(unitsKey, { count: f.number(item.units) })
          : null;
    return { label, extra };
  };

  return (
    <>
      <PageHeader title={t("anomalies.title")} description={t("anomalies.description")}>
        <RefreshButton label={t("anomalies.rescan")} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          href="/ai/anomalies"
          active={severity === null}
          label={t("anomalies.total")}
          value={f.number(anomalies.length)}
        />
        {ANOMALY_SEVERITIES.map((s) => (
          <SummaryCard
            key={s}
            href={severity === s ? "/ai/anomalies" : `/ai/anomalies?severity=${s}`}
            active={severity === s}
            label={t(SEVERITY[s].cardLabel)}
            value={f.number(counts[s])}
            className={cn(SEVERITY[s].card, SEVERITY[s].text)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={severity ? t("anomalies.noneFiltered") : t("anomalies.none")}
          hint={severity ? undefined : t("anomalies.noneHint")}
        >
          {severity && (
            <Link href="/ai/anomalies" className="text-sm text-primary hover:underline">
              {t("anomalies.showAll")}
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {shown.map((a) => {
            const style = SEVERITY[a.severity];
            const Icon = style.icon;
            const text = describe(a);
            return (
              <section
                key={a.type}
                className={cn("rounded-xl border border-l-4 border-border p-5", style.panel)}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Icon className={cn("mt-0.5 size-5 shrink-0", style.text)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold">{text.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{text.body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {text.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase",
                        style.badge,
                      )}
                    >
                      {t(style.label)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    {t("anomalies.affectedItems")}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {a.items.slice(0, MAX_ITEMS).map((item, i) => {
                      const { label, extra } = itemText(a, item);
                      const content = (
                        <>
                          {label}
                          {extra && <span className="text-muted-foreground"> · {extra}</span>}
                        </>
                      );
                      const chip = "inline-block rounded-full border border-border bg-card px-3 py-1 text-sm";
                      return (
                        <li key={`${item.label}-${i}`}>
                          {item.href ? (
                            <Link href={item.href} className={cn(chip, "hover:bg-muted")}>
                              {content}
                            </Link>
                          ) : (
                            <span className={chip}>{content}</span>
                          )}
                        </li>
                      );
                    })}
                    {a.items.length > MAX_ITEMS && (
                      <li className="self-center text-sm text-muted-foreground">
                        {t("anomalies.moreItems", { count: f.number(a.items.length - MAX_ITEMS) })}
                      </li>
                    )}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("anomalies.detected", { time: scannedAt })}
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function SummaryCard({
  href,
  active,
  label,
  value,
  className,
}: {
  href: string;
  active: boolean;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card
        className={cn(
          "h-full p-5 transition-shadow hover:shadow-sm",
          className,
          active && "ring-2 ring-current",
        )}
      >
        <p className="text-sm">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      </Card>
    </Link>
  );
}
