import { and, asc, count, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  ChartLine,
  Layers,
  Plug,
  Plus,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { DonutChart, type Segment } from "@/components/charts/donut-chart";
import { RefreshButton } from "@/components/refresh-button";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { pharmacies, plans } from "@/db/schema";
import type { Translate } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import {
  monthStart,
  monthlyRevenue,
  otherPaymentCurrencies,
  recentPayments,
  revenueAllTime,
  revenueBetween,
  revenueByMethod,
  topPayingPharmacies,
} from "@/lib/billing";
import {
  METHOD_COLOR,
  METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/billing-labels";
import { addDays, todayInTimezone, zonedDayStart } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PLATFORM_CURRENCY, PLATFORM_TIMEZONE, stripeStatus } from "@/lib/platform";
import {
  SUBSCRIPTION_STATES,
  STATE_LABEL,
  daysLeftLabel,
  subscriptionState,
  type SubscriptionState,
} from "@/lib/subscription";
import { daysFromNow, now } from "@/lib/time";
import { cn } from "@/lib/utils";
import { accessCondition, stateCondition } from "./_lib/conditions";
import { formatsByZone } from "./_lib/format";

export const generateMetadata = pageTitle("platform.title");

const LIST_SIZE = 5;
const METHOD_DAYS = 30;

const STATE_COLOR: Record<SubscriptionState, string> = {
  active: "var(--success)",
  trial: "var(--info)",
  expired: "var(--warning)",
  cancelled: "var(--muted-foreground)",
  suspended: "var(--destructive)",
};

/** "+12.5% vs last month", or a note when there is nothing to compare with. */
function changeLabel(t: Translate, current: number, previous: number): string {
  if (previous === 0) return t("billing.noLastMonth");
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return t("billing.changeVsLastMonth", { change: `${sign}${change.toFixed(1)}` });
}

function ListCard({
  title,
  href,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent className="pt-3">
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  hint,
  warning,
}: {
  href: string;
  icon: typeof Layers;
  title: string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50",
        warning ? "border-warning/50" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          warning ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function PlatformDashboardPage() {
  await requireSuperAdmin();
  const [t, f, db] = await Promise.all([
    getT(),
    getFormat({ currency: PLATFORM_CURRENCY, timezone: PLATFORM_TIMEZONE }),
    getDb(),
  ]);

  const current = now();
  const today = todayInTimezone(PLATFORM_TIMEZONE);
  const at = (day: string) => zonedDayStart(day, PLATFORM_TIMEZONE);
  const thisMonth = at(monthStart(today));
  const lastMonth = at(monthStart(today, -1));
  const nextMonth = at(monthStart(today, 1));
  const access = accessCondition(current);
  const expiringWithin = (days: number) =>
    and(access, lte(pharmacies.subscriptionEndsAt, daysFromNow(days)));
  const createdBetween = (start: Date, end: Date) =>
    and(gte(pharmacies.createdAt, start), lt(pharmacies.createdAt, end));

  const pharmacyRows = () =>
    db
      .select({
        id: pharmacies.id,
        name: pharmacies.name,
        email: pharmacies.email,
        status: pharmacies.status,
        subscriptionStatus: pharmacies.subscriptionStatus,
        subscriptionEndsAt: pharmacies.subscriptionEndsAt,
        currency: pharmacies.currency,
        timezone: pharmacies.timezone,
        createdAt: pharmacies.createdAt,
        planName: plans.name,
      })
      .from(pharmacies)
      .leftJoin(plans, eq(pharmacies.planId, plans.id));

  const [
    total,
    newThisMonth,
    newLastMonth,
    stateCounts,
    expiring7,
    expiring30,
    [mrrRow],
    activePlans,
    revenueThis,
    revenueLast,
    revenueToday,
    revenueTotal,
    months,
    methods,
    top,
    recent,
    registered,
    ending,
    ended,
    otherCurrencies,
  ] = await Promise.all([
    db.$count(pharmacies),
    db.$count(pharmacies, createdBetween(thisMonth, nextMonth)),
    db.$count(pharmacies, createdBetween(lastMonth, thisMonth)),
    Promise.all(
      SUBSCRIPTION_STATES.map(async (state) => ({
        state,
        count: await db.$count(pharmacies, stateCondition(state, current)),
      })),
    ),
    db.$count(pharmacies, expiringWithin(7)),
    db.$count(pharmacies, expiringWithin(30)),
    // What paying pharmacies are billed per month. Trials have access but do not pay.
    db
      .select({
        amount: sql<number>`coalesce(sum(${plans.priceMonthly}), 0)`.mapWith(Number),
        payingCount: count(),
      })
      .from(pharmacies)
      .innerJoin(plans, eq(pharmacies.planId, plans.id))
      .where(
        and(
          access,
          eq(pharmacies.subscriptionStatus, "active"),
          eq(plans.currency, PLATFORM_CURRENCY),
        ),
      ),
    db.$count(plans, eq(plans.isActive, true)),
    revenueBetween(db, thisMonth, nextMonth),
    revenueBetween(db, lastMonth, thisMonth),
    revenueBetween(db, at(today), at(addDays(today, 1))),
    revenueAllTime(db),
    monthlyRevenue(db, today),
    revenueByMethod(db, today, METHOD_DAYS),
    topPayingPharmacies(db, LIST_SIZE),
    recentPayments(db, 8),
    pharmacyRows().orderBy(desc(pharmacies.createdAt)).limit(LIST_SIZE),
    pharmacyRows()
      .where(expiringWithin(30))
      .orderBy(asc(pharmacies.subscriptionEndsAt))
      .limit(LIST_SIZE),
    pharmacyRows()
      .where(stateCondition("expired", current))
      .orderBy(desc(pharmacies.subscriptionEndsAt))
      .limit(LIST_SIZE),
    otherPaymentCurrencies(db),
  ]);

  const stripe = stripeStatus();
  const healthSegments: Segment[] = stateCounts.map(({ state, count: value }) => ({
    key: state,
    label: t(STATE_LABEL[state]),
    value,
    display: f.number(value),
    color: STATE_COLOR[state],
  }));
  const methodRows = (["cash", "transfer", "stripe"] as const).map((method) => {
    const row = methods.find((m) => m.method === method);
    return { method, amount: row?.amount ?? 0, count: row?.count ?? 0 };
  });
  const methodSegments: Segment[] = methodRows.map((row) => ({
    key: row.method,
    label: t(METHOD_LABEL[row.method]),
    value: row.amount,
    display: f.money(row.amount),
    color: METHOD_COLOR[row.method],
  }));
  const last30Total = methodRows.reduce((sum, row) => sum + row.amount, 0);
  const last30Count = methodRows.reduce((sum, row) => sum + row.count, 0);

  // Payments can be in other currencies; format each in its own.
  const moneyIn = new Map([[PLATFORM_CURRENCY, f]]);
  for (const payment of recent) {
    if (!moneyIn.has(payment.currency)) {
      moneyIn.set(payment.currency, await getFormat(null, payment.currency));
    }
  }
  const endingOrEnded = [...ending, ...ended];
  const zoneFormats = await formatsByZone(endingOrEnded);

  return (
    <>
      <PageHeader
        title={t("platform.title")}
        description={`${t("platform.description")} ${t("billing.updatedAt", { time: f.time(current) })}`}
      >
        <RefreshButton />
        <Link href="/superadmin/pharmacies/new" className={buttonClass()}>
          <Plus />
          {t("platform.addPharmacy")}
        </Link>
      </PageHeader>

      {!stripe.configured && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4">
          <TriangleAlert className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("billing.stripeBannerTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("billing.stripeBannerBody")}</p>
          </div>
          <Link href="/superadmin/stripe" className={buttonClass({ variant: "outline" })}>
            <Plug />
            {t("billing.stripeSetup")}
          </Link>
        </div>
      )}

      <div className="grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("billing.pharmacies")}
          value={f.number(total)}
          hint={`${t("billing.newThisMonth", { count: f.number(newThisMonth) })} · ${changeLabel(t, newThisMonth, newLastMonth)}`}
          icon={Building2}
        />
        <StatCard
          label={t("billing.mrr")}
          value={f.money(mrrRow.amount)}
          hint={t("billing.arrHint", { amount: f.money(mrrRow.amount * 12) })}
          icon={ChartLine}
          tone="info"
        />
        <StatCard
          label={t("billing.revenueThisMonth")}
          value={f.money(revenueThis)}
          hint={`${t("billing.lastMonthHint", { amount: f.money(revenueLast) })} · ${changeLabel(t, revenueThis, revenueLast)}`}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label={t("billing.expiringIn7")}
          value={f.number(expiring7)}
          hint={t("billing.expiringIn30", { count: f.number(expiring30) })}
          icon={CalendarClock}
          tone={expiring7 > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stateCounts.map(({ state, count: value }) => (
          <Link
            key={state}
            href={`/superadmin/pharmacies?status=${state}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATE_COLOR[state] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-muted-foreground uppercase">
                {t(STATE_LABEL[state])}
              </span>
              <span className="block text-xl font-semibold tabular-nums">{f.number(value)}</span>
            </span>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-wrap items-start">
          <div>
            <CardTitle>{t("billing.revenueChartTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("billing.revenueChartHint", { currency: PLATFORM_CURRENCY })}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("billing.allTime")}:{" "}
            <span className="font-semibold text-foreground">{f.money(revenueTotal)}</span>
            <span className="mx-2">·</span>
            {t("billing.today")}:{" "}
            <span className="font-semibold text-foreground">{f.money(revenueToday)}</span>
          </p>
        </CardHeader>
        <CardContent>
          <RevenueChart data={months} currency={PLATFORM_CURRENCY} label={t("billing.revenue")} />
          {otherCurrencies.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("billing.otherCurrencies", {
                currency: PLATFORM_CURRENCY,
                currencies: otherCurrencies.join(", "),
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader className="block">
            <CardTitle>{t("billing.healthTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("billing.healthHint")}</p>
          </CardHeader>
          <CardContent>
            <DonutChart
              segments={healthSegments}
              centerValue={f.number(total)}
              centerLabel={t("billing.pharmacies")}
              emptyLabel={t("platform.pharmaciesEmpty")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start">
            <div>
              <CardTitle>{t("billing.methodTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("billing.methodHint")}</p>
            </div>
            <Badge tone={stripe.mode === "live" ? "success" : stripe.mode ? "info" : "muted"}>
              {stripe.mode === "live"
                ? t("billing.stripeLive")
                : stripe.mode
                  ? t("billing.stripeTest")
                  : t("billing.stripeOff")}
            </Badge>
          </CardHeader>
          <CardContent>
            <DonutChart
              segments={methodSegments}
              centerValue={f.money(last30Total)}
              centerLabel={t("billing.paymentsCount", { count: f.number(last30Count) })}
              emptyLabel={t("billing.noPayments")}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {methodRows.map((row) => (
                <div key={row.method} className="rounded-lg bg-muted/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: METHOD_COLOR[row.method] }}
                    />
                    {t(METHOD_LABEL[row.method])}
                  </p>
                  <p className="mt-1 truncate font-semibold tabular-nums">{f.money(row.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.paymentsCount", { count: f.number(row.count) })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 *:min-w-0 lg:grid-cols-2">
        <ListCard
          title={t("billing.topTitle")}
          href="/superadmin/payments"
          linkLabel={t("platform.viewAll")}
          empty={top.length === 0 ? t("billing.noPayments") : null}
        >
          {top.map((row, index) => (
            <li key={row.pharmacyId ?? row.name} className="flex items-center gap-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {row.pharmacyId ? (
                  <Link
                    href={`/superadmin/pharmacies/${row.pharmacyId}`}
                    className="block truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium">
                    {t("billing.deletedPharmacy", { name: row.name })}
                  </p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {t("billing.topHint", {
                    count: f.number(row.count),
                    date: f.date(row.lastPaidAt),
                  })}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{f.money(row.amount)}</span>
            </li>
          ))}
        </ListCard>

        <ListCard
          title={t("billing.recentPaymentsTitle")}
          href="/superadmin/payments"
          linkLabel={t("platform.viewAll")}
          empty={recent.length === 0 ? t("billing.noPayments") : null}
        >
          {recent.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{payment.name}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {f.dateTime(payment.paidAt)}
                  <Badge tone="muted">{t(METHOD_LABEL[payment.method])}</Badge>
                  {payment.status !== "succeeded" && (
                    <Badge tone={PAYMENT_STATUS_TONE[payment.status]}>
                      {t(PAYMENT_STATUS_LABEL[payment.status])}
                    </Badge>
                  )}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  payment.status !== "succeeded" && "text-muted-foreground line-through",
                )}
              >
                {(moneyIn.get(payment.currency) ?? f).money(payment.amount)}
              </span>
            </li>
          ))}
        </ListCard>

        <ListCard
          title={t("platform.recentTitle")}
          href="/superadmin/pharmacies"
          linkLabel={t("platform.viewAll")}
          empty={registered.length === 0 ? t("platform.pharmaciesEmpty") : null}
        >
          {registered.map((pharmacy) => (
            <li key={pharmacy.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link
                  href={`/superadmin/pharmacies/${pharmacy.id}`}
                  className="block truncate text-sm font-medium hover:text-primary hover:underline"
                >
                  {pharmacy.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {[pharmacy.email, f.date(pharmacy.createdAt), pharmacy.planName ?? t("subscription.noPlan")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <SubscriptionBadge state={subscriptionState(pharmacy, current)} />
            </li>
          ))}
        </ListCard>

        <ListCard
          title={t("platform.endingTitle")}
          href="/superadmin/pharmacies?status=expired"
          linkLabel={t("platform.viewAll")}
          empty={endingOrEnded.length === 0 ? t("platform.endingEmpty", { days: 30 }) : null}
        >
          {endingOrEnded.map((pharmacy) => {
            const endsAt = pharmacy.subscriptionEndsAt;
            const date = (zoneFormats.get(pharmacy.timezone) ?? f).date(endsAt);
            const left = endsAt ? daysLeftLabel(t, endsAt) : null;
            return (
              <li key={pharmacy.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/superadmin/pharmacies/${pharmacy.id}`}
                    className="block truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {pharmacy.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {left ? `${date} · ${left}` : t("subscription.endedOn", { date })}
                  </p>
                </div>
                <SubscriptionBadge state={subscriptionState(pharmacy, current)} />
              </li>
            );
          })}
        </ListCard>
      </div>

      <div className="mt-4 grid gap-4 *:min-w-0 md:grid-cols-3">
        <QuickLink
          href="/superadmin/plans"
          icon={Layers}
          title={t("billing.quickPlans")}
          hint={t("billing.quickPlansHint", { count: f.number(activePlans) })}
        />
        <QuickLink
          href="/superadmin/stripe"
          icon={Plug}
          title={t("billing.quickStripe")}
          hint={
            stripe.configured
              ? t("billing.quickStripeOk", {
                  mode: stripe.mode === "live" ? t("billing.modeLive") : t("billing.modeTest"),
                })
              : t("billing.quickStripeMissing")
          }
          warning={!stripe.configured}
        />
        <QuickLink
          href="/superadmin/payments"
          icon={Wallet}
          title={t("billing.quickPayments")}
          hint={t("billing.quickPaymentsHint", { amount: f.money(last30Total) })}
        />
      </div>
    </>
  );
}
