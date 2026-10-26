import {
  ChartColumn,
  ChartLine,
  ChartPie,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Pill,
  Receipt,
  ReceiptText,
  ShoppingBasket,
  Store,
  TrendingUp,
  UserCheck,
  UserRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { CategoryBarChart } from "@/components/charts/category-bar-chart";
import { DonutChart, type Segment } from "@/components/charts/donut-chart";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { buttonClass } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/list-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import {
  countActiveProducts,
  getDailySales,
  getExpenseTotal,
  getLowStockProducts,
  getPaymentBreakdown,
  getSalesByBranch,
  getSalesByCategory,
  getSalesSummary,
  getStockByBranch,
  getStockSummary,
  getTopProducts,
} from "@/lib/reports";
import { REPORT_BRANCH_PARAM, resolveReportScope } from "@/lib/report-scope";
import { todayInTimezone, zonedRange } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { cn, round2 } from "@/lib/utils";
import { PrintButton } from "./print-button";
import { resolveRange } from "./range";
import { RangePicker } from "./range-picker";

export const generateMetadata = pageTitle("reports.title");

const METHODS = [
  { method: "cash", label: "reports.methodCash", color: "var(--chart-1)" },
  { method: "card", label: "reports.methodCard", color: "var(--chart-2)" },
  { method: "transfer", label: "reports.methodTransfer", color: "var(--chart-3)" },
] as const satisfies readonly { method: string; label: MessageKey; color: string }[];

type Tone = "info" | "success" | "muted" | "warning" | "danger" | "violet";

// Label colour and background tint of a headline tile.
const TONES: Record<Tone, { text: string; tint: string }> = {
  info: { text: "text-info", tint: "from-info/10" },
  success: { text: "text-success", tint: "from-success/10" },
  muted: { text: "text-muted-foreground", tint: "from-muted/40" },
  warning: { text: "text-warning", tint: "from-warning/10" },
  danger: { text: "text-destructive", tint: "from-destructive/10" },
  violet: { text: "text-chart-3", tint: "from-chart-3/15" },
};

function percent(part: number, whole: number): string {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : "0.0";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);

  const tz = pharmacy.timezone;
  const today = todayInTimezone(tz);
  const { from, to } = resolveRange(params, today);
  const range = zonedRange(from, to, tz);
  // One branch, or (for admins) every branch of the pharmacy.
  const view = resolveReportScope(params.branch, { user, branch, branches }, t);
  const { scope } = view;
  const allBranches = scope.branchId === null;

  const [
    summary,
    daily,
    methods,
    top,
    byCategory,
    expenses,
    stock,
    lowStock,
    skus,
    salesByBranch,
    stockByBranch,
  ] = await Promise.all([
    getSalesSummary(db, scope, range),
    getDailySales(db, scope, from, to, tz),
    getPaymentBreakdown(db, scope, range),
    getTopProducts(db, scope, range, 10),
    getSalesByCategory(db, scope, range),
    // Admins also carry the whole-business expenses, as on the expenses page.
    getExpenseTotal(db, scope, from, to, canSwitchBranch(user)),
    getStockSummary(db, scope, today, pharmacy.expiryAlertDays),
    getLowStockProducts(db, scope, today),
    countActiveProducts(db, pharmacy.id),
    allBranches ? getSalesByBranch(db, pharmacy.id, range) : null,
    allBranches ? getStockByBranch(db, pharmacy.id, today) : null,
  ]);

  const net = round2(summary.revenue - expenses.total);
  const paymentSegments: Segment[] = METHODS.map(({ method, label, color }) => {
    const value = methods.find((row) => row.method === method)?.revenue ?? 0;
    return { key: method, label: t(label), value, display: f.money(value), color };
  });
  const categoryData = byCategory.map((row) => ({
    name: row.category ?? t("reports.uncategorised"),
    revenue: row.revenue,
  }));

  const exportHref = (type: string, format?: "xlsx") =>
    `/reports/export?${new URLSearchParams({
      type,
      from,
      to,
      ...(format ? { format } : {}),
      ...(view.branch && view.options ? { [REPORT_BRANCH_PARAM]: view.branch.id } : {}),
    })}`;
  const scopeLabel = view.options
    ? ` · ${view.branch ? view.branch.name : t("branches.allBranches")}`
    : "";

  return (
    <>
      <PageHeader title={t("reports.title")} description={t("reports.description")}>
        {view.options && (
          <FilterSelect
            param={REPORT_BRANCH_PARAM}
            options={view.options}
            aria-label={t("branches.current")}
          />
        )}
        <a
          href={exportHref("sales", "xlsx")}
          className={buttonClass({
            variant: "outline",
            className: "border-success/40 text-success hover:bg-success/10",
          })}
        >
          <FileSpreadsheet />
          {t("reports.excel")}
        </a>
        <PrintButton />
        <a href={exportHref("sales")} className={buttonClass()}>
          <FileText />
          {t("reports.fullCsv")}
        </a>
      </PageHeader>

      {/* Heading on paper, where the page header and range picker are hidden. */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-semibold">{t("reports.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {pharmacy.name} · {f.day(from)} – {f.day(to)}
          {scopeLabel}
        </p>
      </div>

      <RangePicker from={from} to={to} today={today} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile
          icon={Store}
          label={t("reports.transactions")}
          value={f.number(summary.count)}
          hint={
            summary.refundedCount > 0
              ? t("reports.refundsCount", { count: f.number(summary.refundedCount) })
              : undefined
          }
          tone="info"
        />
        <KpiTile
          icon={TrendingUp}
          label={t("reports.revenue")}
          value={f.money(summary.revenue)}
          hint={t("reports.grossProfitHint", {
            amount: f.money(summary.profit),
            percent: percent(summary.profit, summary.net),
          })}
          tone="success"
        />
        <KpiTile
          icon={Receipt}
          label={t("reports.avgOrder")}
          value={f.money(summary.average)}
          hint={t("reports.unitsSold", { count: f.number(summary.units) })}
          tone="muted"
        />
        <KpiTile
          icon={ChartColumn}
          label={t("reports.tax")}
          value={f.money(summary.tax)}
          tone="warning"
        />
        <KpiTile
          icon={Wallet}
          label={t("reports.expenses")}
          value={f.money(expenses.total)}
          hint={t("reports.expenseEntries", { count: f.number(expenses.count) })}
          tone="danger"
        />
        <KpiTile
          icon={ChartPie}
          label={t("reports.net")}
          value={f.money(net)}
          hint={t("reports.netHint")}
          tone="violet"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MixPill
          icon={Pill}
          iconClass="text-chart-3"
          label={t("reports.prescriptionSales")}
          value={f.number(summary.prescription)}
        />
        <MixPill
          icon={UserCheck}
          iconClass="text-chart-1"
          label={t("reports.withCustomer")}
          value={f.number(summary.withCustomer)}
        />
        <MixPill
          icon={UserRound}
          iconClass="text-muted-foreground"
          label={t("reports.walkIn")}
          value={f.number(summary.count - summary.withCustomer)}
        />
        <MixPill
          icon={ReceiptText}
          iconClass="text-muted-foreground"
          label={t("reports.subtotalPreTax")}
          value={f.money(summary.net)}
        />
      </div>

      {salesByBranch && stockByBranch && (
        <Card className="mt-6">
          <SectionHeading icon={Landmark} iconClass="text-info" title={t("reports.byBranch")} />
          <CardContent>
            <Table>
              <THead>
                <tr className="uppercase">
                  <TH>{t("branches.current")}</TH>
                  <TH className="text-right">{t("reports.transactions")}</TH>
                  <TH className="text-right">{t("reports.revenue")}</TH>
                  <TH className="text-right">{t("reports.share")}</TH>
                  <TH className="text-right">{t("reports.grossProfit")}</TH>
                  <TH className="text-right">{t("reports.stockValue")}</TH>
                </tr>
              </THead>
              <TBody>
                {branches.map((b) => {
                  const sold = salesByBranch.get(b.id);
                  return (
                    <TR key={b.id}>
                      <TD className="font-medium">{b.name}</TD>
                      <TD className="text-right tabular-nums">{f.number(sold?.count ?? 0)}</TD>
                      <TD className="text-right tabular-nums">{f.money(sold?.revenue ?? 0)}</TD>
                      <TD className="text-right tabular-nums">
                        {percent(sold?.revenue ?? 0, summary.revenue)}%
                      </TD>
                      <TD className="text-right tabular-nums">{f.money(sold?.profit ?? 0)}</TD>
                      <TD className="text-right tabular-nums">
                        {f.money(stockByBranch.get(b.id)?.value ?? 0)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
              <tfoot className="border-t border-border bg-muted/50 font-semibold">
                <tr>
                  <TD>{t("branches.allBranches")}</TD>
                  <TD className="text-right tabular-nums">{f.number(summary.count)}</TD>
                  <TD className="text-right tabular-nums">{f.money(summary.revenue)}</TD>
                  <TD className="text-right tabular-nums">100.0%</TD>
                  <TD className="text-right tabular-nums">{f.money(summary.profit)}</TD>
                  <TD className="text-right tabular-nums">{f.money(stock.value)}</TD>
                </tr>
              </tfoot>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 *:min-w-0 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeading
            icon={ChartLine}
            iconClass="text-info"
            title={t("reports.dailyTitle")}
            hint={t("reports.dailyHint")}
          />
          <CardContent>
            <SalesTrendChart
              data={daily}
              revenueLabel={t("reports.revenue")}
              countLabel={t("reports.transactions")}
            />
          </CardContent>
        </Card>
        <Card>
          <SectionHeading
            icon={ChartPie}
            iconClass="text-chart-3"
            title={t("reports.paymentMix")}
            hint={t("reports.paymentMixHint")}
          />
          <CardContent>
            <DonutChart
              segments={paymentSegments}
              centerValue={f.money(summary.revenue)}
              centerLabel={t("reports.revenue")}
              emptyLabel={t("reports.noSales")}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionHeading
          icon={Pill}
          iconClass="text-success"
          title={t("reports.categoryTitle")}
          hint={t("reports.categoryHint")}
        />
        <CardContent>
          {categoryData.length === 0 ? (
            <EmptyPanel>{t("reports.noSales")}</EmptyPanel>
          ) : (
            <CategoryBarChart data={categoryData} label={t("reports.revenue")} />
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 *:min-w-0 lg:grid-cols-2">
        <Card>
          <SectionHeading
            icon={ChartColumn}
            iconClass="text-success"
            title={t("reports.topProducts")}
          />
          <CardContent>
            {top.length === 0 ? (
              <EmptyPanel>{t("reports.noSales")}</EmptyPanel>
            ) : (
              <Table>
                <THead>
                  <tr className="uppercase">
                    <TH>{t("reports.product")}</TH>
                    <TH className="text-right">{t("reports.qty")}</TH>
                    <TH className="text-right">{t("reports.revenue")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {top.map((row) => (
                    <TR key={row.productId}>
                      <TD className="max-w-0 truncate font-medium">{row.name}</TD>
                      <TD className="w-16 text-right tabular-nums">{f.number(row.quantity)}</TD>
                      <TD className="w-32 text-right tabular-nums">{f.money(row.revenue)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <SectionHeading
            icon={Warehouse}
            iconClass="text-chart-3"
            title={t("reports.inventoryTitle")}
          >
            <a
              href={exportHref("stock")}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline print:hidden"
            >
              <Download className="size-4" />
              {t("reports.exportStock")}
            </a>
          </SectionHeading>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotTile label={t("reports.skus")} value={f.number(skus)} />
              <SnapshotTile label={t("reports.stockRetailValue")} value={f.money(stock.retailValue)} />
              <SnapshotTile
                label={t("reports.lowStock")}
                value={f.number(lowStock.length)}
                tone={lowStock.length > 0 ? "warning" : undefined}
              />
              <SnapshotTile
                label={t("reports.expiringWithin", { days: pharmacy.expiryAlertDays })}
                value={f.number(stock.expiringSoon)}
                tone={stock.expiringSoon > 0 ? "danger" : undefined}
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("reports.inventoryNote")}{" "}
              <Link href="/inventory/alerts" className="text-info hover:underline">
                {t("reports.stockAlerts")}
              </Link>{" "}
              {t("reports.inventoryNoteEnd")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionHeading
          icon={ShoppingBasket}
          iconClass="text-info"
          title={t("reports.paymentDetail")}
        />
        <CardContent>
          {methods.length === 0 ? (
            <EmptyPanel>{t("reports.noSales")}</EmptyPanel>
          ) : (
            <Table>
              <THead>
                <tr className="uppercase">
                  <TH>{t("reports.paymentMethod")}</TH>
                  <TH className="text-right">{t("reports.transactions")}</TH>
                  <TH className="text-right">{t("reports.revenue")}</TH>
                  <TH className="text-right">{t("reports.avgTicket")}</TH>
                </tr>
              </THead>
              <TBody>
                {methods.map((row) => {
                  const method = METHODS.find((m) => m.method === row.method);
                  return (
                    <TR key={row.method}>
                      <TD className="font-medium">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: method?.color }}
                          />
                          {t(method?.label ?? "reports.methodCash")}
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">{f.number(row.count)}</TD>
                      <TD className="text-right tabular-nums">{f.money(row.revenue)}</TD>
                      <TD className="text-right tabular-nums">
                        {f.money(row.count > 0 ? row.revenue / row.count : 0)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Headline figure with a coloured label and a faint tint of the same colour. */
function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
}) {
  const { text, tint } = TONES[tone];
  return (
    <Card className={cn("min-w-0 bg-linear-to-br to-card p-5", tint)}>
      <p
        className={cn(
          "flex items-center gap-2 text-xs font-semibold tracking-wider uppercase",
          text,
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-3 truncate text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** One line: icon, label and a figure on the right. */
function MixPill({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex min-w-0 items-center gap-3 px-5 py-4">
      <Icon className={cn("size-4 shrink-0", iconClass)} />
      <span className="min-w-0 flex-1 text-sm leading-tight text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </Card>
  );
}

function SectionHeading({
  icon: Icon,
  iconClass,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader className="items-start">
      <div className="min-w-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={cn("size-5 shrink-0", iconClass)} />
          {title}
        </CardTitle>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </CardHeader>
  );
}

/** A small framed figure in the inventory snapshot. */
function SnapshotTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
