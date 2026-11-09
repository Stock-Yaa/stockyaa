/*
 * The buyer's ID on a full tax receipt: a 13-digit Thai tax ID (or ID card
 * number), or a passport number for a foreign buyer (e.g. for their
 * insurance). Client-safe.
 */

export type BuyerIdKind = "tax_id" | "passport";

export const BUYER_ID_KINDS = ["tax_id", "passport"] as const satisfies readonly BuyerIdKind[];

const TAX_ID = /^\d{13}$/;
// Letters and digits; passports of most countries have 6 to 9, a little slack either way.
const PASSPORT = /^[A-Z0-9]{5,20}$/;

/** Spaces and dashes removed; passport letters upper-cased. */
export function normaliseBuyerId(value: string, kind: BuyerIdKind): string {
  const compact = value.replace(/[\s-]/g, "");
  return kind === "passport" ? compact.toUpperCase() : compact;
}

export function isBuyerId(value: string, kind: BuyerIdKind): boolean {
  return (kind === "passport" ? PASSPORT : TAX_ID).test(normaliseBuyerId(value, kind));
}
