import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Trash2, Users } from "lucide-react";
import Link from "next/link";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { customers, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { deleteCustomer } from "./actions";
import { CustomerFormButton } from "./customer-form";

export const generateMetadata = pageTitle("customers.title");

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const db = await getDb();

  const pattern = q ? likePattern(q) : null;
  const where = and(
    eq(customers.pharmacyId, pharmacy.id),
    pattern
      ? or(
          ilike(customers.name, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.email, pattern),
        )
      : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(customers).where(where),
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  // Completed sales per customer on this page, in every branch (customers are
  // shared by all branches); refunded sales are not counted.
  const stats =
    rows.length === 0
      ? []
      : await db
          .select({
            customerId: sales.customerId,
            salesCount: count(),
            totalSpent: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
          })
          .from(sales)
          .where(
            and(
              eq(sales.pharmacyId, pharmacy.id),
              eq(sales.status, "completed"),
              inArray(
                sales.customerId,
                rows.map((customer) => customer.id),
              ),
            ),
          )
          .groupBy(sales.customerId);
  const statsByCustomer = new Map(stats.map((row) => [row.customerId, row]));

  return (
    <>
      <PageHeader title={t("customers.title")} description={t("customers.description")}>
        <CustomerFormButton />
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("customers.searchPlaceholder")} />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? t("common.noResults") : t("customers.empty")}
          hint={q ? t("common.noResultsHint") : t("customers.emptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.name")}</TH>
                <TH>{t("common.phone")}</TH>
                <TH>{t("common.email")}</TH>
                <TH className="text-right">{t("customers.salesCount")}</TH>
                <TH className="text-right">{t("customers.totalSpent")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((customer) => {
                const customerStats = statsByCustomer.get(customer.id);
                return (
                  <TR key={customer.id}>
                    <TD className="font-medium">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-primary hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </TD>
                    <TD>{customer.phone ?? "—"}</TD>
                    <TD>{customer.email ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {f.number(customerStats?.salesCount)}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {f.money(customerStats?.totalSpent)}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <CustomerFormButton customer={customer} />
                        <ConfirmButton
                          action={deleteCustomer.bind(null, customer.id)}
                          body={t("customers.deleteBody")}
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.delete")}
                        >
                          <Trash2 />
                        </ConfirmButton>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
