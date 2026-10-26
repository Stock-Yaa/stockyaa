import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { Trash2, Truck } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";
import { deleteSupplier } from "./actions";
import { SupplierFormButton } from "./supplier-form";

export const generateMetadata = pageTitle("suppliers.title");

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const { q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const db = await getDb();

  const pattern = q ? likePattern(q) : null;
  const where = and(
    eq(suppliers.pharmacyId, pharmacy.id),
    pattern
      ? or(
          ilike(suppliers.name, pattern),
          ilike(suppliers.contactPerson, pattern),
          ilike(suppliers.phone, pattern),
        )
      : undefined,
  );

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(suppliers).where(where),
    db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(asc(suppliers.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return (
    <>
      <PageHeader title={t("suppliers.title")} description={t("suppliers.description")}>
        <SupplierFormButton />
      </PageHeader>

      <Toolbar>
        <SearchInput placeholder={t("suppliers.searchPlaceholder")} />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={q ? t("common.noResults") : t("suppliers.empty")}
          hint={q ? t("common.noResultsHint") : t("suppliers.emptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.name")}</TH>
                <TH>{t("suppliers.contactPerson")}</TH>
                <TH>{t("common.phone")}</TH>
                <TH>{t("common.email")}</TH>
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((supplier) => (
                <TR key={supplier.id}>
                  <TD className="font-medium">{supplier.name}</TD>
                  <TD>{supplier.contactPerson ?? "—"}</TD>
                  <TD>{supplier.phone ?? "—"}</TD>
                  <TD>{supplier.email ?? "—"}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <SupplierFormButton supplier={supplier} />
                      <ConfirmButton
                        action={deleteSupplier.bind(null, supplier.id)}
                        body={t("suppliers.deleteBody")}
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 />
                      </ConfirmButton>
                    </div>
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
