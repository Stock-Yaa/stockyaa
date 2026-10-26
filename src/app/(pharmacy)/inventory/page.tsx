import { and, asc, count, eq, gt, gte, ilike, lt, lte, or, sql } from "drizzle-orm";
import { Boxes, CalendarClock, CalendarX, History, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, StatCard } from "@/components/ui/card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { batches, products } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { addDays, todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { notExpired } from "@/lib/stock";
import { round2 } from "@/lib/utils";
import { AddStockButton } from "./add-stock-form";
import { AdjustStockButton } from "./adjust-stock-form";

export const generateMetadata = pageTitle("inventory.title");

// `?filter=` values; no value means every batch that has stock.
const FILTERS = ["low", "expiring", "expired", "out"] as const;
type StockFilter = (typeof FILTERS)[number] | "in-stock";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { q, filter: filterParam, page: pageParam } = await searchParams;
  const filter: StockFilter = FILTERS.find((value) => value === filterParam) ?? "in-stock";
  const page = parsePage(pageParam);
  const offset = (page - 1) * PAGE_SIZE;
  const pattern = q ? likePattern(q) : null;
  const db = await getDb();

  const today = todayInTimezone(pharmacy.timezone);
  const alertUntil = addDays(today, pharmacy.expiryAlertDays);

  // Every figure on this page is for the branch the user is working in.
  const ofBranch = inScope(batches, branchScope(branch));
  const hasStock = gt(batches.quantity, 0);
  const isExpired = lt(batches.expiryDate, today);
  const isExpiringSoon = and(
    gte(batches.expiryDate, today),
    lte(batches.expiryDate, alertUntil),
  );

  // Units per product that can still be sold (same rule as getSellableStock),
  // as a subquery so "low stock" can be filtered and paged in the database.
  const sellable = db
    .select({
      productId: batches.productId,
      quantity: sql<number>`sum(${batches.quantity})`.as("sellable_quantity"),
    })
    .from(batches)
    .where(and(ofBranch, hasStock, notExpired(today)))
    .groupBy(batches.productId)
    .as("sellable");
  const sellableQuantity = sql<number>`coalesce(${sellable.quantity}, 0)`.mapWith(Number);
  const isLowStock = and(
    eq(products.pharmacyId, pharmacy.id),
    eq(products.isActive, true),
    sql`${sellableQuantity} <= ${products.reorderLevel}`,
  );

  const [[stats], [{ lowStockCount }], activeProducts] = await Promise.all([
    db
      .select({
        stockValue: sql<number>`coalesce(sum(${batches.quantity} * ${batches.costPrice}) filter (where ${notExpired(today)}), 0)`.mapWith(
          Number,
        ),
        expiringSoon: sql<number>`count(*) filter (where ${isExpiringSoon})`.mapWith(Number),
        expired: sql<number>`count(*) filter (where ${isExpired})`.mapWith(Number),
      })
      .from(batches)
      .where(and(ofBranch, hasStock)),
    db
      .select({ lowStockCount: count() })
      .from(products)
      .leftJoin(sellable, eq(sellable.productId, products.id))
      .where(isLowStock),
    db
      .select({
        id: products.id,
        name: products.name,
        strength: products.strength,
        unit: products.unit,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(and(eq(products.pharmacyId, pharmacy.id), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ]);

  // A stat card shows its filter; clicking the active one goes back to all stock.
  const cardFilter = (value: (typeof FILTERS)[number]) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter !== value) params.set("filter", value);
    const query = params.toString();
    return { href: query ? `/inventory?${query}` : "/inventory", active: filter === value };
  };

  const header = (
    <>
      <PageHeader title={t("inventory.title")} description={t("inventory.description")}>
        <Link href="/inventory/movements" className={buttonClass({ variant: "outline" })}>
          <History />
          {t("inventory.movements")}
        </Link>
        <AddStockButton products={activeProducts} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("inventory.statStockValue")}
          value={f.money(round2(stats.stockValue))}
          hint={t("inventory.statStockValueHint")}
          icon={Wallet}
        />
        <StatCard
          label={t("inventory.statLowStock")}
          value={f.number(lowStockCount)}
          hint={t("inventory.statLowStockHint")}
          icon={TriangleAlert}
          tone="warning"
          {...cardFilter("low")}
        />
        <StatCard
          label={t("inventory.statExpiring")}
          value={f.number(stats.expiringSoon)}
          hint={t("inventory.statExpiringHint", { days: pharmacy.expiryAlertDays })}
          icon={CalendarClock}
          tone="info"
          {...cardFilter("expiring")}
        />
        <StatCard
          label={t("inventory.statExpired")}
          value={f.number(stats.expired)}
          hint={t("inventory.statExpiredHint")}
          icon={CalendarX}
          tone="danger"
          {...cardFilter("expired")}
        />
      </div>

      <Toolbar>
        <SearchInput placeholder={t("inventory.searchPlaceholder")} />
        <FilterSelect
          param="filter"
          aria-label={t("inventory.filterLabel")}
          options={[
            { value: "", label: t("inventory.filterInStock") },
            { value: "low", label: t("inventory.filterLow") },
            { value: "expiring", label: t("inventory.filterExpiring") },
            { value: "expired", label: t("inventory.filterExpired") },
            { value: "out", label: t("inventory.filterOut") },
          ]}
        />
      </Toolbar>
    </>
  );

  const nothingFound = (
    <EmptyState
      icon={Boxes}
      title={q || filter !== "in-stock" ? t("common.noResults") : t("inventory.empty")}
      hint={q || filter !== "in-stock" ? t("inventory.noMatchHint") : t("inventory.emptyHint")}
    />
  );

  // Low stock is about a product's total in the branch, so that view lists products.
  if (filter === "low") {
    const where = and(isLowStock, pattern ? ilike(products.name, pattern) : undefined);
    const [[{ total }], rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(products)
        .leftJoin(sellable, eq(sellable.productId, products.id))
        .where(where),
      db
        .select({
          id: products.id,
          name: products.name,
          strength: products.strength,
          dosageForm: products.dosageForm,
          unit: products.unit,
          reorderLevel: products.reorderLevel,
          sellable: sellableQuantity,
        })
        .from(products)
        .leftJoin(sellable, eq(sellable.productId, products.id))
        .where(where)
        .orderBy(asc(sellableQuantity), asc(products.name), asc(products.id))
        .limit(PAGE_SIZE)
        .offset(offset),
    ]);

    return (
      <>
        {header}
        {rows.length === 0 ? (
          nothingFound
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("inventory.product")}</TH>
                  <TH className="text-right">{t("inventory.sellableStock")}</TH>
                  <TH className="text-right">{t("inventory.reorderLevel")}</TH>
                  <TH>{t("common.status")}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <ProductCell
                        name={row.name}
                        details={[row.strength, row.dosageForm]}
                      />
                    </TD>
                    <TD className="text-right tabular-nums">
                      {f.number(row.sellable)}{" "}
                      <span className="text-muted-foreground">{row.unit}</span>
                    </TD>
                    <TD className="text-right tabular-nums">{f.number(row.reorderLevel)}</TD>
                    <TD>
                      {row.sellable === 0 ? (
                        <Badge tone="danger">{t("inventory.outOfStock")}</Badge>
                      ) : (
                        <Badge tone="warning">{t("inventory.lowStock")}</Badge>
                      )}
                    </TD>
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

  const where = and(
    ofBranch,
    {
      "in-stock": hasStock,
      expiring: and(hasStock, isExpiringSoon),
      expired: and(hasStock, isExpired),
      out: eq(batches.quantity, 0),
    }[filter],
    pattern
      ? or(ilike(products.name, pattern), ilike(batches.batchNumber, pattern))
      : undefined,
  );
  const soonestExpiry = sql`${batches.expiryDate} asc nulls last`;
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(where),
    db
      .select({
        id: batches.id,
        batchNumber: batches.batchNumber,
        expiryDate: batches.expiryDate,
        quantity: batches.quantity,
        costPrice: batches.costPrice,
        productName: products.name,
        strength: products.strength,
        dosageForm: products.dosageForm,
        unit: products.unit,
        productActive: products.isActive,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(where)
      .orderBy(
        // The expiry views read best with the most urgent batch first.
        ...(filter === "expiring" || filter === "expired"
          ? [soonestExpiry, asc(products.name)]
          : [asc(products.name), soonestExpiry]),
        asc(batches.createdAt),
        asc(batches.id),
      )
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  return (
    <>
      {header}
      {rows.length === 0 ? (
        nothingFound
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("inventory.product")}</TH>
                <TH>{t("inventory.batchNumber")}</TH>
                <TH>{t("inventory.expiry")}</TH>
                <TH className="text-right">{t("common.quantity")}</TH>
                <TH className="text-right">{t("inventory.cost")}</TH>
                <TH className="text-right">{t("inventory.stockValue")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const expired = row.expiryDate !== null && row.expiryDate < today;
                const expiringSoon =
                  row.expiryDate !== null && !expired && row.expiryDate <= alertUntil;
                return (
                  <TR key={row.id}>
                    <TD>
                      <ProductCell
                        name={row.productName}
                        details={[row.strength, row.dosageForm]}
                        badge={
                          row.productActive ? undefined : (
                            <Badge tone="muted">{t("inventory.archivedProduct")}</Badge>
                          )
                        }
                      />
                    </TD>
                    <TD>{row.batchNumber ?? "—"}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap">{f.day(row.expiryDate)}</span>
                        {expired && <Badge tone="danger">{t("inventory.expired")}</Badge>}
                        {expiringSoon && (
                          <Badge tone="warning">{t("inventory.expiringSoon")}</Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular-nums">
                      {f.number(row.quantity)}{" "}
                      <span className="text-muted-foreground">{row.unit}</span>
                    </TD>
                    <TD className="text-right tabular-nums">{f.money(row.costPrice)}</TD>
                    <TD className="text-right tabular-nums">
                      {f.money(round2(row.quantity * row.costPrice))}
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        <AdjustStockButton
                          batch={{
                            id: row.id,
                            productName: row.productName,
                            batchNumber: row.batchNumber,
                            quantity: row.quantity,
                            unit: row.unit,
                          }}
                        />
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

/** Product name with its strength / dosage form underneath. */
function ProductCell({
  name,
  details,
  badge,
}: {
  name: string;
  details: (string | null)[];
  badge?: React.ReactNode;
}) {
  const detail = details.filter(Boolean).join(" · ");
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-medium">{name}</span>
        {badge}
      </div>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </>
  );
}
