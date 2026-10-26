import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { PURCHASE_STATUSES, purchaseItems, purchases, suppliers } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { PURCHASE_STATUS_LABELS, PurchaseStatusBadge } from "./status-badge";

export const generateMetadata = pageTitle("purchases.title");

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { q, status: statusParam, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const status = PURCHASE_STATUSES.find((s) => s === statusParam);
  const db = await getDb();

  const pattern = q ? likePattern(q) : null;
  // The current branch's purchases; suppliers are shared by every branch.
  const where = and(
    inScope(purchases, branchScope(branch)),
    status ? eq(purchases.status, status) : undefined,
    pattern
      ? or(
          ilike(purchases.reference, pattern),
          ilike(purchases.supplierInvoice, pattern),
          ilike(suppliers.name, pattern),
        )
      : undefined,
  );
  const supplierJoin = and(
    eq(suppliers.id, purchases.supplierId),
    eq(suppliers.pharmacyId, pharmacy.id),
  );

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(purchases)
      .leftJoin(suppliers, supplierJoin)
      .where(where),
    db
      .select({
        id: purchases.id,
        reference: purchases.reference,
        supplierName: suppliers.name,
        supplierInvoice: purchases.supplierInvoice,
        orderedAt: purchases.orderedAt,
        status: purchases.status,
        total: purchases.total,
      })
      .from(purchases)
      .leftJoin(suppliers, supplierJoin)
      .where(where)
      .orderBy(desc(purchases.orderedAt), desc(purchases.reference))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  // Number of lines on each purchase shown on this page.
  const itemCounts =
    rows.length === 0
      ? []
      : await db
          .select({ purchaseId: purchaseItems.purchaseId, items: count() })
          .from(purchaseItems)
          .where(
            inArray(
              purchaseItems.purchaseId,
              rows.map((purchase) => purchase.id),
            ),
          )
          .groupBy(purchaseItems.purchaseId);
  const itemCountByPurchase = new Map(itemCounts.map((row) => [row.purchaseId, row.items]));

  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader title={t("purchases.title")} description={t("purchases.description")}>
        <Link href="/purchases/new" className={buttonClass()}>
          <Plus />
          {t("purchases.new")}
        </Link>
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("purchases.searchPlaceholder")} />
        <FilterSelect
          param="status"
          aria-label={t("common.status")}
          options={[
            { value: "", label: t("purchases.allStatuses") },
            ...PURCHASE_STATUSES.map((value) => ({
              value,
              label: t(PURCHASE_STATUS_LABELS[value]),
            })),
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtered ? t("common.noResults") : t("purchases.empty")}
          hint={filtered ? t("common.noResultsHint") : t("purchases.emptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("purchases.reference")}</TH>
                <TH>{t("purchases.supplier")}</TH>
                <TH>{t("purchases.supplierInvoice")}</TH>
                <TH>{t("purchases.orderedAt")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="text-right">{t("common.total")}</TH>
                <TH className="text-right">{t("purchases.itemCount")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((purchase) => (
                <TR key={purchase.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="text-primary hover:underline"
                    >
                      {purchase.reference}
                    </Link>
                  </TD>
                  <TD>{purchase.supplierName ?? "—"}</TD>
                  <TD>{purchase.supplierInvoice ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{f.date(purchase.orderedAt)}</TD>
                  <TD>
                    <PurchaseStatusBadge status={purchase.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{f.money(purchase.total)}</TD>
                  <TD className="text-right tabular-nums">
                    {f.number(itemCountByPurchase.get(purchase.id))}
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
