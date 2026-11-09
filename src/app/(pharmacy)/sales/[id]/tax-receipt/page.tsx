import { and, eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { creditNotes, sales, taxInvoices } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { bahtText } from "@/lib/baht-text";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { requiredId } from "@/lib/validation";
import { amountBeforeVat } from "@/lib/vat";
import { PAYMENT_METHOD_LABEL } from "../../labels";
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

export const generateMetadata = pageTitle("taxReceipt.title");

/**
 * The printable full tax receipt (ใบเสร็จรับเงิน/ใบกำกับภาษี) of a sale, as an
 * original and a copy: seller and buyer with their tax IDs and branches, the
 * items, VAT and the amount in Thai words.
 */
export default async function TaxReceiptPage({
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
    .select({ sale: sales, tax: taxInvoices, creditNumber: creditNotes.number })
    .from(sales)
    .innerJoin(taxInvoices, and(eq(taxInvoices.saleId, sales.id), eq(taxInvoices.pharmacyId, pharmacy.id)))
    .leftJoin(creditNotes, and(eq(creditNotes.taxInvoiceId, taxInvoices.id), eq(creditNotes.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale, tax, creditNumber } = row;
  const lines = await documentLines(db, sale.id);

  const missing: MessageKey[] = [];
  if (!pharmacy.taxId) missing.push("taxReceipt.missingTaxId");
  if (!branch.taxBranchCode) missing.push("taxReceipt.missingBranchCode");

  const totals: [string, string, boolean?][] = [[both("taxReceipt.subtotal"), f.money(sale.subtotal)]];
  if (sale.discount > 0) totals.push([both("taxReceipt.discount"), `−${f.money(sale.discount)}`]);
  totals.push(
    [both("taxReceipt.beforeVat"), f.money(amountBeforeVat(sale))],
    [both("taxReceipt.vat", { rate: f.number(saleVatRate(sale, pharmacy)) }), f.money(sale.tax)],
    [both("taxReceipt.grandTotal"), f.money(sale.total), true],
  );

  const document = (copy: "original" | "copy") => (
    <DocumentPaper key={copy} copy={copy}>
      {sale.status === "refunded" && (
        <p className="mb-4 rounded-md border-2 border-destructive px-3 py-2 text-center font-semibold text-destructive">
          {creditNumber ? both("taxReceipt.cancelledByCredit", { number: creditNumber }) : both("taxReceipt.cancelled")}
          {sale.refundedAt && ` · ${f.dateTime(sale.refundedAt)}`}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <SellerBlock pharmacy={pharmacy} branch={branch} />
        <div className="text-right">
          <p className="text-lg font-bold">{th("taxReceipt.documentTitle")}</p>
          <p className="font-semibold tracking-wide uppercase">{en("taxReceipt.documentTitle")}</p>
          <DocumentMeta
            rows={[
              [both("taxReceipt.number"), tax.number],
              [both("taxReceipt.date"), f.date(sale.createdAt)],
              [both("taxReceipt.receiptRef"), sale.invoiceNumber],
            ]}
          />
        </div>
      </header>

      <BuyerBlock buyer={tax} />
      <LinesTable lines={lines} f={f} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          {pharmacy.currency === "THB" && (
            <p className="rounded-md bg-muted px-3 py-2 font-medium">({bahtText(sale.total)})</p>
          )}
          <p className="text-muted-foreground">
            {both("taxReceipt.paidBy")}: {th(PAYMENT_METHOD_LABEL[sale.paymentMethod])} /{" "}
            {en(PAYMENT_METHOD_LABEL[sale.paymentMethod])}
          </p>
        </div>
        <TotalsList rows={totals} />
      </div>

      <Signatures keys={["taxReceipt.receivedBy", "taxReceipt.collector"]} />
    </DocumentPaper>
  );

  return (
    <>
      <style>{A4_PAGE_CSS}</style>
      <PageHeader title={t("taxReceipt.title")} description={tax.number}>
        <Link href={`/sales/${sale.id}`} className={buttonClass({ variant: "ghost" })}>
          <ArrowLeft />
          {t("common.back")}
        </Link>
        <PrintButton auto={print === "1"} />
      </PageHeader>

      {missing.length > 0 && (
        <div className="mx-auto mb-4 flex max-w-[210mm] gap-2 rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning print:hidden">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            {missing.map((key) => (
              <p key={key}>{t(key)}</p>
            ))}
          </div>
        </div>
      )}

      {document("original")}
      {document("copy")}
    </>
  );
}
