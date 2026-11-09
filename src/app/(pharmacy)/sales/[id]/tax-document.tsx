import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { saleItems, type Branch, type BuyerIdType, type Pharmacy, type Sale } from "@/db/schema";
import { createTranslator, getMessages, type MessageKey } from "@/i18n/messages";
import type { Format } from "@/lib/format";
import { HEAD_OFFICE } from "@/lib/tax-invoice";
import { round2 } from "@/lib/utils";
import { amountBeforeVat } from "@/lib/vat";

/*
 * Shared parts of the A4 tax documents of a sale (full tax receipt and
 * credit note): Thai documents, so every label is printed in Thai and English.
 */

export const A4_PAGE_CSS = "@page { size: A4; margin: 12mm; }";

// On paper the document is black on white whatever the screen theme.
export const PRINT_COLOURS =
  "print:[--card:#fff] print:[--card-foreground:#000] print:[--foreground:#000] " +
  "print:[--muted-foreground:#333] print:[--border:#000] print:[--muted:#eee]";

export const th = createTranslator(getMessages("th"));
export const en = createTranslator(getMessages("en"));

/** A label in Thai and English ("ภาษี / Tax"), or once when both are the same. */
export const both = (key: MessageKey, vars?: Record<string, string | number>) => {
  const thai = th(key, vars);
  const english = en(key, vars);
  return thai === english ? thai : `${thai} / ${english}`;
};

/** "Head office" or "Branch 00001", in both languages; null when not given. */
export function branchText(code: string | null): string | null {
  if (!code) return null;
  return code === HEAD_OFFICE ? both("taxReceipt.headOffice") : both("taxReceipt.branchNo", { code });
}

/** Label of the buyer's ID: tax ID or passport number. */
export function buyerIdLabel(type: BuyerIdType): string {
  return both(type === "passport" ? "taxReceipt.passportNo" : "taxReceipt.taxId");
}

export type DocumentLine = { name: string; quantity: number; unitPrice: number; total: number };

/** The sale's items, one line per product and price even when sold from several batches. */
export async function documentLines(db: DbOrTx, saleId: string): Promise<DocumentLine[]> {
  const items = await db
    .select({
      productId: saleItems.productId,
      productName: saleItems.productName,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      total: saleItems.total,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId))
    .orderBy(asc(saleItems.productName), asc(saleItems.id));
  const lines = new Map<string, DocumentLine>();
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
  return [...lines.values()];
}

/**
 * The VAT rate a sale was charged at, worked out from its amounts so a later
 * change in Settings does not alter old documents.
 */
export function saleVatRate(sale: Pick<Sale, "total" | "tax">, pharmacy: Pick<Pharmacy, "taxRate">): number {
  const before = amountBeforeVat(sale);
  if (before <= 0 || sale.tax <= 0) return 0;
  const derived = (sale.tax / before) * 100;
  // Rounding to satang makes it 6.99 or 7.01; prefer the setting when it is that close.
  return Math.abs(derived - pharmacy.taxRate) < 0.1 ? pharmacy.taxRate : Math.round(derived * 10) / 10;
}

/** "Original" or "Copy" (ต้นฉบับ / สำเนา), printed at the top of each copy. */
export function CopyMark({ copy }: { copy: "original" | "copy" }) {
  return (
    <p className="absolute top-4 right-4 rounded border-2 border-foreground px-3 py-1 text-xs font-bold tracking-wide uppercase print:top-0 print:right-0">
      {both(copy === "original" ? "taxReceipt.original" : "taxReceipt.copy")}
    </p>
  );
}

/** The seller: pharmacy, branch (head office / branch no.), address, phone and tax ID. */
export function SellerBlock({ pharmacy, branch }: { pharmacy: Pharmacy; branch: Branch }) {
  const address = branch.address || pharmacy.address;
  const phone = branch.phone || pharmacy.phone;
  const sellerBranch = branchText(branch.taxBranchCode);
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-lg font-semibold">{pharmacy.name}</p>
      {sellerBranch && <p>{sellerBranch}</p>}
      {address && <p className="whitespace-pre-line">{address}</p>}
      {phone && (
        <p>
          {both("taxReceipt.phone")}: {phone}
        </p>
      )}
      <p>
        {both("taxReceipt.taxId")}: <span className="tabular-nums">{pharmacy.taxId ?? "—"}</span>
      </p>
    </div>
  );
}

/** The buyer's box. */
export function BuyerBlock({
  buyer,
}: {
  buyer: { buyerName: string; buyerAddress: string; buyerIdType: BuyerIdType; buyerTaxId: string; buyerBranch: string | null };
}) {
  return (
    <section className="mt-6 rounded-lg border border-border p-4">
      <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{both("taxReceipt.buyer")}</p>
      <p className="font-semibold">{buyer.buyerName}</p>
      <p className="whitespace-pre-line">{buyer.buyerAddress}</p>
      <p className="mt-1">
        {buyerIdLabel(buyer.buyerIdType)}: <span className="tabular-nums">{buyer.buyerTaxId}</span>
        {branchText(buyer.buyerBranch) && <> · {branchText(buyer.buyerBranch)}</>}
      </p>
    </section>
  );
}

/** The document's number lines, right-aligned under its title. */
export function DocumentMeta({ rows }: { rows: [label: string, value: string][] }) {
  return (
    <dl className="mt-3 space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-end gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The items table. */
export function LinesTable({ lines, f }: { lines: DocumentLine[]; f: Format }) {
  return (
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
        {lines.map((line, index) => (
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
  );
}

/** Amounts on the right; the last row (strong) is the total. */
export function TotalsList({ rows }: { rows: [label: string, value: string, strong?: boolean][] }) {
  return (
    <dl className="w-full max-w-xs space-y-1">
      {rows.map(([label, value, strong]) => (
        <div
          key={label}
          className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-1 text-base font-bold" : ""}`}
        >
          <dt>{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Two signature lines. */
export function Signatures({ keys }: { keys: readonly [MessageKey, MessageKey] }) {
  return (
    <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-xs">
      {keys.map((key) => (
        <div key={key}>
          <div className="mx-auto mb-1 w-48 border-b border-dashed border-border" />
          <p>{both(key)}</p>
          <p className="mt-3 text-muted-foreground">{both("taxReceipt.date")} ____/____/______</p>
        </div>
      ))}
    </footer>
  );
}

/** One paper copy: the card on screen, a page of its own when printed (the copy starts a new page). */
export function DocumentPaper({ copy, children }: { copy: "original" | "copy"; children: React.ReactNode }) {
  return (
    <article
      className={`relative mx-auto mb-6 w-full max-w-[210mm] rounded-xl border border-border bg-card p-8 pt-14 text-sm text-card-foreground shadow-xs print:mb-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:pt-10 print:shadow-none ${copy === "copy" ? "print:break-before-page" : ""} ${PRINT_COLOURS}`}
    >
      <CopyMark copy={copy} />
      {children}
    </article>
  );
}
