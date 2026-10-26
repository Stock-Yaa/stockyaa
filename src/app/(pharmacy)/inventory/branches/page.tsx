import { and, asc, count, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { Boxes, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { batches, products } from "@/db/schema";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { notExpired } from "@/lib/stock";
import { cn } from "@/lib/utils";

export const generateMetadata = pageTitle("nav.stockByBranch");

/**
 * Sellable stock of every active product in each active branch, for admins:
 * shows where a product runs short and which branch could send some.
 * Quantities at or below the product's reorder level are highlighted.
 */
export default async function StockByBranchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, pharmacy, branches } = await requirePharmacy();
  if (!canSwitchBranch(user)) notFound();
  const [t, f, db, params] = await Promise.all([
    getT(),
    getFormat(pharmacy),
    getDb(),
    searchParams,
  ]);
  const page = parsePage(params.page);
  const today = todayInTimezone(pharmacy.timezone);

  const pattern = params.q ? likePattern(params.q) : null;
  const where = and(
    eq(products.pharmacyId, pharmacy.id),
    eq(products.isActive, true),
    pattern
      ? or(
          ilike(products.name, pattern),
          ilike(products.genericName, pattern),
          ilike(products.barcode, pattern),
        )
      : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(products).where(where),
    db
      .select({
        id: products.id,
        name: products.name,
        strength: products.strength,
        unit: products.unit,
        reorderLevel: products.reorderLevel,
      })
      .from(products)
      .where(where)
      .orderBy(asc(products.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const stockRows =
    rows.length === 0
      ? []
      : await db
          .select({
            productId: batches.productId,
            branchId: batches.branchId,
            qty: sql<number>`sum(${batches.quantity})`.mapWith(Number),
          })
          .from(batches)
          .where(
            and(
              eq(batches.pharmacyId, pharmacy.id),
              inArray(batches.productId, rows.map((r) => r.id)),
              gt(batches.quantity, 0),
              notExpired(today),
            ),
          )
          .groupBy(batches.productId, batches.branchId);
  const qty = new Map(stockRows.map((r) => [`${r.productId}:${r.branchId}`, r.qty]));

  return (
    <>
      <PageHeader
        title={t("inventory.byBranchTitle")}
        description={t("inventory.byBranchDescription")}
      >
        {branches.length > 1 && (
          <Link href="/transfers/new" className={buttonClass()}>
            <Send />
            {t("transfers.new")}
          </Link>
        )}
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("inventory.byBranchSearch")} />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={params.q ? t("common.noResults") : t("inventory.byBranchEmpty")}
          hint={params.q ? t("common.noResultsHint") : undefined}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("inventory.product")}</TH>
                {branches.map((b) => (
                  <TH key={b.id} className="text-right whitespace-nowrap">
                    {b.name}
                  </TH>
                ))}
                <TH className="text-right">{t("inventory.byBranchTotal")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((product) => {
                const perBranch = branches.map((b) => qty.get(`${product.id}:${b.id}`) ?? 0);
                const sum = perBranch.reduce((a, b) => a + b, 0);
                return (
                  <TR key={product.id}>
                    <TD>
                      <span className="font-medium">
                        {[product.name, product.strength].filter(Boolean).join(" ")}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">{product.unit}</span>
                    </TD>
                    {perBranch.map((value, index) => (
                      <TD
                        key={branches[index].id}
                        className={cn(
                          "text-right tabular-nums",
                          value === 0
                            ? "text-destructive"
                            : value <= product.reorderLevel && "font-medium text-warning",
                        )}
                      >
                        {f.number(value)}
                      </TD>
                    ))}
                    <TD className="text-right font-medium tabular-nums">{f.number(sum)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">{t("inventory.byBranchLegend")}</p>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
