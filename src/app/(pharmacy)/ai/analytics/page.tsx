import {
  ArrowRight,
  Bot,
  Camera,
  ChartSpline,
  Clock,
  Pill,
  PowerOff,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import type { MessageKey, Translate } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { getAiSettings } from "@/lib/ai-settings";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { addDays, todayInTimezone } from "@/lib/dates";
import { HISTORY_DAYS, getDemandForecast, type ForecastStatus } from "@/lib/forecast";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { getBatchesExpiringBetween } from "@/lib/reports";
import { cn, round2 } from "@/lib/utils";
import { expiryRisk, type ExpiryAdvice } from "./expiry";
import { RunLink } from "./run-link";

export const generateMetadata = pageTitle("nav.aiAnalytics");

const TABS = ["predictions", "expiry"] as const;
type Tab = (typeof TABS)[number];

const TAB: Record<Tab, { label: MessageKey; icon: LucideIcon }> = {
  predictions: { label: "aiAnalytics.tabPredictions", icon: ChartSpline },
  expiry: { label: "aiAnalytics.tabExpiry", icon: Clock },
};

// Days of demand the predictions plan for.
const HORIZON = 30;
// Recommendations listed on the predictions tab.
const MAX_RECOMMENDATIONS = 10;
// Batches listed on the expiry tab.
const MAX_BATCHES = 50;
const SOON_DAYS = 30;

type Format = Awaited<ReturnType<typeof getFormat>>;

const STATUS: Record<ForecastStatus, { label: MessageKey; tone: "danger" | "warning" | "success" }> = {
  critical: { label: "aiAnalytics.statusCritical", tone: "danger" },
  warning: { label: "aiAnalytics.statusWarning", tone: "warning" },
  healthy: { label: "aiAnalytics.statusHealthy", tone: "success" },
};

const ADVICE: Record<ExpiryAdvice, { label: MessageKey; tone: "danger" | "warning" | "success" }> = {
  remove: { label: "aiAnalytics.adviceRemove", tone: "danger" },
  noDemand: { label: "aiAnalytics.adviceNoDemand", tone: "danger" },
  atRisk: { label: "aiAnalytics.adviceAtRisk", tone: "warning" },
  sellFirst: { label: "aiAnalytics.adviceSellFirst", tone: "success" },
};

const FEATURES: {
  title: MessageKey;
  description: MessageKey;
  icon: LucideIcon;
  iconClass: string;
  /** The tab that runs it; features without one are not built yet. */
  tab?: Tab;
}[] = [
  { title: "aiAnalytics.fInteractions", description: "aiAnalytics.fInteractionsHint", icon: TriangleAlert, iconClass: "text-destructive" },
  { title: "aiAnalytics.fSearch", description: "aiAnalytics.fSearchHint", icon: Search, iconClass: "text-info" },
  { title: "aiAnalytics.fPrescription", description: "aiAnalytics.fPrescriptionHint", icon: Camera, iconClass: "text-chart-3" },
  { title: "aiAnalytics.fSubstitution", description: "aiAnalytics.fSubstitutionHint", icon: Pill, iconClass: "text-success" },
  { title: "aiAnalytics.fPredictions", description: "aiAnalytics.fPredictionsHint", icon: ChartSpline, iconClass: "text-success", tab: "predictions" },
  { title: "aiAnalytics.fExpiry", description: "aiAnalytics.fExpiryHint", icon: Clock, iconClass: "text-warning", tab: "expiry" },
  { title: "aiAnalytics.fMore", description: "aiAnalytics.fMoreHint", icon: Sparkles, iconClass: "text-chart-3" },
];

export default async function AiAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; run?: string }>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  const [t, f, params, db] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    searchParams,
    getDb(),
  ]);
  // Admins can turn each analysis off in the AI settings.
  const settings = await getAiSettings(db, pharmacy.id);
  const enabled: Record<Tab, boolean> = {
    predictions: settings.predictionsEnabled,
    expiry: settings.expiryEnabled,
  };
  const tabs = TABS.filter((id) => enabled[id]);
  const tab = tabs.find((x) => x === params.tab) ?? tabs[0] ?? null;
  const ctx = { t, f, pharmacy, branch };

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-chart-3/15 text-chart-3">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("aiAnalytics.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("aiAnalytics.subtitle")}</p>
        </div>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("aiAnalytics.title")}>
        {tabs.map((id) => {
          const { label, icon: Icon } = TAB[id];
          const active = id === tab;
          return (
            <Link
              key={id}
              href={`/ai/analytics?tab=${id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-chart-3 text-chart-3"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(label)}
            </Link>
          );
        })}
      </nav>

      {tab === null ? (
        <EmptyState
          icon={PowerOff}
          title={t("aiAnalytics.allOff")}
          hint={t(canSwitchBranch(user) ? "aiAnalytics.allOffAdmin" : "aiAnalytics.allOffStaff")}
        >
          {canSwitchBranch(user) && (
            <Link href="/ai/settings" className={buttonClass({ variant: "outline" })}>
              <Settings2 />
              {t("nav.aiConfig")}
            </Link>
          )}
        </EmptyState>
      ) : tab === "predictions" ? (
        params.run ? (
          <Predictions {...ctx} />
        ) : (
          <Card>
            <SectionHeading
              icon={ChartSpline}
              title={t("aiAnalytics.predictionsTitle")}
              hint={t("aiAnalytics.predictionsHint", { days: HISTORY_DAYS })}
            />
            <CardContent>
              <div className="flex flex-col items-center rounded-xl border border-border bg-muted/30 px-6 py-14 text-center">
                <ChartSpline className="size-12 text-muted-foreground/60" />
                <h3 className="mt-4 text-lg font-semibold">{t("aiAnalytics.runTitle")}</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("aiAnalytics.runHint")}</p>
                <RunLink href="/ai/analytics?tab=predictions&run=1" label={t("aiAnalytics.run")} />
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <Expiry {...ctx} />
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("aiAnalytics.featuresTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const on = feature.tab ? enabled[feature.tab] : false;
              const body = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className={cn("size-4 shrink-0", feature.iconClass)} />
                      {t(feature.title)}
                    </p>
                    {feature.tab ? (
                      on ? (
                        <Badge tone="success">{t("aiAnalytics.available")}</Badge>
                      ) : (
                        <Badge tone="muted">{t("aiAnalytics.turnedOff")}</Badge>
                      )
                    ) : (
                      feature.title !== "aiAnalytics.fMore" && (
                        <Badge tone="muted">{t("modules.comingSoon")}</Badge>
                      )
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t(feature.description)}</p>
                </>
              );
              const className = "rounded-lg border border-border p-4";
              return feature.tab && on ? (
                <Link
                  key={feature.title}
                  href={`/ai/analytics?tab=${feature.tab}`}
                  className={cn(
                    className,
                    "transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div key={feature.title} className={className}>
                  {body}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

type Ctx = {
  t: Translate;
  f: Format;
  pharmacy: Awaited<ReturnType<typeof requirePharmacy>>["pharmacy"];
  branch: Awaited<ReturnType<typeof requirePharmacy>>["branch"];
};

/** Demand forecast for the branch, reduced to what to reorder and what it costs. */
async function Predictions({ t, f, pharmacy, branch }: Ctx) {
  const db = await getDb();
  const today = todayInTimezone(pharmacy.timezone);
  const forecasts = await getDemandForecast(db, branchScope(branch), pharmacy.timezone, today, HORIZON);

  const reorder = forecasts.filter((p) => p.suggestedOrder > 0);
  const cost = round2(reorder.reduce((sum, p) => sum + p.suggestedOrder * p.costPrice, 0));
  const count = (status: ForecastStatus) => forecasts.filter((p) => p.status === status).length;
  const rising = forecasts.filter((p) => p.trend === "up").length;

  return (
    <Card>
      <SectionHeading
        icon={ChartSpline}
        title={t("aiAnalytics.predictionsTitle")}
        hint={t("aiAnalytics.resultHint", { days: HISTORY_DAYS, branch: branch.name, horizon: HORIZON })}
      >
        <RefreshButton label={t("aiAnalytics.runAgain")} />
      </SectionHeading>
      <CardContent>
        {forecasts.length === 0 ? (
          <Empty>{t("aiAnalytics.noForecast", { days: HISTORY_DAYS })}</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label={t("aiAnalytics.analysed")} value={f.number(forecasts.length)} hint={t("aiAnalytics.rising", { count: f.number(rising) })} />
              <Tile label={t("aiAnalytics.reorderNow")} value={f.number(count("critical"))} tone={count("critical") > 0 ? "danger" : undefined} />
              <Tile label={t("aiAnalytics.reorderSoon")} value={f.number(count("warning"))} tone={count("warning") > 0 ? "warning" : undefined} />
              <Tile label={t("aiAnalytics.reorderCost")} value={f.money(cost)} hint={t("aiAnalytics.reorderCostHint", { count: f.number(reorder.length) })} />
            </div>

            <h3 className="mt-6 mb-3 font-semibold">{t("aiAnalytics.recommendations")}</h3>
            {reorder.length === 0 ? (
              <Empty>{t("aiAnalytics.noReorder", { days: HORIZON })}</Empty>
            ) : (
              <Table>
                <THead>
                  <tr className="uppercase">
                    <TH>{t("aiAnalytics.product")}</TH>
                    <TH className="text-right">{t("aiAnalytics.stock")}</TH>
                    <TH className="text-right">{t("aiAnalytics.dailyDemand")}</TH>
                    <TH className="text-right">{t("aiAnalytics.daysLeft")}</TH>
                    <TH className="text-right">{t("aiAnalytics.orderQty")}</TH>
                    <TH className="text-right">{t("aiAnalytics.estCost")}</TH>
                    <TH>{t("aiAnalytics.status")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {reorder.slice(0, MAX_RECOMMENDATIONS).map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.name}</TD>
                      <TD className="text-right tabular-nums">{f.number(p.stock)} {p.unit}</TD>
                      <TD className="text-right tabular-nums">{f.number(round2(p.dailyDemand))}</TD>
                      <TD className="text-right tabular-nums">
                        {p.daysToStockout === null ? "—" : f.number(p.daysToStockout)}
                      </TD>
                      <TD className="text-right font-semibold tabular-nums">
                        {f.number(p.suggestedOrder)} {p.unit}
                      </TD>
                      <TD className="text-right tabular-nums">{f.money(round2(p.suggestedOrder * p.costPrice))}</TD>
                      <TD>
                        <Badge tone={STATUS[p.status].tone}>{t(STATUS[p.status].label)}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <Link
              href="/ai/forecast"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("aiAnalytics.openForecast")}
              <ArrowRight className="size-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Batches that have expired or will soon, with whether they will sell in time. */
async function Expiry({ t, f, pharmacy, branch }: Ctx) {
  const db = await getDb();
  const today = todayInTimezone(pharmacy.timezone);
  const scope = branchScope(branch);
  const alertDays = pharmacy.expiryAlertDays;
  const [batches, forecasts] = await Promise.all([
    // Expired ones too (no start day), up to the end of the alert window.
    getBatchesExpiringBetween(db, scope, null, addDays(today, alertDays)),
    getDemandForecast(db, scope, pharmacy.timezone, today, HORIZON),
  ]);
  const demand = new Map(forecasts.map((p) => [p.id, p.dailyDemand]));
  const rows = expiryRisk(batches, (id) => demand.get(id) ?? 0, today);

  const sum = (list: typeof rows, units: (r: (typeof rows)[number]) => number) => ({
    count: list.length,
    value: round2(list.reduce((s, r) => s + units(r) * r.costPrice, 0)),
  });
  const expired = sum(rows.filter((r) => r.daysLeft < 0), (r) => r.quantity);
  const soon = sum(rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= SOON_DAYS), (r) => r.quantity);
  const inWindow = sum(rows.filter((r) => r.daysLeft >= 0), (r) => r.quantity);
  const risky = rows.filter((r) => r.daysLeft >= 0 && r.unsold > 0);
  const atRisk = sum(risky, (r) => r.unsold);
  const atRiskUnits = risky.reduce((s, r) => s + r.unsold, 0);

  return (
    <Card>
      <SectionHeading
        icon={Clock}
        title={t("aiAnalytics.expiryTitle")}
        hint={t("aiAnalytics.expiryHint", { branch: branch.name })}
      />
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label={t("aiAnalytics.expired")}
            value={f.number(expired.count)}
            hint={t("aiAnalytics.atCost", { amount: f.money(expired.value) })}
            tone={expired.count > 0 ? "danger" : undefined}
          />
          <Tile
            label={t("aiAnalytics.expiringWithin", { days: SOON_DAYS })}
            value={f.number(soon.count)}
            hint={t("aiAnalytics.atCost", { amount: f.money(soon.value) })}
            tone={soon.count > 0 ? "warning" : undefined}
          />
          <Tile
            label={t("aiAnalytics.expiringWithin", { days: alertDays })}
            value={f.number(inWindow.count)}
            hint={t("aiAnalytics.atCost", { amount: f.money(inWindow.value) })}
          />
          <Tile
            label={t("aiAnalytics.atRisk")}
            value={f.number(atRiskUnits)}
            hint={t("aiAnalytics.atCost", { amount: f.money(atRisk.value) })}
            tone={atRiskUnits > 0 ? "warning" : undefined}
          />
        </div>

        <h3 className="mt-6 mb-3 font-semibold">{t("aiAnalytics.batches")}</h3>
        {rows.length === 0 ? (
          <Empty>{t("aiAnalytics.noExpiring", { days: alertDays })}</Empty>
        ) : (
          <Table>
            <THead>
              <tr className="uppercase">
                <TH>{t("aiAnalytics.product")}</TH>
                <TH>{t("aiAnalytics.batch")}</TH>
                <TH>{t("aiAnalytics.expiry")}</TH>
                <TH className="text-right">{t("aiAnalytics.quantity")}</TH>
                <TH className="text-right">{t("aiAnalytics.value")}</TH>
                <TH>{t("aiAnalytics.recommendation")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.slice(0, MAX_BATCHES).map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.productName}</TD>
                  <TD className="text-muted-foreground">{r.batchNumber ?? "—"}</TD>
                  <TD className="whitespace-nowrap">
                    {r.expiryDate ? f.day(r.expiryDate) : "—"}
                    <span
                      className={cn(
                        "block text-xs",
                        r.daysLeft < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {r.daysLeft < 0
                        ? t("aiAnalytics.expiredAgo", { days: f.number(-r.daysLeft) })
                        : t("aiAnalytics.daysToGo", { days: f.number(r.daysLeft) })}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{f.number(r.quantity)} {r.unit}</TD>
                  <TD className="text-right tabular-nums">{f.money(round2(r.quantity * r.costPrice))}</TD>
                  <TD>
                    <Badge tone={ADVICE[r.advice].tone}>{t(ADVICE[r.advice].label)}</Badge>
                    {r.advice === "atRisk" && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t("aiAnalytics.unsold", { count: f.number(r.unsold), unit: r.unit })}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {rows.length > MAX_BATCHES && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("aiAnalytics.moreBatches", { count: f.number(rows.length - MAX_BATCHES) })}
          </p>
        )}
        <Link
          href="/inventory/alerts"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t("aiAnalytics.openAlerts")}
          <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex-wrap items-start">
      <div className="min-w-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="size-5 shrink-0 text-info" />
          {title}
        </CardTitle>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </CardHeader>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-4",
        tone === "warning" && "border-warning/40 bg-warning/5",
        tone === "danger" && "border-destructive/40 bg-destructive/5",
        !tone && "border-border",
      )}
    >
      <p
        className={cn(
          "truncate text-xs",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
          !tone && "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-2xl font-bold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
