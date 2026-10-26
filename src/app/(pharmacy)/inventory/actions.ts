"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { batches, products } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { InsufficientStockError, addBatch, changeBatchQuantity } from "@/lib/stock";
import {
  formToObject,
  nonNegativeNumber,
  optionalDate,
  optionalText,
  positiveInt,
  requiredId,
} from "@/lib/validation";
import {
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_REASONS,
  encodeReason,
  reasonsFor,
} from "./reasons";

// Upper bounds that keep values inside the numeric(12,2) and integer columns.
const MAX_MONEY = 999_999_999;
const MAX_QUANTITY = 1_000_000;

const quantity = positiveInt.refine((v) => v <= MAX_QUANTITY, "inventory.numberTooLarge");

/** Pages that show stock levels or the movement history. */
function revalidateStockPages() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/products");
}

const addStockSchema = z.object({
  productId: requiredId,
  quantity,
  // Blank means "use the product's cost price".
  costPrice: z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v),
    nonNegativeNumber
      .refine((v) => v <= MAX_MONEY, "inventory.numberTooLarge")
      .nullable(),
  ),
  batchNumber: optionalText(100),
  expiryDate: optionalDate,
  note: optionalText(300),
});

/** Adds a batch of an existing product to the current branch without a purchase (found or donated stock). */
export async function addStock(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };

  const parsed = addStockSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const input = parsed.data;
  const db = await getDb();

  const [product] = await db
    .select({ id: products.id, costPrice: products.costPrice })
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.pharmacyId, pharmacy.id),
        eq(products.isActive, true),
      ),
    )
    .limit(1);
  if (!product) {
    return { ok: false, fieldErrors: { productId: t("inventory.productUnavailable") } };
  }

  await db.transaction((tx) =>
    addBatch(tx, {
      pharmacyId: pharmacy.id,
      branchId: branch.id,
      productId: product.id,
      quantity: input.quantity,
      costPrice: input.costPrice ?? product.costPrice,
      batchNumber: input.batchNumber,
      expiryDate: input.expiryDate,
      type: "adjustment",
      reason: input.note,
      userId: user.id,
    }),
  );

  revalidateStockPages();
  return { ok: true, message: t("inventory.stockAdded") };
}

const adjustStockSchema = z.object({
  batchId: requiredId,
  direction: z.enum(ADJUSTMENT_DIRECTIONS, { error: "common.required" }),
  quantity,
  reason: z.enum(ADJUSTMENT_REASONS, { error: "common.required" }),
  note: optionalText(300),
});

/** Removes units from, or adds units to, one batch of the current branch and records why. */
export async function adjustStock(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };

  const parsed = adjustStockSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { batchId, direction, reason, note } = parsed.data;
  if (!reasonsFor(direction).includes(reason)) {
    return { ok: false, fieldErrors: { reason: t("common.required") } };
  }
  if (reason === "other" && !note) {
    return { ok: false, fieldErrors: { note: t("common.required") } };
  }
  const db = await getDb();

  const [batch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.id, batchId),
        eq(batches.pharmacyId, pharmacy.id),
        eq(batches.branchId, branch.id),
      ),
    )
    .limit(1);
  if (!batch) return { ok: false, message: t("common.notFound") };

  try {
    await db.transaction((tx) =>
      changeBatchQuantity(tx, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        batchId: batch.id,
        delta: direction === "remove" ? -parsed.data.quantity : parsed.data.quantity,
        type: "adjustment",
        reason: encodeReason(reason, note),
        userId: user.id,
      }),
    );
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    return {
      ok: false,
      fieldErrors: {
        quantity: t("inventory.insufficientStock", {
          available: error.available,
          requested: error.requested,
        }),
      },
    };
  }

  revalidateStockPages();
  return { ok: true, message: t("inventory.stockAdjusted") };
}
