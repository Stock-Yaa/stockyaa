import { count, eq, inArray, sql } from "drizzle-orm";
import { CreditCard, Download, HandCoins, ListChecks, Banknote, Wallet } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { getDb } from "@/db";
import {
  BILLING_METHODS,
  BILLING_PAYMENT_STATUSES,
  billingPayments,
  pharmacies,
} from "@/db/schema";
import { getT } from "@/i18n/server";
import { requireSuperAdmin } from "@/lib/auth";
import { METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/billing-labels";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { PLATFORM_CURRENCY, PLATFORM_TIMEZONE } from "@/lib/platform";
import {
  DATE_RANGES,
  INTERVALS,
  parsePaymentFilters,
  paymentWhere,
  type PaymentParams,
} from "./filters";
import { PaymentsTable } from "./payments-table";
import { moneyFormatsFor, paymentRows } from "./queries";

export const generateMetadata = pageTitle("billing.paymentsTitle");

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<PaymentParams & { page?: string | string[] }>;
}) {
  await requireSuperAdmin();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat({ currency: PLATFORM_CURRENCY, timezone: PLATFORM_TIMEZONE }),
    getDb(),
    searchParams,
  ]);
  const filters = parsePaymentFilters(params);
  const page = parsePage(Array.isArray(params.page) ? params.page[0] : params.page);
  const where = paymentWhere(filters);

  const paid = sql`${billingPayments.status} = 'succeeded'`;
  const [[totals], rows] = await Promise.all([
    db
      .select({
        count: count(),
        paidCount: sql<number>`count(*) filter (where ${paid})`.mapWith(Number),
        revenue: sql<number>`coalesce(sum(${billingPayments.amount}) filter (where ${paid} and ${billingPayments.currency} = ${PLATFORM_CURRENCY}), 0)`.mapWith(
          Number,
        ),
        manualCount: sql<number>`count(*) filter (where ${inArray(billingPayments.method, ["cash", "transfer"])})`.mapWith(
          Number,
        ),
        stripeCount: sql<number>`count(*) filter (where ${eq(billingPayments.method, "stripe")})`.mapWith(
          Number,
        ),
      })
      .from(billingPayments)
      .leftJoin(pharmacies, eq(pharmacies.id, billingPayments.pharmacyId))
      .where(where),
    paymentRows(db, where)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const moneyFormats = await moneyFormatsFor(rows, f);
  const filtered = Object.values(filters).some(Boolean);

  // The export gets the same filters as the list.
  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <>
      <PageHeader title={t("billing.paymentsTitle")} description={t("billing.paymentsDescription")}>
        <a
          href={`/superadmin/payments/export${exportQuery ? `?${exportQuery}` : ""}`}
          className={buttonClass({ variant: "outline" })}
        >
          <Download />
          {t("billing.exportCsv")}
        </a>
      </PageHeader>

      <div className="mb-6 grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("billing.statRecords")}
          value={f.number(totals.count)}
          hint={t("billing.statRecordsHint", { count: f.number(totals.paidCount) })}
          icon={ListChecks}
        />
        <StatCard
          label={t("billing.statRevenue")}
          value={f.money(totals.revenue)}
          hint={t("billing.statRevenueHint", { currency: PLATFORM_CURRENCY })}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label={t("billing.statManual")}
          value={f.number(totals.manualCount)}
          hint={t("billing.statManualHint")}
          icon={HandCoins}
          tone="warning"
        />
        <StatCard
          label={t("billing.statStripe")}
          value={f.number(totals.stripeCount)}
          hint={t("billing.statStripeHint")}
          icon={CreditCard}
          tone="info"
        />
      </div>

      <Toolbar>
        <SearchInput placeholder={t("billing.searchPayments")} />
        <FilterSelect
          param="range"
          aria-label={t("billing.filterDate")}
          options={[
            { value: "", label: t("billing.dateAll") },
            ...DATE_RANGES.map((r) => ({ value: r.value, label: t(r.label) })),
          ]}
        />
        <FilterSelect
          param="method"
          aria-label={t("billing.colMethod")}
          options={[
            { value: "", label: t("billing.allMethods") },
            ...BILLING_METHODS.map((value) => ({ value, label: t(METHOD_LABEL[value]) })),
          ]}
        />
        <FilterSelect
          param="status"
          aria-label={t("billing.filterStatus")}
          options={[
            { value: "", label: t("billing.allStatuses") },
            ...BILLING_PAYMENT_STATUSES.map((value) => ({
              value,
              label: t(PAYMENT_STATUS_LABEL[value]),
            })),
          ]}
        />
        <FilterSelect
          param="interval"
          aria-label={t("billing.filterInterval")}
          options={[
            { value: "", label: t("billing.allIntervals") },
            ...INTERVALS.map((i) => ({ value: i.value, label: t(i.label) })),
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filtered ? t("common.noResults") : t("billing.paymentsEmpty")}
          hint={filtered ? t("common.noResultsHint") : t("billing.paymentsEmptyHint")}
        />
      ) : (
        <>
          <PaymentsTable rows={rows} t={t} format={f} moneyFormats={moneyFormats} showPharmacy />
          <Pagination page={page} pageCount={pageCountOf(totals.count)} />
        </>
      )}
    </>
  );
}
