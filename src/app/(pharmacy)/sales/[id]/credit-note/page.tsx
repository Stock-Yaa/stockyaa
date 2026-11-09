import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { creditNotes, sales, taxInvoices } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { bahtText } from "@/lib/baht-text";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { requiredId } from "@/lib/validation";
import { amountBeforeVat } from "@/lib/vat";
import { PrintButton } from "../print-button";
import {
  A4_PAGE_CSS,
  BuyerBlock,
  DocumentMeta,
  DocumentPaper,
  LinesTable,
  SellerBlock,
  Signatures,
  TotalsList,
  both,
  documentLines,
  en,
  saleVatRate,
  th,
} from "../tax-document";

export const generateMetadata = pageTitle("taxReceipt.creditNoteTitle");

/**
 * The printable credit note (ใบลดหนี้) of a refunded sale, as an original and
 * a copy: it refers to the tax receipt it cancels and credits its whole value
 * (refunds are whole sales), with the VAT on it.
 */
export default async function CreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const { print } = await searchParams;
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const [row] = await db
    .select({ sale: sales, tax: taxInvoices, credit: creditNotes })
    .from(sales)
    .innerJoin(taxInvoices, and(eq(taxInvoices.saleId, sales.id), eq(taxInvoices.pharmacyId, pharmacy.id)))
    .innerJoin(creditNotes, and(eq(creditNotes.taxInvoiceId, taxInvoices.id), eq(creditNotes.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale, tax, credit } = row;
  const lines = await documentLines(db, sale.id);

  const before = amountBeforeVat(sale);
  // The full value is credited: the correct value is 0 and the difference is all of it.
  const totals: [string, string, boolean?][] = [
    [both("taxReceipt.originalValue"), f.money(before)],
    [both("taxReceipt.correctValue"), f.money(0)],
    [both("taxReceipt.differenceValue"), f.money(before)],
    [both("taxReceipt.vat", { rate: f.number(saleVatRate(sale, pharmacy)) }), f.money(sale.tax)],
    [both("taxReceipt.creditTotal"), f.money(sale.total), true],
  ];

  const document = (copy: "original" | "copy") => (
    <DocumentPaper key={copy} copy={copy}>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <SellerBlock pharmacy={pharmacy} branch={branch} />
        <div className="text-right">
          <p className="text-lg font-bold">{th("taxReceipt.creditNoteDocument")}</p>
          <p className="font-semibold tracking-wide uppercase">{en("taxReceipt.creditNoteDocument")}</p>
          <DocumentMeta
            rows={[
              [both("taxReceipt.number"), credit.number],
              [both("taxReceipt.date"), f.date(credit.createdAt)],
              [both("taxReceipt.refTaxInvoice"), tax.number],
              [both("taxReceipt.refTaxInvoiceDate"), f.date(sale.createdAt)],
            ]}
          />
        </div>
      </header>

      <BuyerBlock buyer={tax} />
      <LinesTable lines={lines} f={f} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p>
            <span className="text-muted-foreground">{both("taxReceipt.creditReason")}:</span> {credit.reason}
          </p>
          {pharmacy.currency === "THB" && (
            <p className="rounded-md bg-muted px-3 py-2 font-medium">({bahtText(sale.total)})</p>
          )}
        </div>
        <TotalsList rows={totals} />
      </div>

      <Signatures keys={["taxReceipt.approvedBy", "taxReceipt.receivedCredit"]} />
    </DocumentPaper>
  );

  return (
    <>
      <style>{A4_PAGE_CSS}</style>
      <PageHeader title={t("taxReceipt.creditNoteTitle")} description={credit.number}>
        <Link href={`/sales/${sale.id}`} className={buttonClass({ variant: "ghost" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
        <PrintButton auto={print === "1"} />
      </PageHeader>
      {document("original")}
      {document("copy")}
    </>
  );
}
