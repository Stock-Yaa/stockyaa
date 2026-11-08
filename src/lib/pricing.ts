import type { PriceLevel, Product } from "@/db/schema";

/*
 * Selling price levels. Client-safe: the POS screen and createSale both use
 * priceFor, so the price shown is the price charged.
 */

/** The schema's levels, without bundling the schema into the browser. */
export const PRICE_LEVEL_OPTIONS = ["regular", "member", "staff"] as const satisfies readonly PriceLevel[];

export type ProductPrices = Pick<Product, "salePrice" | "memberPrice" | "staffPrice">;

/** What one unit costs at `level`; a level without its own price falls back to the regular price. */
export function priceFor(product: ProductPrices, level: PriceLevel): number {
  if (level === "member") return product.memberPrice ?? product.salePrice;
  if (level === "staff") return product.staffPrice ?? product.salePrice;
  return product.salePrice;
}

export function isPriceLevel(value: unknown): value is PriceLevel {
  return typeof value === "string" && (PRICE_LEVEL_OPTIONS as readonly string[]).includes(value);
}
