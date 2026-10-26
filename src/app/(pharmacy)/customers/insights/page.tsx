import {
  ArrowLeft,
  CalendarDays,
  Crown,
  ShoppingBasket,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { addDays, todayInTimezone, zonedDayStart } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { getCustomerCounts, getCustomerSpending } from "@/lib/reports";
import { now } from "@/lib/time";
import { cn, round2 } from "@/lib/utils";

export const generateMetadata = pageTitle("nav.customerInsights");

const NEW_DAYS = 30;
const REGULAR_DAYS = 90;
const REGULAR_ORDERS = 3;
const AT_RISK_DAYS = 60;
const VIP_PERCENT = 10;
const TOP_SIZE = 10;
const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

// Share of buying customers (ranked by spend) that reaches each tier.
const TIERS = [
  { share: VIP_PERCENT / 100, label: "customers.tierPlatinum", tone: "vip" },
  { share: 0.25, label: "customers.tierGold", tone: "warning" },
  { share: 0.5, label: "customers.tierSilver", tone: "info" },
] as const;

type SegmentTone = "info" | "success" | "vip" | "danger";

const SEGMENT_TONE: Record<SegmentTone, { card: string; icon: string }> = {
  info: { card: "border-info/30 bg-info/10", icon: "text-info" },
  success: { card: "border-success/30 bg-success/10", icon: "text-success" },
  vip: { card: "border-chart-3/30 bg-chart-3/10", icon: "text-chart-3" },
  danger: { card: "border-destructive/30 bg-destructive/10", icon: "text-destructive" },
};

const TIER_BADGE = {
  vip: "bg-chart-3/15 text-chart-3",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
};

/** How many of `count` ranked customers fall inside the top `share`. */
function topCount(count: number, share: number): number {
  return Math.ceil(count * share);
}

/** A customer group: count, name and the rule that defines it. */
function Segment({
  icon: Icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  hint: string;
  tone: SegmentTone;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-5", SEGMENT_TONE[tone].card)}>
      <Icon className={cn("size-6", SEGMENT_TONE[tone].icon)} />
      <p className="mt-3 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** An average across customers. */
function Average({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone: SegmentTone;
}) {
  return (
    <Card className="min-w-0 p-5">
      <p className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            SEGMENT_TONE[tone].card,
            SEGMENT_TONE[tone].icon,
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-3 truncate text-2xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

export default async function CustomerInsightsPage() {
  const { pharmacy } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const tz = pharmacy.timezone;
  const current = now();
  const today = todayInTimezone(tz);
  // Start of the window of the last `days` days, today included.
  const since = (days: number) => zonedDayStart(addDays(today, 1 - days), tz);
  const atRiskBefore = since(AT_RISK_DAYS);

  const [counts, buyers] = await Promise.all([
    getCustomerCounts(db, pharmacy.id, since(NEW_DAYS)),
    // Customers are shared by every branch, so their spending counts all of them.
    getCustomerSpending(db, { pharmacyId: pharmacy.id, branchId: null }, since(REGULAR_DAYS)),
  ]);

  const totalSpent = buyers.reduce((sum, c) => sum + c.spent, 0);
  const totalOrders = buyers.reduce((sum, c) => sum + c.orders, 0);
  const regular = buyers.filter((c) => c.recentOrders >= REGULAR_ORDERS).length;
  const atRisk = buyers.filter((c) => c.lastAt < atRiskBefore).length;
  const vip = topCount(buyers.length, VIP_PERCENT / 100);
  // Purchases a month since each customer's first purchase (at least a month).
  const visitsPerMonth = buyers.length
    ? buyers.reduce(
        (sum, c) =>
          sum + c.orders / Math.max(1, (current.getTime() - c.firstAt.getTime()) / MONTH_MS),
        0,
      ) / buyers.length
    : 0;

  const tierOf = (rank: number) =>
    TIERS.find((tier) => rank <= topCount(buyers.length, tier.share));

  return (
    <>
      <PageHeader title={t("nav.customerInsights")} description={t("customers.insightsDescription")}>
        <Link href="/customers" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("nav.customerList")}
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Segment
          icon={UserPlus}
          value={f.number(counts.added)}
          label={t("customers.newCustomers")}
          hint={t("customers.newCustomersHint", { days: NEW_DAYS })}
          tone="info"
        />
        <Segment
          icon={UserCheck}
          value={f.number(regular)}
          label={t("customers.regular")}
          hint={t("customers.regularHint", { count: REGULAR_ORDERS, days: REGULAR_DAYS })}
          tone="success"
        />
        <Segment
          icon={Crown}
          value={f.number(vip)}
          label={t("customers.vip")}
          hint={t("customers.vipHint", { percent: VIP_PERCENT })}
          tone="vip"
        />
        <Segment
          icon={TriangleAlert}
          value={f.number(atRisk)}
          label={t("customers.atRisk")}
          hint={t("customers.atRiskHint", { days: AT_RISK_DAYS })}
          tone="danger"
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Average
          icon={Wallet}
          label={t("customers.avgLifetimeValue")}
          value={f.money(buyers.length ? round2(totalSpent / buyers.length) : 0)}
          hint={t("customers.avgLifetimeValueHint")}
          tone="info"
        />
        <Average
          icon={CalendarDays}
          label={t("customers.avgVisitFrequency")}
          value={f.number(visitsPerMonth)}
          unit={t("customers.perMonth")}
          hint={t("customers.avgVisitFrequencyHint")}
          tone="success"
        />
        <Average
          icon={ShoppingBasket}
          label={t("customers.avgBasketSize")}
          value={f.money(totalOrders ? round2(totalSpent / totalOrders) : 0)}
          hint={t("customers.avgBasketSizeHint")}
          tone="vip"
        />
      </div>

      {buyers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("customers.insightsEmpty")}
          hint={t("customers.insightsEmptyHint")}
        />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="items-start pb-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                {t("customers.topCustomers")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("customers.topCustomersHint")}
              </p>
            </div>
          </CardHeader>
          {/* The card is the frame; drop the table's own border. */}
          <div className="border-t border-border *:rounded-none *:border-0">
            <Table>
              <THead>
                <tr>
                  <TH className="w-12">{t("customers.rank")}</TH>
                  <TH>{t("common.name")}</TH>
                  <TH>{t("common.phone")}</TH>
                  <TH className="text-right">{t("customers.totalSpent")}</TH>
                  <TH className="text-right">{t("customers.orders")}</TH>
                  <TH>{t("customers.lastVisit")}</TH>
                  <TH className="text-right">{t("customers.tier")}</TH>
                </tr>
              </THead>
              <TBody>
                {buyers.slice(0, TOP_SIZE).map((customer, index) => {
                  const rank = index + 1;
                  const tier = tierOf(rank);
                  return (
                    <TR key={customer.id}>
                      <TD className="text-muted-foreground tabular-nums">{rank}</TD>
                      <TD className="font-medium">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="text-primary hover:underline"
                        >
                          {customer.name}
                        </Link>
                      </TD>
                      <TD>{customer.phone ?? "—"}</TD>
                      <TD className="text-right font-medium text-success tabular-nums">
                        {f.money(customer.spent)}
                      </TD>
                      <TD className="text-right tabular-nums">{f.number(customer.orders)}</TD>
                      <TD>{f.date(customer.lastAt)}</TD>
                      <TD className="text-right">
                        {tier ? (
                          <Badge className={TIER_BADGE[tier.tone]}>
                            {t(tier.label as MessageKey)}
                          </Badge>
                        ) : (
                          <Badge tone="muted">{t("customers.tierBronze")}</Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
