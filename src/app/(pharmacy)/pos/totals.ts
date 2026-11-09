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
  /** The open session of this till's drawer; required to take cash. */
  shiftId: string | null;
  /** Buyer details when the customer asked for a full tax receipt. */
  taxBuyer: {
    buyerName: string;
    buyerTaxId: string;
    buyerAddress: string;
    buyerBranch: string;
    saveToCustomer: boolean;
    customerId: string | null;
  } | null;
};

export type SaleTotals = {
  subtotal: number;
  /** Discount actually applied: never negative, never more than the subtotal. */
  discount: number;
  /** The VAT inside the total (prices include VAT). */
  tax: number;
  total: number;
};

/**
 * Totals of a sale. The POS screen uses this for display and createSale uses
 * it as the source of truth, so the two always agree. Prices include VAT:
 * the total is the subtotal after discount, and `vatRate` (a percentage, 0
 * when the pharmacy is not VAT-registered; see vatRateOf) gives the VAT
 * contained in it.
 */
export function computeSaleTotals(
  lines: { quantity: number; unitPrice: number }[],
  discount: number,
  vatRate: number,
): SaleTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + round2(line.quantity * line.unitPrice), 0),
  );
  const applied = Number.isFinite(discount)
    ? Math.min(Math.max(round2(discount), 0), subtotal)
    : 0;
  const total = round2(subtotal - applied);
  const tax = vatRate > 0 ? round2((total * vatRate) / (100 + vatRate)) : 0;
  return { subtotal, discount: applied, tax, total };
}
