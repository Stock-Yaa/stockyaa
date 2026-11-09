import type { Pharmacy, PriceLevel, Product } from "@/db/schema";

/*
 * Selling price levels. Client-safe: the POS screen and createSale both use
 * priceFor, so the price shown is the price charged.
 */

/** The schema's levels, without bundling the schema into the browser. */
export const PRICE_LEVEL_OPTIONS = ["regular", "member", "staff"] as const satisfies readonly PriceLevel[];

export type ProductPrices = Pick<
  Product,
  "salePrice" | "memberPrice" | "staffPrice" | "memberDiscount" | "staffDiscount"
>;

/** The pharmacy's rules for products without their own member or staff price: percent off the regular price. */
export type PriceRules = Pick<Pharmacy, "memberDiscount" | "staffDiscount">;

export const percentOff = (price: number, percent: number | null) =>
  percent ? Math.round(price * (100 - percent)) / 100 : price;

/**
 * What one unit costs at `level`: the product's own member or staff price,
 * otherwise its own percent off the regular price, otherwise the pharmacy's
 * rule for that level, otherwise the regular price.
 */
export function priceFor(product: ProductPrices, level: PriceLevel, rules: PriceRules): number {
  if (level === "member") {
    return product.memberPrice ?? percentOff(product.salePrice, product.memberDiscount ?? rules.memberDiscount);
  }
  if (level === "staff") {
    return product.staffPrice ?? percentOff(product.salePrice, product.staffDiscount ?? rules.staffDiscount);
  }
  return product.salePrice;
}

export function isPriceLevel(value: unknown): value is PriceLevel {
  return typeof value === "string" && (PRICE_LEVEL_OPTIONS as readonly string[]).includes(value);
}
