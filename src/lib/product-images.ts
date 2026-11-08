import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { productImages } from "@/db/schema";

/*
 * Product photos. Files live in private storage (./storage); the browser
 * loads them through /products/images/<id>, which checks the pharmacy.
 */

import type { PhotoRef } from "./product-images-client";

export { MAX_PRODUCT_PHOTOS, productImageUrl, type PhotoRef } from "./product-images-client";

/** The photos of these products, main photo first, then oldest first. */
export async function photosOf(
  db: DbOrTx,
  pharmacyId: string,
  productIds: string[],
): Promise<Map<string, PhotoRef[]>> {
  const out = new Map<string, PhotoRef[]>();
  if (productIds.length === 0) return out;
  const rows = await db
    .select({ id: productImages.id, productId: productImages.productId, isMain: productImages.isMain })
    .from(productImages)
    .where(and(eq(productImages.pharmacyId, pharmacyId), inArray(productImages.productId, productIds)))
    .orderBy(desc(productImages.isMain), asc(productImages.createdAt));
  for (const row of rows) {
    const list = out.get(row.productId) ?? [];
    list.push({ id: row.id, isMain: row.isMain });
    out.set(row.productId, list);
  }
  return out;
}

/** Each product's main photo id (products without photos are absent). */
export async function mainPhotos(db: DbOrTx, pharmacyId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: productImages.id, productId: productImages.productId })
    .from(productImages)
    .where(and(eq(productImages.pharmacyId, pharmacyId), eq(productImages.isMain, true)));
  return new Map(rows.map((r) => [r.productId, r.id]));
}
