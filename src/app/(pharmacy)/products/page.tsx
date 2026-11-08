import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import { Archive, ArchiveRestore, Pill, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { todayInTimezone } from "@/lib/dates";
import { pageTitle } from "@/lib/metadata";
import { photosOf } from "@/lib/product-images";
import { getSellableStock } from "@/lib/stock";
import { deleteProduct, setProductActive } from "./actions";
import { CategoryManagerButton } from "./category-manager";
import { ProductFormButton } from "./product-form";
import { ProductThumb } from "@/components/product-thumb";

export const generateMetadata = pageTitle("products.title");

/** `?category=` value for products without a category. */
const UNCATEGORISED = "none";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const { q, category, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const db = await getDb();

  const [categoryRows, stock] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        productCount: count(products.id),
      })
      .from(categories)
      .leftJoin(
        products,
        and(eq(products.categoryId, categories.id), eq(products.pharmacyId, pharmacy.id)),
      )
      .where(eq(categories.pharmacyId, pharmacy.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.name)),
    // Products are pharmacy-wide; the stock column is the current branch.
    getSellableStock(db, branchScope(branch), todayInTimezone(pharmacy.timezone)),
  ]);
  const categoryOptions = categoryRows.map(({ id, name }) => ({ id, name }));

  // Only ids of this pharmacy's categories are accepted from the URL.
  const selectedCategory = categoryRows.find((c) => c.id === category);
  const pattern = q ? likePattern(q) : null;
  const where = and(
    eq(products.pharmacyId, pharmacy.id),
    // Active products unless the filter says otherwise.
    status === "all" ? undefined : eq(products.isActive, status !== "archived"),
    category === UNCATEGORISED
      ? isNull(products.categoryId)
      : selectedCategory
        ? eq(products.categoryId, selectedCategory.id)
        : undefined,
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
      .select({ product: products, categoryName: categories.name })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(asc(products.name), asc(products.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const filtered = Boolean(q || category || status);
  const photos = await photosOf(db, pharmacy.id, rows.map((r) => r.product.id));

  return (
    <>
      <PageHeader title={t("products.title")} description={t("products.description")}>
        <CategoryManagerButton categories={categoryRows} />
        <ProductFormButton categories={categoryOptions} />
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("products.searchPlaceholder")} />
        <FilterSelect
          param="category"
          aria-label={t("products.filterCategory")}
          options={[
            { value: "", label: t("products.allCategories") },
            ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
            { value: UNCATEGORISED, label: t("products.uncategorised") },
          ]}
        />
        <FilterSelect
          param="status"
          aria-label={t("products.filterStatus")}
          options={[
            { value: "", label: t("products.statusActive") },
            { value: "archived", label: t("products.statusArchived") },
            { value: "all", label: t("products.statusAll") },
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={filtered ? t("common.noResults") : t("products.empty")}
          hint={filtered ? t("common.noResultsHint") : t("products.emptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("products.product")}</TH>
                <TH>{t("products.category")}</TH>
                <TH className="text-right">{t("products.salePrice")}</TH>
                <TH>{t("products.stock")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ product, categoryName }) => {
                const details = [product.genericName, product.strength, product.dosageForm]
                  .filter(Boolean)
                  .join(" · ");
                const sellable = stock.get(product.id) ?? 0;
                return (
                  <TR key={product.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <ProductThumb photoId={photos.get(product.id)?.[0]?.id ?? null} label={t("products.noPhoto")} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.name}</span>
                            {product.requiresPrescription && (
                              <Badge tone="info" title={t("products.rxHint")}>
                                {t("products.rx")}
                              </Badge>
                            )}
                          </div>
                          {details && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{details}</p>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD>{categoryName ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {f.money(product.salePrice)}
                      {product.memberPrice !== null && (
                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                          {t("products.memberShort")} {f.money(product.memberPrice)}
                        </p>
                      )}
                      {product.staffPrice !== null && (
                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                          {t("products.staffShort")} {f.money(product.staffPrice)}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap tabular-nums">
                          {f.number(sellable)}{" "}
                          <span className="text-muted-foreground">{product.unit}</span>
                        </span>
                        {sellable === 0 ? (
                          <Badge tone="danger">{t("products.outOfStock")}</Badge>
                        ) : (
                          sellable <= product.reorderLevel && (
                            <Badge tone="warning">{t("products.lowStock")}</Badge>
                          )
                        )}
                      </div>
                    </TD>
                    <TD>
                      {product.isActive ? (
                        <Badge tone="success">{t("products.statusActive")}</Badge>
                      ) : (
                        <Badge tone="muted">{t("products.statusArchived")}</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <ProductFormButton
                          product={product}
                          categories={categoryOptions}
                          photos={photos.get(product.id) ?? []}
                        />
                        {product.isActive ? (
                          <ConfirmButton
                            action={setProductActive.bind(null, product.id, false)}
                            title={t("products.archiveTitle")}
                            body={t("products.archiveBody")}
                            confirmLabel={t("products.archive")}
                            destructive={false}
                            variant="ghost"
                            size="icon"
                            aria-label={t("products.archive")}
                          >
                            <Archive />
                          </ConfirmButton>
                        ) : (
                          <ConfirmButton
                            action={setProductActive.bind(null, product.id, true)}
                            title={t("products.restoreTitle")}
                            body={t("products.restoreBody")}
                            confirmLabel={t("products.restore")}
                            destructive={false}
                            variant="ghost"
                            size="icon"
                            aria-label={t("products.restore")}
                          >
                            <ArchiveRestore />
                          </ConfirmButton>
                        )}
                        <ConfirmButton
                          action={deleteProduct.bind(null, product.id)}
                          title={t("products.deleteTitle")}
                          body={t("products.deleteBody")}
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
