import { and, count, desc, eq, max, sql } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Pagination } from "@/components/ui/list-controls";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { customers, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { listBranches } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PRICE_LEVEL_LABEL } from "@/lib/price-labels";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { requiredId } from "@/lib/validation";
import { CustomerFormButton } from "../customer-form";

export const generateMetadata = pageTitle("customers.title");

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  if (!requiredId.safeParse(id).success) notFound();
  const db = await getDb();

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.pharmacyId, pharmacy.id)))
    .limit(1);
  if (!customer) notFound();

  // Customers are shared by all branches, so their history covers every
  // branch's sales, not only the current branch's.
  const customerSales = and(
    eq(sales.pharmacyId, pharmacy.id),
    eq(sales.customerId, customer.id),
  );
  const [[stats], [{ total }], rows, allBranches] = await Promise.all([
    // Headline numbers count completed sales only; refunded ones are left out.
    db
      .select({
        salesCount: count(),
        totalSpent: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
        lastPurchaseAt: max(sales.createdAt),
      })
      .from(sales)
      .where(and(customerSales, eq(sales.status, "completed"))),
    db.select({ total: count() }).from(sales).where(customerSales),
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        createdAt: sales.createdAt,
        status: sales.status,
        total: sales.total,
        branchId: sales.branchId,
      })
      .from(sales)
      .where(customerSales)
      .orderBy(desc(sales.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    // Including inactive branches, whose past sales are still listed.
    listBranches(db, pharmacy.id),
  ]);
  const branchName = new Map(allBranches.map((b) => [b.id, b.name]));
  const showBranch = allBranches.length > 1;

  const contact = [
    { label: t("common.phone"), value: customer.phone },
    { label: t("common.email"), value: customer.email },
    { label: t("common.address"), value: customer.address },
    { label: t("customers.priceLevel"), value: t(PRICE_LEVEL_LABEL[customer.priceLevel]) },
    {
      label: t("taxReceipt.customerTaxId"),
      value: customer.taxId
        ? `${customer.taxId}${customer.taxBranch ? ` · ${customer.taxBranch === "00000" ? t("taxReceipt.headOffice") : t("taxReceipt.branchNo", { code: customer.taxBranch })}` : ""}`
        : null,
    },
    { label: t("common.notes"), value: customer.notes },
    { label: t("customers.customerSince"), value: f.date(customer.createdAt) },
  ];

  return (
    <>
      <PageHeader title={customer.name}>
        <Link href="/customers" className={buttonClass({ variant: "outline" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
        <CustomerFormButton customer={customer} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("customers.totalSpent")}
          value={f.money(stats.totalSpent)}
          hint={t(showBranch ? "customers.completedAllBranches" : "customers.completedOnly")}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label={t("customers.salesCount")}
          value={f.number(stats.salesCount)}
          hint={t(showBranch ? "customers.completedAllBranches" : "customers.completedOnly")}
          icon={Receipt}
        />
        <StatCard
          label={t("customers.lastPurchase")}
          value={
            stats.lastPurchaseAt ? f.date(stats.lastPurchaseAt) : t("customers.noPurchaseYet")
          }
          icon={CalendarClock}
          tone="info"
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("customers.contact")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {contact.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="mt-0.5 break-words whitespace-pre-line">{row.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold">{t("customers.salesHistory")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("customers.noSales")}
          hint={t("customers.noSalesHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("customers.invoice")}</TH>
                <TH>{t("common.date")}</TH>
                {showBranch && <TH>{t("branches.current")}</TH>}
                <TH>{t("common.status")}</TH>
                <TH className="text-right">{t("common.total")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((sale) => (
                <TR key={sale.id}>
                  <TD className="font-medium">
                    {/* Receipts open in their own branch only. */}
                    {sale.branchId === branch.id ? (
                      <Link href={`/sales/${sale.id}`} className="text-primary hover:underline">
                        {sale.invoiceNumber}
                      </Link>
                    ) : (
                      <span title={t("customers.otherBranchReceipt")}>{sale.invoiceNumber}</span>
                    )}
                  </TD>
                  <TD>{f.dateTime(sale.createdAt)}</TD>
                  {showBranch && <TD>{branchName.get(sale.branchId) ?? "—"}</TD>}
                  <TD>
                    {sale.status === "completed" ? (
                      <Badge tone="success">{t("customers.statusCompleted")}</Badge>
                    ) : (
                      <Badge tone="muted">{t("customers.statusRefunded")}</Badge>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{f.money(sale.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
