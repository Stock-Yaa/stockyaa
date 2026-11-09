import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page";
import { getDb } from "@/db";
import { creditNotes, customers, saleItems, sales, taxInvoices, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getDrawerState } from "@/lib/cash-drawer";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PRICE_LEVEL_LABEL } from "@/lib/price-labels";
import { HEAD_OFFICE, TAX_RECEIPT_DAYS, taxReceiptAllowed } from "@/lib/tax-invoice";
import { round2 } from "@/lib/utils";
import { requiredId } from "@/lib/validation";
import { amountBeforeVat } from "@/lib/vat";
import { refundSale } from "../actions";
import { PAYMENT_METHOD_LABEL } from "../labels";
import { PrintButton } from "./print-button";
import { saleVatRate } from "./tax-document";
import { IssueTaxReceiptButton } from "./tax-receipt-button";

export const generateMetadata = pageTitle("sales.receipt");


// Printed on the 80 mm receipt printer (72 mm printable); the paper size comes from its driver.
const PRINT_PAGE_CSS = "@page { margin: 4mm; }";

// On paper the receipt is always black on white, whatever the screen theme:
// the colour tokens are redefined for everything inside it when printing.
const PRINT_COLOURS =
  "print:[--card:#fff] print:[--card-foreground:#000] print:[--foreground:#000] " +
  "print:[--muted-foreground:#000] print:[--border:#000] print:[--destructive:#000]";

const DIVIDER = "my-3 border-t border-dashed border-border";

type ReceiptLine = { name: string; quantity: number; unitPrice: number; total: number };
type LabelledValue = [label: string, value: string];

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string | string[] }>;
}) {
  const { pharmacy, branch } = await requirePharmacy();
  const { id } = await params;
  if (!requiredId.safeParse(id).success) notFound();
  const { print } = await searchParams;
  const t = await getT();
  const f = await getFormat(pharmacy);
  const db = await getDb();

  const [row] = await db
    .select({
      sale: sales,
      customerName: customers.name,
      customerTaxIdType: customers.taxIdType,
      customerTaxId: customers.taxId,
      customerTaxBranch: customers.taxBranch,
      customerAddress: customers.address,
      cashierName: users.name,
      taxNumber: taxInvoices.number,
      creditNumber: creditNotes.number,
    })
    .from(sales)
    .leftJoin(
      customers,
      and(eq(sales.customerId, customers.id), eq(customers.pharmacyId, pharmacy.id)),
    )
    .leftJoin(users, and(eq(sales.userId, users.id), eq(users.pharmacyId, pharmacy.id)))
    .leftJoin(taxInvoices, and(eq(taxInvoices.saleId, sales.id), eq(taxInvoices.pharmacyId, pharmacy.id)))
    .leftJoin(creditNotes, and(eq(creditNotes.saleId, sales.id), eq(creditNotes.pharmacyId, pharmacy.id)))
    .where(and(eq(sales.id, id), inScope(sales, branchScope(branch))))
    .limit(1);
  if (!row) notFound();
  const { sale, customerName, cashierName, taxNumber, creditNumber } = row;
  // A VAT sale's receipt is an abbreviated tax invoice (ใบกำกับภาษีอย่างย่อ).
  const vatSale = sale.tax > 0 && sale.taxIncluded;
  const vatRate = saleVatRate(sale, pharmacy);

  // A cash refund is paid from this device's drawer, while its session is open.
  const drawer =
    sale.status === "completed" && sale.paymentMethod === "cash"
      ? await getDrawerState(db, branch, t("cashDrawer.defaultDrawerName"))
      : null;
  const refundShiftId =
    drawer?.shift && drawer.shift.countAttempts.length === 0 ? drawer.shift.id : null;

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

  // A product sold from several batches has one row per batch; the customer
  // sees a single line for it.
  const lines = new Map<string, ReceiptLine>();
  for (const item of items) {
    const key = `${item.productId}:${item.unitPrice}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += item.quantity;
      line.total = round2(line.total + item.total);
    } else {
      lines.set(key, {
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      });
    }
  }

  // The sale belongs to the current branch (filtered above). Its name is shown
  // under the pharmacy's unless it would only repeat it, as with a pharmacy
  // whose single branch carries its own name; its address and phone take
  // precedence over the pharmacy's.
  const sameName = (a: string, b: string) =>
    a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;
  const branchName = sameName(branch.name, pharmacy.name) ? null : branch.name;
  const address = branch.address || pharmacy.address;
  const phone = branch.phone || pharmacy.phone;

  const details: LabelledValue[] = [
    [t("sales.invoice"), sale.invoiceNumber],
    [t("common.date"), f.dateTime(sale.createdAt)],
    [t("sales.cashier"), cashierName ?? "—"],
    [t("sales.customer"), customerName ?? t("sales.walkIn")],
  ];
  if (sale.priceLevel !== "regular") {
    details.push([t("sales.priceLevel"), t(PRICE_LEVEL_LABEL[sale.priceLevel])]);
  }
  const totals: LabelledValue[] = [[t("sales.subtotal"), f.money(sale.subtotal)]];
  if (sale.discount > 0) totals.push([t("sales.discount"), `−${f.money(sale.discount)}`]);
  // Sales from before VAT-inclusive prices had their VAT added on top.
  if (sale.tax > 0 && !sale.taxIncluded) totals.push([t("sales.tax"), f.money(sale.tax)]);
  const vatLines: LabelledValue[] = vatSale
    ? [
        [t("sales.beforeVat"), f.money(amountBeforeVat(sale))],
        [t("sales.vatIncluded", { rate: f.number(vatRate) }), f.money(sale.tax)],
      ]
    : [];
  const payment: LabelledValue[] = [
    [t("sales.paymentMethod"), t(PAYMENT_METHOD_LABEL[sale.paymentMethod])],
    [t("sales.paid"), f.money(sale.amountPaid)],
    [t("sales.change"), f.money(sale.changeDue)],
  ];

  return (
    <>
      <style>{PRINT_PAGE_CSS}</style>

      <PageHeader title={sale.invoiceNumber} description={f.dateTime(sale.createdAt)}>
        <Link href="/sales" className={buttonClass({ variant: "ghost" })}>
          <ArrowLeft />
          {t("sales.backToSales")}
        </Link>
        {sale.status === "completed" && (
          <ConfirmButton
            action={refundSale.bind(null, sale.id, branch.id, refundShiftId)}
            title={t("sales.refundTitle")}
            body={
              sale.paymentMethod !== "cash"
                ? t("sales.refundBody")
                : refundShiftId
                  ? t("sales.refundBodyCash", { drawer: drawer?.drawer?.name ?? "" })
                  : t("sales.refundNeedsDrawer")
            }
            confirmLabel={t("sales.refund")}
            variant="outline"
          >
            <Undo2 />
            {t("sales.refund")}
          </ConfirmButton>
        )}
        {taxNumber ? (
          <Link href={`/sales/${sale.id}/tax-receipt`} className={buttonClass({ variant: "outline" })}>
            <FileText />
            {t("taxReceipt.view", { number: taxNumber })}
          </Link>
        ) : (
          sale.status === "completed" &&
          pharmacy.vatRegistered && (
            <IssueTaxReceiptButton
              saleId={sale.id}
              tooLate={!taxReceiptAllowed(sale.createdAt)}
              days={TAX_RECEIPT_DAYS}
              customer={
                customerName
                  ? {
                      name: customerName,
                      taxIdType: row.customerTaxIdType ?? "tax_id",
                      taxId: row.customerTaxId,
                      taxBranch: row.customerTaxBranch,
                      address: row.customerAddress,
                    }
                  : null
              }
            />
          )
        )}
        {creditNumber && (
          <Link href={`/sales/${sale.id}/credit-note`} className={buttonClass({ variant: "outline" })}>
            <FileText />
            {t("taxReceipt.viewCredit", { number: creditNumber })}
          </Link>
        )}
        <PrintButton auto={print === "1"} />
      </PageHeader>

      <article
        className={`mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-6 text-sm text-card-foreground shadow-xs print:max-w-[72mm] print:rounded-none print:border-0 print:p-0 print:text-xs print:shadow-none ${PRINT_COLOURS}`}
      >
        <header className="text-center">
          <p className="text-base font-semibold">{pharmacy.name}</p>
          {branchName && <p className="font-medium">{branchName}</p>}
          {address && <p className="whitespace-pre-line">{address}</p>}
          {phone && (
            <p>
              {t("sales.phone")} {phone}
            </p>
          )}
          {pharmacy.taxId && (
            <p>
              {t("sales.taxId")}: {pharmacy.taxId}
              {vatSale && branch.taxBranchCode && (
                <>
                  {" · "}
                  {branch.taxBranchCode === HEAD_OFFICE
                    ? t("taxReceipt.headOffice")
                    : t("taxReceipt.branchNo", { code: branch.taxBranchCode })}
                </>
              )}
            </p>
          )}
          {pharmacy.licenseNumber && (
            <p>
              {t("sales.license")}: {pharmacy.licenseNumber}
            </p>
          )}
          <p className="mt-3 font-semibold tracking-wide uppercase">
            {vatSale ? t("sales.abbTaxInvoice") : t("sales.receipt")}
          </p>
        </header>

        {sale.status === "refunded" && (
          <p className="mt-3 rounded-md border border-destructive px-2 py-1 text-center font-semibold text-destructive">
            {t("sales.statusRefunded")}
            {sale.refundedAt && (
              <span className="block font-normal">
                {t("sales.refundedOn", { date: f.dateTime(sale.refundedAt) })}
              </span>
            )}
          </p>
        )}

        <div className={DIVIDER} />
        <dl className="space-y-0.5">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className={DIVIDER} />
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 font-normal">{t("sales.item")}</th>
              <th className="pb-1 text-right font-normal">{t("sales.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {[...lines].map(([key, line]) => (
              <tr key={key} className="align-top">
                <td className="py-1 pr-3">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {f.number(line.quantity)} × {f.money(line.unitPrice)}
                  </p>
                </td>
                <td className="py-1 text-right whitespace-nowrap tabular-nums">
                  {f.money(line.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={DIVIDER} />
        <dl className="space-y-0.5">
          {totals.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-1 text-base font-semibold">
            <dt>{t("sales.total")}</dt>
            <dd className="tabular-nums">{f.money(sale.total)}</dd>
          </div>
          {vatLines.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-muted-foreground">
              <dt>{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className={DIVIDER} />
        <dl className="space-y-0.5">
          {payment.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {pharmacy.receiptFooter && (
          <>
            <div className={DIVIDER} />
            <p className="text-center whitespace-pre-line">{pharmacy.receiptFooter}</p>
          </>
        )}
      </article>
    </>
  );
}
