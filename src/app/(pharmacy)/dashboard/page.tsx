import { and, eq } from "drizzle-orm";
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ClipboardList,
  Clock,
  CreditCard,
  Landmark,
  PackageMinus,
  Pill,
  Receipt,
  Settings,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  UserPlus,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { DonutChart, type Segment } from "@/components/charts/donut-chart";
import { HourlySalesChart } from "@/components/charts/hourly-sales-chart";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { RefreshButton } from "@/components/refresh-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterSelect } from "@/components/ui/list-controls";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { stockTransfers } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { switchBranchHref } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { addDays, todayInTimezone, zonedDayStart, zonedRange } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import {
  countActiveProducts,
  getBatchesExpiringBetween,
  getCustomerCounts,
  getDailySales,
  getHourlySales,
  getLowStockProducts,
  getOpenPurchases,
  getPaymentBreakdown,
  getRecentSales,
  getRevenue,
  getSalesByBranch,
  getSalesSummary,
  getStockByBranch,
  getStockSummary,
  getTopProducts,
} from "@/lib/reports";
import { REPORT_BRANCH_PARAM, resolveReportScope } from "@/lib/report-scope";
import { now } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LiveClock } from "./live-clock";

export const generateMetadata = pageTitle("dashboard.title");

const LIST_SIZE = 8;
const TOP_SIZE = 5;
// Line items named on a recent sale before "+N more".
const ITEMS_SHOWN = 4;

type Tone = "default" | "success" | "warning" | "danger" | "info";

const ICON_TONE: Record<Tone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
};

const METHODS = [
  { method: "cash", label: "reports.methodCash", color: "var(--chart-1)" },
  { method: "card", label: "reports.methodCard", color: "var(--chart-2)" },
  { method: "transfer", label: "reports.methodTransfer", color: "var(--chart-3)" },
] as const satisfies readonly { method: string; label: MessageKey; color: string }[];

const SHORTCUTS: { href: string; label: MessageKey; icon: LucideIcon; tone: string }[] = [
  { href: "/pos", label: "nav.pos", icon: ShoppingCart, tone: "text-primary" },
  { href: "/sales", label: "nav.sales", icon: Receipt, tone: "text-success" },
  { href: "/customers", label: "nav.customers", icon: Users, tone: "text-info" },
  { href: "/products", label: "nav.products", icon: Pill, tone: "text-chart-3" },
  { href: "/inventory", label: "nav.inventory", icon: Boxes, tone: "text-warning" },
  { href: "/purchases", label: "nav.purchases", icon: ClipboardList, tone: "text-chart-2" },
  { href: "/suppliers", label: "nav.suppliers", icon: Truck, tone: "text-destructive" },
  { href: "/reports", label: "nav.reports", icon: ChartColumn, tone: "text-primary" },
  { href: "/subscription", label: "nav.subscription", icon: CreditCard, tone: "text-info" },
  { href: "/settings", label: "nav.settings", icon: Settings, tone: "text-muted-foreground" },
];

/** Percentage change from `previous` to `current`; null when there is nothing to compare with. */
function change(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function percentOf(part: number, whole: number): string {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : "0.0";
}

function ChangeBadge({ value, onPrimary }: { value: number; onPrimary?: boolean }) {
  const up = value >= 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        onPrimary
          ? "bg-primary-foreground/15 text-primary-foreground"
          : up
            ? "bg-success/15 text-success"
            : "bg-destructive/15 text-destructive",
      )}
    >
      <Arrow className="size-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-3 border-l-2 border-primary pl-2 text-xs font-semibold tracking-wider text-primary uppercase">
      {children}
    </h2>
  );
}

/** A KPI inside the header. */
function HeroStat({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card/70 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" />
        {label}
      </p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

/** A small figure in the business snapshot. */
function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5 shrink-0", ICON_TONE[tone])} />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          "mt-1 truncate text-xl font-semibold tabular-nums",
          tone !== "default" && ICON_TONE[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const className = "block min-w-0 rounded-xl border border-border bg-card p-4";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A headline figure on a filled primary card. */
function ValueCard({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground shadow-xs">
      <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-primary-foreground/10" />
      <p className="relative flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-4" />
        {label}
      </p>
      <p className="relative mt-2 truncate text-2xl font-bold tabular-nums">{value}</p>
      <div className="relative mt-2 flex flex-wrap items-center gap-1.5 text-xs opacity-85">
        {children}
      </div>
    </div>
  );
}

function StockChip({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: string;
  tone: "warning" | "danger" | null;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
        tone === "danger" && "border-destructive/40 bg-destructive/10 hover:bg-destructive/15",
        tone === "warning" && "border-warning/40 bg-warning/10 hover:bg-warning/15",
        !tone && "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function CardHeading({
  title,
  hint,
  href,
  linkLabel,
}: {
  title: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <CardHeader className="items-start">
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      )}
    </CardHeader>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);
  // One branch, or (for admins) every branch of the pharmacy.
  const view = resolveReportScope(params.branch, { user, branch, branches }, t);
  const { scope } = view;
  const allBranches = scope.branchId === null;

  const tz = pharmacy.timezone;
  const current = now();
  const today = todayInTimezone(tz);
  const yesterday = addDays(today, -1);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;
  // The same number of days into last month, cut short for shorter months.
  const lastMonthSameDay = [
    addDays(lastMonthStart, Number(today.slice(8)) - 1),
    lastMonthEnd,
  ].sort()[0];

  const todayStart = zonedDayStart(today, tz);
  const yesterdayStart = zonedDayStart(yesterday, tz);
  const todayRange = zonedRange(today, today, tz);
  const monthRange = zonedRange(monthStart, today, tz);
  const sameTimeYesterday = {
    start: yesterdayStart,
    end: new Date(yesterdayStart.getTime() + (current.getTime() - todayStart.getTime())),
  };

  const [
    todaySales,
    monthSales,
    yesterdayTotals,
    yesterdaySoFar,
    lastMonthSoFar,
    yearTotals,
    weekTotals,
    daily,
    hourly,
    methods,
    stock,
    lowStock,
    expiring,
    recent,
    top,
    customerCounts,
    openPurchases,
    activeProducts,
    incomingTransfers,
    salesByBranch,
    stockByBranch,
  ] = await Promise.all([
    getSalesSummary(db, scope, todayRange),
    getSalesSummary(db, scope, monthRange),
    getRevenue(db, scope, zonedRange(yesterday, yesterday, tz)),
    getRevenue(db, scope, sameTimeYesterday),
    getRevenue(db, scope, zonedRange(lastMonthStart, lastMonthSameDay, tz)),
    getRevenue(db, scope, zonedRange(yearStart, today, tz)),
    getRevenue(db, scope, zonedRange(addDays(today, -6), today, tz)),
    getDailySales(db, scope, addDays(today, -13), today, tz),
    getHourlySales(db, scope, todayRange, tz),
    getPaymentBreakdown(db, scope, todayRange),
    getStockSummary(db, scope, today, pharmacy.expiryAlertDays),
    getLowStockProducts(db, scope, today),
    getBatchesExpiringBetween(
      db,
      scope,
      null,
      addDays(today, pharmacy.expiryAlertDays),
      LIST_SIZE,
    ),
    getRecentSales(db, scope, LIST_SIZE),
    getTopProducts(db, scope, zonedRange(addDays(today, -6), today, tz), TOP_SIZE),
    getCustomerCounts(db, pharmacy.id, zonedDayStart(monthStart, tz)),
    getOpenPurchases(db, scope),
    countActiveProducts(db, pharmacy.id),
    db.$count(
      stockTransfers,
      and(
        eq(stockTransfers.pharmacyId, pharmacy.id),
        eq(stockTransfers.status, "in_transit"),
        scope.branchId ? eq(stockTransfers.toBranchId, scope.branchId) : undefined,
      ),
    ),
    allBranches ? getSalesByBranch(db, pharmacy.id, monthRange) : null,
    allBranches ? getStockByBranch(db, pharmacy.id, today) : null,
  ]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const todayChange = change(todaySales.revenue, yesterdaySoFar.revenue);
  const monthChange = change(monthSales.revenue, lastMonthSoFar.revenue);
  const outOfStock = lowStock.filter((product) => product.quantity <= 0).length;
  const paymentSegments: Segment[] = METHODS.map(({ method, label, color }) => {
    const value = methods.find((row) => row.method === method)?.revenue ?? 0;
    return { key: method, label: t(label), value, display: f.money(value), color };
  });

  return (
    <>
      <section className="rounded-2xl border border-primary/25 bg-linear-to-br from-primary/20 via-accent to-card p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">
              {t("dashboard.title")}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {pharmacy.name}
            </h1>
            {view.options && (
              <p className="mt-0.5 text-sm font-medium">
                {view.branch ? view.branch.name : t("branches.allBranches")}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.welcome", { name: user.name })}
              <span className="mx-2">·</span>
              <LiveClock initial={current.toISOString()} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view.options && (
              <FilterSelect
                param={REPORT_BRANCH_PARAM}
                options={view.options}
                aria-label={t("branches.current")}
              />
            )}
            <RefreshButton />
            <Link href="/pos" className={buttonClass()}>
              <ShoppingCart />
              {t("dashboard.newSale")}
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroStat icon={Banknote} label={t("dashboard.today")} value={f.money(todaySales.revenue)}>
            {todayChange === null ? (
              t("dashboard.noYesterdayComparison")
            ) : (
              <>
                <ChangeBadge value={todayChange} />
                {t("dashboard.vsSameTimeYesterday")}
              </>
            )}
          </HeroStat>
          <HeroStat
            icon={Receipt}
            label={t("dashboard.transactions")}
            value={f.number(todaySales.count)}
          >
            {t("dashboard.unitsSold", { count: f.number(todaySales.units) })}
          </HeroStat>
          <HeroStat
            icon={TrendingUp}
            label={t("dashboard.grossProfit")}
            value={f.money(todaySales.profit)}
          >
            {t("dashboard.margin", { percent: percentOf(todaySales.profit, todaySales.net) })}
          </HeroStat>
          <HeroStat
            icon={ShoppingCart}
            label={t("dashboard.averageSale")}
            value={f.money(todaySales.average)}
          >
            {t("dashboard.customersToday", { count: f.number(todaySales.customers) })}
          </HeroStat>
        </div>
      </section>

      {(stock.expired > 0 || outOfStock > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4">
          <TriangleAlert className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-warning">{t("dashboard.attentionTitle")}</p>
            <ul className="text-sm text-muted-foreground">
              {stock.expired > 0 && (
                <li>
                  {t("dashboard.attentionExpired", {
                    count: f.number(stock.expired),
                    value: f.money(stock.expiredValue),
                  })}
                </li>
              )}
              {outOfStock > 0 && (
                <li>{t("dashboard.attentionOut", { count: f.number(outOfStock) })}</li>
              )}
            </ul>
          </div>
          <Link
            href={stock.expired > 0 ? "/inventory?filter=expired" : "/inventory?filter=low"}
            className={buttonClass({ variant: "outline" })}
          >
            {t("dashboard.attentionAction")}
          </Link>
        </div>
      )}

      {incomingTransfers > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-info/40 bg-info/10 p-4">
          <Truck className="size-5 shrink-0 text-info" />
          <p className="min-w-0 flex-1 text-sm font-medium">
            {incomingTransfers === 1
              ? t("transfers.awaitingOne")
              : t("transfers.awaiting", { count: f.number(incomingTransfers) })}
          </p>
          <Link
            href={
              allBranches
                ? "/transfers?scope=all&status=in_transit"
                : "/transfers?dir=in&status=in_transit"
            }
            className={buttonClass({ variant: "outline" })}
          >
            {t("transfers.viewTransfers")}
          </Link>
        </div>
      )}

      {salesByBranch && stockByBranch && (
        <>
          <SectionTitle>{t("dashboard.byBranchTitle")}</SectionTitle>
          <Table>
            <THead>
              <tr>
                <TH>{t("branches.current")}</TH>
                <TH className="text-right">{t("dashboard.byBranchRevenue")}</TH>
                <TH className="text-right">{t("dashboard.byBranchSales")}</TH>
                <TH className="text-right">{t("dashboard.byBranchProfit")}</TH>
                <TH className="text-right">{t("dashboard.byBranchStock")}</TH>
                <TH className="text-right">{t("dashboard.byBranchExpired")}</TH>
              </tr>
            </THead>
            <TBody>
              {branches.map((b) => {
                const sold = salesByBranch.get(b.id);
                const held = stockByBranch.get(b.id);
                return (
                  <TR key={b.id}>
                    <TD className="font-medium">
                      <Link
                        href={`/dashboard?${REPORT_BRANCH_PARAM}=${b.id}`}
                        className="hover:underline"
                      >
                        {b.name}
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{f.money(sold?.revenue ?? 0)}</TD>
                    <TD className="text-right tabular-nums">{f.number(sold?.count ?? 0)}</TD>
                    <TD className="text-right tabular-nums">{f.money(sold?.profit ?? 0)}</TD>
                    <TD className="text-right tabular-nums">{f.money(held?.value ?? 0)}</TD>
                    <TD className="text-right tabular-nums">
                      {held?.expired ? (
                        <Badge tone="danger">{f.number(held.expired)}</Badge>
                      ) : (
                        f.number(0)
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}

      <SectionTitle>{t("dashboard.snapshotTitle")}</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Clock}
          label={t("dashboard.yesterday")}
          value={f.money(yesterdayTotals.revenue)}
          hint={t("dashboard.yesterdayHint", { count: f.number(yesterdayTotals.count) })}
        />
        <Tile
          icon={Landmark}
          label={t("dashboard.taxMonth")}
          value={f.money(monthSales.tax)}
          hint={t("dashboard.taxMonthHint")}
          tone="warning"
        />
        <Tile
          icon={TrendingUp}
          label={t("dashboard.profitMonth")}
          value={f.money(monthSales.profit)}
          hint={t("dashboard.margin", { percent: percentOf(monthSales.profit, monthSales.net) })}
          tone="success"
          href={`/reports?from=${monthStart}&to=${today}`}
        />
        <Tile
          icon={Undo2}
          label={t("dashboard.refundsMonth")}
          value={f.money(monthSales.refundedTotal)}
          hint={t("dashboard.refundsMonthHint", { count: f.number(monthSales.refundedCount) })}
          tone={monthSales.refundedCount > 0 ? "danger" : "default"}
          href={`/sales?status=refunded&from=${monthStart}&to=${today}`}
        />
        <Tile
          icon={Users}
          label={t("dashboard.customers")}
          value={f.number(customerCounts.total)}
          hint={t("dashboard.customersHint")}
          tone="info"
          href="/customers"
        />
        <Tile
          icon={UserPlus}
          label={t("dashboard.newCustomers")}
          value={f.number(customerCounts.added)}
          hint={t("dashboard.newCustomersHint")}
          tone="info"
        />
        <Tile
          icon={ClipboardList}
          label={t("dashboard.openPurchases")}
          value={f.number(openPurchases.count)}
          hint={t("dashboard.openPurchasesHint", { amount: f.money(openPurchases.value) })}
          tone={openPurchases.count > 0 ? "warning" : "default"}
          href="/purchases?status=ordered"
        />
        <Tile
          icon={Pill}
          label={t("dashboard.activeProducts")}
          value={f.number(activeProducts)}
          hint={t("dashboard.activeProductsHint", { count: f.number(stock.units) })}
          href="/products"
        />
      </div>

      <SectionTitle>{t("dashboard.revenueTitle")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ValueCard
          icon={CalendarRange}
          label={t("dashboard.yearToDate")}
          value={f.money(yearTotals.revenue)}
        >
          {t("dashboard.yearToDateHint", { date: f.day(yearStart) })}
        </ValueCard>
        <ValueCard
          icon={CalendarDays}
          label={t("dashboard.thisMonth")}
          value={f.money(monthSales.revenue)}
        >
          {monthChange === null ? (
            t("dashboard.monthHint", { count: f.number(monthSales.count) })
          ) : (
            <>
              <ChangeBadge value={monthChange} onPrimary />
              {t("dashboard.vsLastMonth")}
            </>
          )}
        </ValueCard>
        <ValueCard
          icon={CalendarClock}
          label={t("dashboard.last7Days")}
          value={f.money(weekTotals.revenue)}
        >
          {t("dashboard.last7DaysHint", { count: f.number(weekTotals.count) })}
        </ValueCard>
        <ValueCard
          icon={Warehouse}
          label={t("dashboard.stockRetailValue")}
          value={f.money(stock.retailValue)}
        >
          {t("dashboard.stockRetailValueHint", { amount: f.money(stock.value) })}
        </ValueCard>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StockChip
          href="/inventory?filter=low"
          label={t("dashboard.lowStock")}
          count={f.number(lowStock.length)}
          tone={lowStock.length > 0 ? "danger" : null}
        />
        <StockChip
          href="/inventory?filter=expiring"
          label={t("dashboard.expiringWithin", { days: pharmacy.expiryAlertDays })}
          count={f.number(stock.expiringSoon)}
          tone={stock.expiringSoon > 0 ? "warning" : null}
        />
        <StockChip
          href="/inventory?filter=expired"
          label={t("dashboard.expiredBatches")}
          count={f.number(stock.expired)}
          tone={stock.expired > 0 ? "danger" : null}
        />
      </div>

      <div className="mt-4 grid gap-4 *:min-w-0 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeading
            title={t("dashboard.salesChartTitle")}
            hint={t("dashboard.salesChartHint")}
            href="/reports"
            linkLabel={t("dashboard.fullReports")}
          />
          <CardContent>
            <SalesTrendChart
              data={daily}
              revenueLabel={t("dashboard.revenue")}
              countLabel={t("dashboard.salesCount")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeading title={t("dashboard.paymentTitle")} hint={t("dashboard.paymentHint")} />
          <CardContent>
            <DonutChart
              segments={paymentSegments}
              centerValue={f.money(todaySales.revenue)}
              centerLabel={t("dashboard.today")}
              emptyLabel={t("dashboard.paymentEmpty")}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeading
          title={t("dashboard.hourlyTitle")}
          hint={t("dashboard.hourlyHint", { timezone: tz })}
        />
        <CardContent>
          {todaySales.count === 0 ? (
            <EmptyPanel>{t("dashboard.hourlyEmpty")}</EmptyPanel>
          ) : (
            <HourlySalesChart
              data={hourly}
              revenueLabel={t("dashboard.revenue")}
              countLabel={t("dashboard.salesCount")}
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeading
            title={t("dashboard.topProductsTitle")}
            hint={t("dashboard.topProductsHint")}
            href="/reports"
            linkLabel={t("dashboard.viewAll")}
          />
          <CardContent className="pt-3">
            {top.length === 0 ? (
              <EmptyPanel>{t("dashboard.topProductsEmpty")}</EmptyPanel>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="w-8 py-2 font-medium">{t("dashboard.rank")}</th>
                    <th className="py-2 font-medium">{t("dashboard.product")}</th>
                    <th className="w-14 py-2 text-right font-medium">{t("dashboard.quantity")}</th>
                    <th className="w-28 py-2 text-right font-medium">{t("dashboard.revenue")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {top.map((product, i) => (
                    <tr key={product.productId}>
                      <td className="py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="max-w-0 truncate py-2.5 pr-3 font-medium">{product.name}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {f.number(product.quantity)}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums">
                        {f.money(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeading title={t("dashboard.shortcutsTitle")} />
          <CardContent className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-5">
            {SHORTCUTS.map(({ href, label, icon: Icon, tone }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-muted/60 px-2 py-3 text-center text-xs font-medium transition-colors hover:bg-muted"
              >
                <Icon className={cn("size-5", tone)} />
                <span className="w-full truncate">{t(label)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeading
            title={t("dashboard.recentSalesTitle")}
            href="/sales"
            linkLabel={t("dashboard.viewAll")}
          />
          <CardContent className="pt-3">
            {recent.length === 0 ? (
              <EmptyPanel>{t("dashboard.recentSalesEmpty")}</EmptyPanel>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {recent.map((sale) => {
                  const shown = sale.items.slice(0, ITEMS_SHOWN).map((item) =>
                    t("dashboard.itemLine", {
                      quantity: f.number(item.quantity),
                      name: item.productName,
                    }),
                  );
                  const more = sale.items.length - shown.length;
                  return (
                    <li key={sale.id}>
                      <Link
                        href={
                          sale.branchId === branch.id
                            ? `/sales/${sale.id}`
                            : switchBranchHref(sale.branchId, `/sales/${sale.id}`)
                        }
                        className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold tabular-nums">{f.money(sale.total)}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {sale.status === "refunded" && (
                              <Badge tone="muted">{t("dashboard.refunded")}</Badge>
                            )}
                            {sale.invoiceNumber}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm">
                          {shown.join(", ")}
                          {more > 0 && ` ${t("dashboard.moreItems", { count: f.number(more) })}`}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {allBranches && `${branchNames.get(sale.branchId) ?? ""} · `}
                          {sale.customer?.name ?? t("dashboard.walkIn")}
                          {sale.user && ` · ${sale.user.name}`} · {f.dateTime(sale.createdAt)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeading
            title={t("dashboard.stockExpiryTitle")}
            href="/inventory?filter=low"
            linkLabel={t("dashboard.viewAll")}
          />
          <CardContent className="pt-3">
            {lowStock.length === 0 && expiring.length === 0 ? (
              <EmptyPanel>{t("dashboard.stockExpiryEmpty")}</EmptyPanel>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {lowStock.slice(0, LIST_SIZE).map((product) => (
                  <li
                    key={`p-${product.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {product.name}
                        {product.genericName && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({product.genericName})
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("dashboard.stockLine", {
                          quantity: f.number(product.quantity),
                          level: f.number(product.reorderLevel),
                        })}
                      </p>
                    </div>
                    <Badge tone={product.quantity <= 0 ? "danger" : "warning"}>
                      <PackageMinus className="mr-1 size-3" />
                      {product.quantity <= 0 ? t("dashboard.outBadge") : t("dashboard.lowBadge")}
                    </Badge>
                  </li>
                ))}
                {expiring.map((batch) => {
                  const expired = !!batch.expiryDate && batch.expiryDate < today;
                  return (
                    <li
                      key={`b-${batch.id}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{batch.productName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {batch.batchNumber
                            ? t("dashboard.batch", { number: batch.batchNumber })
                            : t("dashboard.noBatchNumber")}
                          {" · "}
                          {t("dashboard.inStock", { quantity: f.number(batch.quantity) })}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-xs font-medium",
                            expired ? "text-destructive" : "text-warning",
                          )}
                        >
                          {t(expired ? "dashboard.expiredOn" : "dashboard.expiresOn", {
                            date: f.day(batch.expiryDate),
                          })}
                        </p>
                      </div>
                      <Badge tone={expired ? "danger" : "warning"}>
                        {expired ? t("dashboard.expiredBadge") : t("dashboard.expiringBadge")}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
