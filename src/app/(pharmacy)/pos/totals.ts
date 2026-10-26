import type { Sale } from "@/db/schema";
import { round2 } from "@/lib/utils";

export type PaymentMethod = Sale["paymentMethod"];

/** What the POS screen sends to createSale. Prices and totals are never sent. */
export type SalePayload = {
  /** Branch the terminal was rendered for; the sale is refused if it is no longer active. */
  branchId: string;
  items: { productId: string; quantity: number }[];
  customerId: string | null;
  discount: number;
  paymentMethod: PaymentMethod;
  /** Cash handed over; ignored for card and transfer. */
  amountPaid: number;
};

export type SaleTotals = {
  subtotal: number;
  /** Discount actually applied: never negative, never more than the subtotal. */
  discount: number;
  tax: number;
  total: number;
};

/**
 * Totals of a sale. The POS screen uses this for display and createSale uses
 * it as the source of truth, so the two always agree. `taxRate` is a
 * percentage charged on the subtotal after discount.
 */
export function computeSaleTotals(
  lines: { quantity: number; unitPrice: number }[],
  discount: number,
  taxRate: number,
): SaleTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + round2(line.quantity * line.unitPrice), 0),
  );
  const applied = Number.isFinite(discount)
    ? Math.min(Math.max(round2(discount), 0), subtotal)
    : 0;
  const taxable = round2(subtotal - applied);
  const tax = round2((taxable * taxRate) / 100);
  return { subtotal, discount: applied, tax, total: round2(taxable + tax) };
}
