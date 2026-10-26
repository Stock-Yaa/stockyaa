"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { batches, categories, products, purchaseItems, saleItems } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { productSchema } from "@/lib/product-input";
import { addBatch } from "@/lib/stock";
import { formToObject, optionalId, requiredId, requiredText } from "@/lib/validation";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-error";

/** Pages that list products or their stock. */
function revalidateProductPages() {
  revalidatePath("/products");
  revalidatePath("/inventory");
}

/**
 * Creates a product, or updates it when the form carries an `id`. Products
 * are pharmacy-wide; a new product with an opening quantity also gets its
 * first batch, in the current branch.
 */
export async function saveProduct(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();

  const parsed = productSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, unit, openingQuantity, openingBatchNumber, openingExpiryDate, ...rest } =
    parsed.data;
  const values = { ...rest, unit: unit ?? "pcs" };
  // Only opening stock is branch data; editing a product works from any branch.
  if (!id && openingQuantity > 0 && branchChanged(formData, branch)) {
    return { ok: false, message: t("branches.changedElsewhere") };
  }
  const db = await getDb();

  if (values.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.id, values.categoryId), eq(categories.pharmacyId, pharmacy.id)),
      )
      .limit(1);
    if (!category) {
      return { ok: false, fieldErrors: { categoryId: t("products.categoryMissing") } };
    }
  }

  if (id) {
    const updated = await db
      .update(products)
      .set(values)
      .where(and(eq(products.id, id), eq(products.pharmacyId, pharmacy.id)))
      .returning({ id: products.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  } else {
    await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({ ...values, pharmacyId: pharmacy.id })
        .returning({ id: products.id });
      if (openingQuantity > 0) {
        await addBatch(tx, {
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          productId: product.id,
          quantity: openingQuantity,
          costPrice: values.costPrice,
          batchNumber: openingBatchNumber,
          expiryDate: openingExpiryDate,
          type: "opening",
          userId: user.id,
        });
      }
    });
  }

  revalidateProductPages();
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/** Archives (`isActive` false) or restores a product. */
export async function setProductActive(id: string, isActive: boolean): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  const updated = await db
    .update(products)
    .set({ isActive })
    .where(and(eq(products.id, parsedId.data), eq(products.pharmacyId, pharmacy.id)))
    .returning({ id: products.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  revalidateProductPages();
  return { ok: true, message: t(isActive ? "products.restored" : "products.archived") };
}

/**
 * Deletes a product that has never been stocked, sold or purchased. Anything
 * with history has to be archived instead so reports and receipts stay intact.
 */
export async function deleteProduct(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };
  const productId = parsedId.data;
  const db = await getDb();

  let outcome: "deleted" | "notFound" | "inUse";
  try {
    outcome = await db.transaction(async (tx) => {
      // Lock the row so stock or sales cannot be added to it while we check.
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.pharmacyId, pharmacy.id)))
        .for("update");
      if (!product) return "notFound";

      // Products are pharmacy-wide, so stock in any branch blocks deleting.
      const [batch] = await tx
        .select({ id: batches.id })
        .from(batches)
        .where(and(eq(batches.productId, productId), eq(batches.pharmacyId, pharmacy.id)))
        .limit(1);
      // Sale and purchase lines carry no pharmacy_id; the product above is ours.
      const [saleItem] = await tx
        .select({ id: saleItems.id })
        .from(saleItems)
        .where(eq(saleItems.productId, productId))
        .limit(1);
      const [purchaseItem] = await tx
        .select({ id: purchaseItems.id })
        .from(purchaseItems)
        .where(eq(purchaseItems.productId, productId))
        .limit(1);
      if (batch || saleItem || purchaseItem) return "inUse";

      await tx
        .delete(products)
        .where(and(eq(products.id, productId), eq(products.pharmacyId, pharmacy.id)));
      return "deleted";
    });
  } catch (error) {
    // sale_items and purchase_items restrict deleting a product they point at.
    if (!isForeignKeyViolation(error)) throw error;
    outcome = "inUse";
  }

  if (outcome === "notFound") return { ok: false, message: t("common.notFound") };
  if (outcome === "inUse") return { ok: false, message: t("products.deleteBlocked") };
  revalidateProductPages();
  return { ok: true, message: t("common.deleted") };
}

const categorySchema = z.object({
  id: optionalId,
  name: requiredText(100),
});

/** Creates a category, or renames it when the form carries an `id`. */
export async function saveCategory(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, name } = parsed.data;
  const db = await getDb();
  const duplicate: ActionState = {
    ok: false,
    fieldErrors: { name: t("products.categoryExists") },
  };

  // The unique index is case-sensitive; also refuse names that differ only by case.
  const [sameName] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.pharmacyId, pharmacy.id),
        eq(sql`lower(${categories.name})`, name.toLowerCase()),
        id ? ne(categories.id, id) : undefined,
      ),
    )
    .limit(1);
  if (sameName) return duplicate;

  try {
    if (id) {
      const updated = await db
        .update(categories)
        .set({ name })
        .where(and(eq(categories.id, id), eq(categories.pharmacyId, pharmacy.id)))
        .returning({ id: categories.id });
      if (updated.length === 0) return { ok: false, message: t("common.notFound") };
    } else {
      await db.insert(categories).values({ pharmacyId: pharmacy.id, name });
    }
  } catch (error) {
    // Someone else created the same name between the check and the write.
    if (isUniqueViolation(error)) return duplicate;
    throw error;
  }

  revalidatePath("/products");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/** Deletes a category; its products stay and become uncategorised. */
export async function deleteCategory(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  await db
    .delete(categories)
    .where(and(eq(categories.id, parsedId.data), eq(categories.pharmacyId, pharmacy.id)));
  revalidatePath("/products");
  return { ok: true, message: t("common.deleted") };
}
