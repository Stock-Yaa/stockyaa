import { and, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { Banknote, Plus, Receipt, Undo2 } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, StatCard } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { SALE_STATUSES, customers, sales, taxInvoices } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { addDays, parseDay, todayInTimezone, zonedDayStart } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { DateFilter } from "@/components/ui/date-filter";
import { PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL } from "./labels";

export const generateMetadata = pageTitle("sales.title");

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: Param; status?: Param; from?: Param; to?: Param; page?: Param }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const params = await searchParams;
  const q = first(params.q)?.trim();
  const status = SALE_STATUSES.find((s) => s === first(params.status));
  // Calendar days as the pharmacy sees them, both inclusive. With no dates
  // and no search the list opens on today; a search looks through every day.
  const today = todayInTimezone(pharmacy.timezone);
  const datesGiven = Boolean(parseDay(first(params.from)) || parseDay(first(params.to)));
  const fallback = datesGiven || q ? null : today;
  const from = parseDay(first(params.from)) ?? fallback;
  const to = parseDay(first(params.to)) ?? fallback;
  const page = parsePage(first(params.page));
  const db = await getDb();

  const pattern = q ? likePattern(q) : null;
  const where = and(
    inScope(sales, branchScope(branch)),
    status ? eq(sales.status, status) : undefined,
    from ? gte(sales.createdAt, zonedDayStart(from, pharmacy.timezone)) : undefined,
    to ? lt(sales.createdAt, zonedDayStart(addDays(to, 1), pharmacy.timezone)) : undefined,
    pattern
      ? or(ilike(sales.invoiceNumber, pattern), ilike(customers.name, pattern))
      : undefined,
  );
  const customerJoin = and(
    eq(sales.customerId, customers.id),
    eq(customers.pharmacyId, pharmacy.id),
  );

  const [[stats], rows] = await Promise.all([
    db
      .select({
        total: count(),
        revenue:
          sql<number>`coalesce(sum(${sales.total}) filter (where ${sales.status} = 'completed'), 0)`.mapWith(
            Number,
          ),
        refundedAmount:
          sql<number>`coalesce(sum(${sales.total}) filter (where ${sales.status} = 'refunded'), 0)`.mapWith(
            Number,
          ),
        refundedCount:
          sql<number>`count(*) filter (where ${sales.status} = 'refunded')`.mapWith(Number),
      })
      .from(sales)
      .leftJoin(customers, customerJoin)
      .where(where),
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        createdAt: sales.createdAt,
        customerName: customers.name,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
        total: sales.total,
        taxNumber: taxInvoices.number,
      })
      .from(sales)
      .leftJoin(customers, customerJoin)
      .leftJoin(taxInvoices, and(eq(taxInvoices.saleId, sales.id), eq(taxInvoices.pharmacyId, pharmacy.id)))
      .where(where)
      .orderBy(desc(sales.createdAt), desc(sales.invoiceNumber))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const filtered = Boolean(q || status || datesGiven);
  const emptyTitle = filtered ? t("common.noResults") : fallback ? t("sales.emptyToday") : t("sales.empty");

  return (
    <>
      <PageHeader title={t("sales.title")} description={t("sales.description")}>
        <Link href="/pos" className={buttonClass()}>
          <Plus />
          {t("sales.newSale")}
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("sales.statCount")} value={f.number(stats.total)} icon={Receipt} />
        <StatCard
          label={t("sales.statRevenue")}
          value={f.money(stats.revenue)}
          hint={t("sales.statRevenueHint")}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label={t("sales.statRefunded")}
          value={f.money(stats.refundedAmount)}
          hint={t("sales.statRefundedHint", { count: f.number(stats.refundedCount) })}
          icon={Undo2}
          tone="warning"
        />
      </div>

      <Toolbar>
        <SearchInput placeholder={t("sales.searchPlaceholder")} />
        <FilterSelect
          param="status"
          aria-label={t("common.status")}
          options={[
            { value: "", label: t("sales.allStatuses") },
            ...SALE_STATUSES.map((s) => ({ value: s, label: t(SALE_STATUS_LABEL[s]) })),
          ]}
        />
        {/* Keyed on the default so the inputs show it again when it comes or goes. */}
        <DateFilter
          key={`from-${fallback}`}
          param="from"
          label={t("sales.dateFrom")}
          fallback={fallback ?? undefined}
          max={to ?? undefined}
        />
        <DateFilter
          key={`to-${fallback}`}
          param="to"
          label={t("sales.dateTo")}
          fallback={fallback ?? undefined}
          min={from ?? undefined}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={emptyTitle}
          hint={filtered ? undefined : t("sales.emptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("sales.invoice")}</TH>
                <TH>{t("sales.dateTime")}</TH>
                <TH>{t("sales.customer")}</TH>
                <TH>{t("sales.paymentMethod")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="text-right">{t("sales.total")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((sale) => (
                <TR key={sale.id}>
                  <TD>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {sale.invoiceNumber}
                    </Link>
                    {sale.taxNumber && (
                      <Badge tone="info" className="ml-2" title={sale.taxNumber}>
                        {t("taxReceipt.badge")}
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{f.dateTime(sale.createdAt)}</TD>
                  <TD>
                    {sale.customerName ?? (
                      <span className="text-muted-foreground">{t("sales.walkIn")}</span>
                    )}
                  </TD>
                  <TD>{t(PAYMENT_METHOD_LABEL[sale.paymentMethod])}</TD>
                  <TD>
                    <Badge tone={sale.status === "completed" ? "success" : "warning"}>
                      {t(SALE_STATUS_LABEL[sale.status])}
                    </Badge>
                  </TD>
                  <TD
                    className={cn(
                      "text-right font-medium tabular-nums",
                      sale.status === "refunded" && "text-muted-foreground line-through",
                    )}
                  >
                    {f.money(sale.total)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(stats.total)} />
        </>
      )}
    </>
  );
}
