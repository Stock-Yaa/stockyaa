import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { saleItems, sales, taxInvoices } from "@/db/schema";
import { createTranslator, getMessages, type MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { bahtText } from "@/lib/baht-text";
import { branchScope, inScope } from "@/lib/branches";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { HEAD_OFFICE } from "@/lib/tax-invoice";
import { round2 } from "@/lib/utils";
import { requiredId } from "@/lib/validation";
import { PAYMENT_METHOD_LABEL } from "../../labels";
import { PrintButton } from "../print-button";

export const generateMetadata = pageTitle("taxReceipt.title");

const PRINT_PAGE_CSS = "@page { size: A4; margin: 12mm; }";
// On paper the document is black on white whatever the screen theme.
const PRINT_COLOURS =
  "print:[--card:#fff] print:[--card-foreground:#000] print:[--foreground:#000] " +
  "print:[--muted-foreground:#333] print:[--border:#000] print:[--muted:#eee]";

// A Thai tax invoice carries Thai wording; every label is printed in Thai and English.
const th = createTranslator(getMessages("th"));
const en = createTranslator(getMessages("en"));
const both = (key: MessageKey, vars?: Record<string, string | number>) => {
  const thai = th(key, vars);
  const english = en(key, vars);
  return thai === english ? thai : `${thai} / ${english}`;
};

type Line = { name: string; quantity: number; unitPrice: number; total: number };

/** "Head office" or "Branch 00001", in both languages; null when not given. */
function branchText(code: string | null): string | null {
  if (!code) return null;
  return code === HEAD_OFFICE ? both("taxReceipt.headOffice") : both("taxReceipt.branchNo", { code });
}

/**
 * The printable full tax receipt (ใบเสร็จรับเงิน/ใบกำกับภาษี) of a sale: seller
 * and buyer with their tax IDs and branches, the items, VAT and the amount in
 * Thai words.
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
    .select({ sale: sales, tax: taxInvoices })
    .from(sales)
    .innerJoin(taxInvoices, and(eq(taxInvoices.saleId, sales.id), eq(taxInvoices.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale, tax } = row;

  const items = await db
    .select({
      productId: saleItems.productId,
      productName: saleItems.productName,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, sale.id))
    .orderBy(asc(saleItems.productName), asc(saleItems.id));
  // One line per product and price, even when it was sold from several batches.
  const lines = new Map<string, Line>();
  for (const item of items) {
    const key = `${item.productId}:${item.unitPrice}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += item.quantity;
      line.total = round2(line.total + item.total);
    } else {
      lines.set(key, { name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total });
    }
  }

  const taxable = round2(sale.subtotal - sale.discount);
  // The rate the sale was charged at, even if Settings changed since.
  const vatRate = taxable > 0 ? round2((sale.tax / taxable) * 100) : pharmacy.taxRate;
  const sellerAddress = branch.address || pharmacy.address;
  const sellerPhone = branch.phone || pharmacy.phone;
  const sellerBranch = branchText(branch.taxBranchCode);
  const missing: MessageKey[] = [];
  if (!pharmacy.taxId) missing.push("taxReceipt.missingTaxId");
  if (!branch.taxBranchCode) missing.push("taxReceipt.missingBranchCode");

  const totals: [string, string, boolean?][] = [[both("taxReceipt.subtotal"), f.money(sale.subtotal)]];
  if (sale.discount > 0) totals.push([both("taxReceipt.discount"), `−${f.money(sale.discount)}`]);
  totals.push(
    [both("taxReceipt.beforeVat"), f.money(taxable)],
    [both("taxReceipt.vat", { rate: f.number(vatRate) }), f.money(sale.tax)],
    [both("taxReceipt.grandTotal"), f.money(sale.total), true],
  );

  return (
    <>
      <style>{PRINT_PAGE_CSS}</style>
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

      <article
        className={`relative mx-auto w-full max-w-[210mm] rounded-xl border border-border bg-card p-8 text-sm text-card-foreground shadow-xs print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none ${PRINT_COLOURS}`}
      >
        {sale.status === "refunded" && (
          <p className="mb-4 rounded-md border-2 border-destructive px-3 py-2 text-center font-semibold text-destructive">
            {both("taxReceipt.cancelled")}
            {sale.refundedAt && ` · ${f.dateTime(sale.refundedAt)}`}
          </p>
        )}

        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-0.5">
            <p className="text-lg font-semibold">{pharmacy.name}</p>
            {sellerBranch && <p>{sellerBranch}</p>}
            {sellerAddress && <p className="whitespace-pre-line">{sellerAddress}</p>}
            {sellerPhone && (
              <p>
                {both("taxReceipt.phone")}: {sellerPhone}
              </p>
            )}
            <p>
              {both("taxReceipt.taxId")}: <span className="tabular-nums">{pharmacy.taxId ?? "—"}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{th("taxReceipt.documentTitle")}</p>
            <p className="font-semibold tracking-wide uppercase">{en("taxReceipt.documentTitle")}</p>
            <dl className="mt-3 space-y-0.5">
              {(
                [
                  [both("taxReceipt.number"), tax.number],
                  [both("taxReceipt.date"), f.date(sale.createdAt)],
                  [both("taxReceipt.receiptRef"), sale.invoiceNumber],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-end gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-border p-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{both("taxReceipt.buyer")}</p>
          <p className="font-semibold">{tax.buyerName}</p>
          <p className="whitespace-pre-line">{tax.buyerAddress}</p>
          <p className="mt-1">
            {both("taxReceipt.taxId")}: <span className="tabular-nums">{tax.buyerTaxId}</span>
            {branchText(tax.buyerBranch) && <> · {branchText(tax.buyerBranch)}</>}
          </p>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-y border-border text-left text-xs text-muted-foreground">
              <th className="w-10 py-2 font-medium">{both("taxReceipt.itemNo")}</th>
              <th className="py-2 font-medium">{both("taxReceipt.description")}</th>
              <th className="py-2 text-right font-medium">{both("taxReceipt.quantity")}</th>
              <th className="py-2 text-right font-medium">{both("taxReceipt.unitPrice")}</th>
              <th className="py-2 text-right font-medium">{both("taxReceipt.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {[...lines.values()].map((line, index) => (
              <tr key={index} className="border-b border-border/60 align-top">
                <td className="py-2 tabular-nums">{index + 1}</td>
                <td className="py-2 pr-3">{line.name}</td>
                <td className="py-2 text-right tabular-nums">{f.number(line.quantity)}</td>
                <td className="py-2 text-right tabular-nums">{f.money(line.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{f.money(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

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
          <dl className="w-full max-w-xs space-y-1">
            {totals.map(([label, value, strong]) => (
              <div
                key={label}
                className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-1 text-base font-bold" : ""}`}
              >
                <dt>{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-xs">
          {(["taxReceipt.receivedBy", "taxReceipt.collector"] as const).map((key) => (
            <div key={key}>
              <div className="mx-auto mb-1 w-48 border-b border-dashed border-border" />
              <p>{both(key)}</p>
              <p className="mt-3 text-muted-foreground">{both("taxReceipt.date")} ____/____/______</p>
            </div>
          ))}
        </footer>
      </article>
    </>
  );
}
