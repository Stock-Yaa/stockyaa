"use server";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { batches, categories, productImages, products, purchaseItems, saleItems } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { MAX_PRODUCT_PHOTOS } from "@/lib/product-images";
import { productSchema } from "@/lib/product-input";
import { StorageNotConfiguredError, deleteFile, putFile } from "@/lib/storage";
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
  const values = {
    ...rest,
    unit: unit ?? "pcs",
    // A fixed price wins over a percent; only one is kept.
    memberDiscount: rest.memberPrice === null ? rest.memberDiscount : null,
    staffDiscount: rest.staffPrice === null ? rest.staffDiscount : null,
  };
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

  // One barcode, one product: the till picks a product by its barcode. Bulk
  // import refuses a used barcode the same way.
  if (values.barcode) {
    const [taken] = await db
      .select({ name: products.name })
      .from(products)
      .where(
        and(
          eq(products.pharmacyId, pharmacy.id),
          eq(products.barcode, values.barcode),
          ...(id ? [ne(products.id, id)] : []),
        ),
      )
      .limit(1);
    if (taken) {
      return {
        ok: false,
        fieldErrors: { barcode: t("products.barcodeTaken", { name: taken.name }) },
      };
    }
  }

  let productId = id;
  if (id) {
    const updated = await db
      .update(products)
      .set(values)
      .where(and(eq(products.id, id), eq(products.pharmacyId, pharmacy.id)))
      .returning({ id: products.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  } else {
    productId = await db.transaction(async (tx) => {
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
      return product.id;
    });
  }

  revalidateProductPages();
  return { ok: true, message: t(id ? "common.updated" : "common.created"), id: productId ?? undefined };
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
  // Its photo files go once the product row (and with it their rows) is gone.
  let photoPaths: string[] = [];
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

      photoPaths = (
        await tx
          .select({ path: productImages.path })
          .from(productImages)
          .where(and(eq(productImages.productId, productId), eq(productImages.pharmacyId, pharmacy.id)))
      ).map((p) => p.path);
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
  await removeFiles(photoPaths);
  revalidateProductPages();
  return { ok: true, message: t("common.deleted") };
}

/** Deletes stored files; a failure only leaves an unused file behind. */
async function removeFiles(paths: string[]) {
  for (const path of paths) {
    try {
      await deleteFile(path);
    } catch (error) {
      console.error("Could not delete", path, error);
    }
  }
}

// Photos are shrunk in the browser first; this is the most the server takes.
const MAX_PHOTO_BYTES = 1_500_000;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Adds a photo to a product. The first photo becomes its main photo. Files
 * are stored under the pharmacy's own folder.
 */
export async function uploadProductPhoto(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const productId = requiredId.safeParse(formData.get("productId"));
  if (!productId.success) return { ok: false, message: t("common.notFound") };
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, message: t("products.photoMissing") };
  const extension = PHOTO_TYPES[photo.type];
  if (!extension || photo.size > MAX_PHOTO_BYTES) return { ok: false, message: t("products.photoInvalid") };

  const db = await getDb();
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId.data), eq(products.pharmacyId, pharmacy.id)))
    .limit(1);
  if (!product) return { ok: false, message: t("common.notFound") };
  const existing = await db.$count(
    productImages,
    and(eq(productImages.productId, product.id), eq(productImages.pharmacyId, pharmacy.id)),
  );
  if (existing >= MAX_PRODUCT_PHOTOS) {
    return { ok: false, message: t("products.photoLimit", { count: MAX_PRODUCT_PHOTOS }) };
  }

  const path = `${pharmacy.id}/products/${product.id}/${crypto.randomUUID()}.${extension}`;
  try {
    await putFile(path, new Uint8Array(await photo.arrayBuffer()), photo.type);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return { ok: false, message: t("cashDrawer.storageMissing") };
    console.error(error);
    return { ok: false, message: t("products.photoUploadFailed") };
  }
  await db.transaction(async (tx) => {
    // Lock the product so two uploads cannot both become the main photo.
    await tx.select({ id: products.id }).from(products).where(eq(products.id, product.id)).for("update");
    const main = await tx.$count(
      productImages,
      and(eq(productImages.productId, product.id), eq(productImages.isMain, true)),
    );
    await tx
      .insert(productImages)
      .values({ pharmacyId: pharmacy.id, productId: product.id, path, isMain: main === 0 });
  });
  revalidateProductPages();
  revalidatePath("/pos");
  return { ok: true, message: t("products.photoAdded") };
}

/** Makes one of a product's photos its main photo. */
export async function setMainPhoto(imageId: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(imageId).success) return { ok: false, message: t("common.notFound") };
  const db = await getDb();
  const done = await db.transaction(async (tx) => {
    const [image] = await tx
      .select({ productId: productImages.productId })
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.pharmacyId, pharmacy.id)));
    if (!image) return false;
    await tx.select({ id: products.id }).from(products).where(eq(products.id, image.productId)).for("update");
    // Clear the old main photo first: at most one may be main at any moment.
    await tx
      .update(productImages)
      .set({ isMain: false })
      .where(and(eq(productImages.productId, image.productId), eq(productImages.pharmacyId, pharmacy.id)));
    await tx
      .update(productImages)
      .set({ isMain: true })
      .where(and(eq(productImages.id, imageId), eq(productImages.pharmacyId, pharmacy.id)));
    return true;
  });
  if (!done) return { ok: false, message: t("common.notFound") };
  revalidateProductPages();
  revalidatePath("/pos");
  return { ok: true, message: t("products.mainPhotoSet") };
}

/** Deletes a photo; when it was the main photo, the next oldest takes its place. */
export async function deletePhoto(imageId: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(imageId).success) return { ok: false, message: t("common.notFound") };
  const db = await getDb();
  const removed = await db.transaction(async (tx) => {
    const [image] = await tx
      .delete(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.pharmacyId, pharmacy.id)))
      .returning({ productId: productImages.productId, path: productImages.path, isMain: productImages.isMain });
    if (!image) return null;
    if (image.isMain) {
      const [next] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, image.productId), eq(productImages.pharmacyId, pharmacy.id)))
        .orderBy(asc(productImages.createdAt))
        .limit(1);
      if (next) await tx.update(productImages).set({ isMain: true }).where(eq(productImages.id, next.id));
    }
    return image.path;
  });
  if (!removed) return { ok: false, message: t("common.notFound") };
  await removeFiles([removed]);
  revalidateProductPages();
  revalidatePath("/pos");
  return { ok: true, message: t("products.photoDeleted") };
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
