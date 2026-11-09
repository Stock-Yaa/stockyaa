import type { Pharmacy } from "@/db/schema";

/*
 * VAT. Selling prices always include it; a pharmacy that is not
 * VAT-registered has none at all (and cannot issue tax receipts). Client-safe.
 */

/** The VAT percentage inside this pharmacy's prices: 0 when it is not VAT-registered. */
export function vatRateOf(pharmacy: Pick<Pharmacy, "vatRegistered" | "taxRate">): number {
  return pharmacy.vatRegistered ? pharmacy.taxRate : 0;
}

/**
 * The amount before VAT of a sale. Sales before VAT-inclusive pricing had
 * their VAT added on top, so total = before VAT + VAT holds for every sale.
 */
export function amountBeforeVat(sale: { total: number; tax: number }): number {
  return Math.round((sale.total - sale.tax) * 100) / 100;
}
