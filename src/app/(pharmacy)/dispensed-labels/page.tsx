import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Tags } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/card";
import { Pagination, SearchInput } from "@/components/ui/list-controls";
import { EmptyState, PageHeader, Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { dispensedLabels, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, likePattern, pageCountOf, parsePage } from "@/lib/pagination";

export const generateMetadata = pageTitle("dispensing.recordsTitle");

type Printed = {
  drugName?: string;
  strength?: string;
  quantity?: string;
  directions?: string;
  warnings?: string[];
  secondSticker?: string[];
};

/**
 * The record of dispensing labels printed in this branch (Thai GPP: what was
 * dispensed, to whom, by which pharmacist). It holds patient names, so only
 * admins and managers see it, and it is never part of a report.
 */
export default async function DispensedLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, pharmacy, branch } = await requirePharmacy();
  if (user.role !== "admin" && user.role !== "manager") notFound();
  const { q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const pattern = q ? likePattern(q) : null;
  const where = and(
    inScope(dispensedLabels, branchScope(branch)),
    pattern
      ? or(
          ilike(dispensedLabels.patientName, pattern),
          ilike(sql`${dispensedLabels.printed}->>'drugName'`, pattern),
        )
      : undefined,
  );
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(dispensedLabels).where(where),
    db
      .select({ label: dispensedLabels, invoice: sales.invoiceNumber })
      .from(dispensedLabels)
      .leftJoin(sales, and(eq(sales.id, dispensedLabels.saleId), eq(sales.pharmacyId, pharmacy.id)))
      .where(where)
      .orderBy(desc(dispensedLabels.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return (
    <>
      <PageHeader title={t("dispensing.recordsTitle")} description={t("dispensing.recordsDescription")} />
      <Toolbar>
        <SearchInput placeholder={t("dispensing.recordsSearch")} />
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={q ? t("common.noResults") : t("dispensing.recordsEmpty")}
          hint={q ? t("common.noResultsHint") : t("dispensing.recordsEmptyHint")}
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>{t("common.date")}</TH>
                <TH>{t("dispensing.patientName")}</TH>
                <TH>{t("dispensing.medicine")}</TH>
                <TH>{t("dispensing.indication")}</TH>
                <TH>{t("dispensing.pharmacist")}</TH>
                <TH>{t("dispensing.recordsSale")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ label, invoice }) => {
                const printed = label.printed as Printed;
                return (
                  <TR key={label.id}>
                    <TD className="whitespace-nowrap">{f.dateTime(label.createdAt)}</TD>
                    <TD className="font-medium">{label.patientName}</TD>
                    <TD>
                      <details>
                        <summary className="cursor-pointer">
                          {printed.drugName} {printed.strength}
                          <Badge tone="muted" className="ml-2 uppercase">
                            {label.language}
                          </Badge>
                        </summary>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <p>
                            {t("dispensing.quantity")}: {printed.quantity}
                          </p>
                          <p className="whitespace-pre-line">{printed.directions}</p>
                          {[...(printed.warnings ?? []), ...(printed.secondSticker ?? [])].map((w, i) => (
                            <p key={i}>⚠ {w}</p>
                          ))}
                        </div>
                      </details>
                    </TD>
                    <TD>{label.indication}</TD>
                    <TD className="whitespace-nowrap">
                      {label.pharmacistName}
                      <span className="block text-xs text-muted-foreground">{label.pharmacistLicense}</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {invoice && label.saleId ? (
                        <Link href={`/sales/${label.saleId}`} className="text-primary hover:underline">
                          {invoice}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("dispensing.recordsBeforeSale")}</span>
                      )}
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
