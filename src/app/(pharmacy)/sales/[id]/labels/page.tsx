import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { customers, saleItems, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { pageTitle } from "@/lib/metadata";
import { requiredId } from "@/lib/validation";
import { LabelsView } from "../../../_labels/labels-view";

export const generateMetadata = pageTitle("dispensing.title");

/** The dispensing labels of a completed sale (also to reprint them later). */
export default async function SaleLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const [sp, t, db] = await Promise.all([searchParams, getT(), getDb()]);

  // The sale must belong to the current branch, like its receipt.
  const [row] = await db
    .select({ sale: sales, customerName: customers.name })
    .from(sales)
    .leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale } = row;

  const items = await db
    .select({ productId: saleItems.productId, quantity: saleItems.quantity })
    .from(saleItems)
    .where(eq(saleItems.saleId, sale.id))
    .orderBy(asc(saleItems.productName), asc(saleItems.id));

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t("dispensing.title")}
          description={t("dispensing.description", { invoice: sale.invoiceNumber })}
        >
          <Link href={`/sales/${sale.id}`} className={buttonClass({ variant: "ghost" })}>
            <ArrowLeft />
            {t("dispensing.back")}
          </Link>
        </PageHeader>
      </div>
      <LabelsView
        searchParams={sp}
        items={items}
        saleId={sale.id}
        date={sale.createdAt}
        defaultPatientName={row.customerName ?? ""}
      />
    </>
  );
}
