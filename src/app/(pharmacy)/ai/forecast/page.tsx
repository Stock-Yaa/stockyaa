import { and, count, eq } from "drizzle-orm";
import { ArrowDown, ArrowRight, ArrowUp, ChartSpline, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { FilterSelect, Pagination } from "@/components/ui/list-controls";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { todayInTimezone } from "@/lib/dates";
import {
  CRITICAL_DAYS,
  HISTORY_DAYS,
  WARNING_DAYS,
  getDemandForecast,
  type ForecastConfidence,
  type ForecastStatus,
  type ForecastTrend,
  type ProductForecast,
} from "@/lib/forecast";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { cn, round2 } from "@/lib/utils";
import { RefreshButton } from "@/components/ui/refresh-button";

export const generateMetadata = pageTitle("forecast.title");

const HORIZONS = [7, 14, 30, 60, 90];
const DEFAULT_HORIZON = 30;
const STATUSES: ForecastStatus[] = ["critical", "warning", "healthy"];
// Beyond this the exact number of days means little.
const MAX_DAYS_SHOWN = 365;

const STATUS_CARD: Record<ForecastStatus, string> = {
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  healthy: "border-success/30 bg-success/10 text-success",
};
const STATUS_TONE = { critical: "danger", warning: "warning", healthy: "success" } as const;

const CONFIDENCE: Record<ForecastConfidence, { label: MessageKey; className: string }> = {
  low: { label: "forecast.confidenceLow", className: "bg-warning/15 text-warning" },
  medium: { label: "forecast.confidenceMedium", className: "bg-info/15 text-info" },
  high: { label: "forecast.confidenceHigh", className: "bg-success/15 text-success" },
};

const TREND: Record<ForecastTrend, { icon: typeof ArrowUp; label: MessageKey; className: string }> = {
  up: { icon: ArrowUp, label: "forecast.trendUp", className: "text-destructive" },
  down: { icon: ArrowDown, label: "forecast.trendDown", className: "text-info" },
  flat: { icon: ArrowRight, label: "forecast.trendFlat", className: "text-muted-foreground" },
};

function actionKey(p: ProductForecast): MessageKey {
  if (p.status === "critical") {
    if (p.trend === "up") return "forecast.actionUrgentRising";
    return p.stock <= 0 ? "forecast.actionOutOfStock" : "forecast.actionReorderNow";
  }
  if (p.status === "warning") return "forecast.actionPlanReorder";
  return p.trend === "down" && p.suggestedOrder === 0
    ? "forecast.actionOverstocked"
    : "forecast.actionSufficient";
}

const HEAD = "uppercase tracking-wider";

export default async function DemandForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string; status?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);
  const params = await searchParams;
  const horizon = HORIZONS.find((h) => String(h) === params.horizon) ?? DEFAULT_HORIZON;
  const status = STATUSES.find((s) => s === params.status) ?? null;
  const page = parsePage(params.page);
  const today = todayInTimezone(pharmacy.timezone);

  const [forecasts, [{ activeProducts }]] = await Promise.all([
    // The branch being worked in: its sales and its stock.
    getDemandForecast(db, branchScope(branch), pharmacy.timezone, today, horizon),
    db
      .select({ activeProducts: count() })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true))),
  ]);

  const counts = { critical: 0, warning: 0, healthy: 0 };
  for (const p of forecasts) counts[p.status]++;
  const shown = status ? forecasts.filter((p) => p.status === status) : forecasts;
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const notForecast = Math.max(0, activeProducts - forecasts.length);

  // Status cards filter the list; clicking the active one shows everything again.
  const cardHref = (target: ForecastStatus) => {
    const query = new URLSearchParams();
    if (horizon !== DEFAULT_HORIZON) query.set("horizon", String(horizon));
    if (status !== target) query.set("status", target);
    const qs = query.toString();
    return qs ? `/ai/forecast?${qs}` : "/ai/forecast";
  };
  const cardLabel: Record<ForecastStatus, string> = {
    critical: t("forecast.critical", { days: CRITICAL_DAYS }),
    warning: t("forecast.warning", { from: CRITICAL_DAYS, to: WARNING_DAYS }),
    healthy: t("forecast.healthy", { days: WARNING_DAYS }),
  };

  return (
    <>
      <PageHeader
        title={t("forecast.title")}
        description={t("forecast.description", { days: HISTORY_DAYS, branch: branch.name })}
      >
        <FilterSelect
          param="horizon"
          aria-label={t("forecast.horizon")}
          options={HORIZONS.map((h) => ({
            value: h === DEFAULT_HORIZON ? "" : String(h),
            label: t("forecast.horizonOption", { days: h }),
          }))}
        />
        <RefreshButton label={t("forecast.refresh")} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={cardHref(s)}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-xl border p-5 transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              STATUS_CARD[s],
              status === s && "ring-2 ring-current",
            )}
          >
            <p className="text-3xl font-semibold tabular-nums">{f.number(counts[s])}</p>
            <p className="mt-1 text-sm">{cardLabel[s]}</p>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ChartSpline}
          title={status ? t("forecast.emptyFiltered") : t("forecast.empty")}
          hint={status ? undefined : t("forecast.emptyHint", { days: HISTORY_DAYS })}
        >
          {status && (
            <Link href={cardHref(status)} className="text-sm text-primary hover:underline">
              {t("forecast.showAll")}
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH className={HEAD}>{t("forecast.product")}</TH>
                <TH className={HEAD}>{t("forecast.barcode")}</TH>
                <TH className={cn(HEAD, "text-right")}>{t("forecast.currentStock")}</TH>
                <TH className={cn(HEAD, "text-right")}>{t("forecast.dailyDemand")}</TH>
                <TH className={cn(HEAD, "text-center")}>{t("forecast.daysToStockout")}</TH>
                <TH className={cn(HEAD, "text-center")}>{t("forecast.trend")}</TH>
                <TH className={HEAD}>{t("forecast.suggestedAction")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const trend = TREND[p.trend];
                const TrendIcon = trend.icon;
                const confidence = CONFIDENCE[p.confidence];
                return (
                  <TR
                    key={p.id}
                    className={cn(
                      p.status === "critical" && "bg-destructive/5",
                      p.status === "warning" && "bg-warning/5",
                    )}
                  >
                    <TD>
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          title={t("forecast.confidenceHint")}
                          className={cn("rounded-full px-2 py-0.5 font-medium", confidence.className)}
                        >
                          {t(confidence.label)}
                        </span>
                        ·{" "}
                        {t("forecast.projected", {
                          count: f.number(Math.round(p.projected)),
                          days: horizon,
                        })}
                      </p>
                    </TD>
                    <TD className="font-mono text-xs text-muted-foreground">
                      {p.barcode ?? "—"}
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">{f.number(p.stock)}</TD>
                    <TD className="text-right whitespace-nowrap tabular-nums">
                      {t("forecast.perDay", { value: f.number(round2(p.dailyDemand)) })}
                    </TD>
                    <TD className="text-center">
                      {p.daysToStockout === null ? (
                        <span className="text-muted-foreground" title={t("forecast.noStockout")}>
                          —
                        </span>
                      ) : (
                        <Badge tone={STATUS_TONE[p.status]} className="gap-1 tabular-nums">
                          {p.status === "critical" && <TriangleAlert className="size-3" />}
                          {p.daysToStockout > MAX_DAYS_SHOWN
                            ? t("forecast.days", { days: `${MAX_DAYS_SHOWN}+` })
                            : t("forecast.days", { days: f.number(p.daysToStockout) })}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-center">
                      <TrendIcon
                        className={cn("mx-auto size-5", trend.className)}
                        aria-label={t(trend.label)}
                      >
                        <title>{t(trend.label)}</title>
                      </TrendIcon>
                    </TD>
                    <TD>
                      <p>{t(actionKey(p))}</p>
                      {p.status !== "healthy" && p.suggestedOrder > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("forecast.orderAbout", {
                            qty: f.number(p.suggestedOrder),
                            unit: p.unit,
                          })}
                        </p>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(shown.length)} />
        </>
      )}

      {notForecast > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("forecast.notShown", { count: f.number(notForecast), days: HISTORY_DAYS })}
        </p>
      )}
    </>
  );
}
