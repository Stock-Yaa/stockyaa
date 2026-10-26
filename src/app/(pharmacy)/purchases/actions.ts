"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  products,
  purchaseItems,
  purchases,
  suppliers,
  type PurchaseItem,
} from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { addBatch, nextPurchaseReference } from "@/lib/stock";
import { round2 } from "@/lib/utils";
import {
  checkbox,
  formToObject,
  nonNegativeNumber,
  optionalDate,
  optionalId,
  optionalText,
  positiveInt,
  requiredId,
} from "@/lib/validation";

const MAX_ITEMS = 200;
const MAX_QUANTITY = 1_000_000;
// Largest value a numeric(12, 2) money column can hold.
const MAX_MONEY = 9_999_999_999.99;

const batchNumberField = optionalText(100);

const itemSchema = z.object({
  productId: requiredId,
  quantity: positiveInt.refine((value) => value <= MAX_QUANTITY, "common.invalidNumber"),
  costPrice: nonNegativeNumber.refine((value) => value <= MAX_MONEY, "common.invalidNumber"),
  batchNumber: batchNumberField,
  expiryDate: optionalDate,
});

/** The line items arrive as a JSON string in a hidden field. */
function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const purchaseSchema = z.object({
  supplierId: optionalId,
  supplierInvoice: optionalText(100),
  notes: optionalText(),
  receiveNow: checkbox,
  items: z.preprocess(
    parseJson,
    z
      .array(itemSchema, { error: "purchases.itemsRequired" })
      .min(1, "purchases.itemsRequired")
      .max(MAX_ITEMS, "common.tooLong"),
  ),
});

const receiveLineSchema = z.object({
  batchNumber: batchNumberField,
  expiryDate: optionalDate,
});

/**
 * Creates a purchase for the current branch with its line items and opens its
 * detail page. With `receiveNow` the items are also added to that branch's
 * stock in the same transaction.
 */
export async function createPurchase(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };

  const parsed = purchaseSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { supplierId, supplierInvoice, notes, receiveNow } = parsed.data;
  const items = parsed.data.items.map((item) => ({
    ...item,
    costPrice: round2(item.costPrice),
  }));
  const total = round2(items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0));
  if (total > MAX_MONEY) return { ok: false, message: t("purchases.totalTooLarge") };

  const db = await getDb();

  if (supplierId) {
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.pharmacyId, pharmacy.id)))
      .limit(1);
    if (!supplier) {
      return { ok: false, fieldErrors: { supplierId: t("purchases.invalidSupplier") } };
    }
  }

  // Every product must be an active product of this pharmacy.
  const available = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.pharmacyId, pharmacy.id),
        eq(products.isActive, true),
        inArray(products.id, [...new Set(items.map((item) => item.productId))]),
      ),
    );
  const availableIds = new Set(available.map((product) => product.id));
  const fieldErrors: Record<string, string> = {};
  items.forEach((item, index) => {
    if (!availableIds.has(item.productId)) {
      fieldErrors[`items.${index}.productId`] = t("purchases.invalidProduct");
    }
  });
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const purchaseId = await db.transaction(async (tx) => {
    const reference = await nextPurchaseReference(tx, pharmacy.id);
    const [purchase] = await tx
      .insert(purchases)
      .values({
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        reference,
        supplierId,
        supplierInvoice,
        notes,
        status: receiveNow ? "received" : "ordered",
        total,
        receivedAt: receiveNow ? new Date() : null,
        userId: user.id,
      })
      .returning({ id: purchases.id });
    await tx
      .insert(purchaseItems)
      .values(items.map((item) => ({ ...item, purchaseId: purchase.id })));
    if (receiveNow) {
      for (const item of items) {
        await addBatch(tx, {
          ...item,
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          purchaseId: purchase.id,
          type: "purchase",
          userId: user.id,
        });
      }
    }
    return purchase.id;
  });

  revalidatePath("/purchases");
  redirect(`/purchases/${purchaseId}`);
}

/**
 * Receives an ordered purchase of the current branch: saves the final batch
 * number and expiry date of every line, adds a batch per line to the
 * purchase's branch and marks the purchase as received, all in one
 * transaction. The form sends `batchNumber.<itemId>` and
 * `expiryDate.<itemId>` for each line.
 */
export async function receivePurchase(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };

  const purchaseId = requiredId.safeParse(formData.get("purchaseId"));
  if (!purchaseId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  const result = await db.transaction(async (tx): Promise<NonNullable<ActionState>> => {
    // Lock the purchase so two receives cannot both see it as "ordered".
    // Another branch's purchase is not found.
    const [purchase] = await tx
      .select({ id: purchases.id, status: purchases.status, branchId: purchases.branchId })
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId.data), inScope(purchases, branchScope(branch))))
      .for("update");
    if (!purchase) return { ok: false, message: t("common.notFound") };
    if (purchase.status !== "ordered") return { ok: false, message: t("purchases.notOrdered") };

    const items = await tx
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, purchase.id));

    // Validate every line before anything is written.
    const fieldErrors: Record<string, string> = {};
    const lines: (z.infer<typeof receiveLineSchema> & { item: PurchaseItem })[] = [];
    for (const item of items) {
      // A field missing from the form keeps what was entered on the order.
      const field = (name: "batchNumber" | "expiryDate") =>
        formData.has(`${name}.${item.id}`) ? formData.get(`${name}.${item.id}`) : item[name];
      const parsed = receiveLineSchema.safeParse({
        batchNumber: field("batchNumber"),
        expiryDate: field("expiryDate"),
      });
      if (parsed.success) {
        lines.push({ item, ...parsed.data });
        continue;
      }
      const errors = fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey));
      for (const [name, message] of Object.entries(errors)) {
        fieldErrors[`${name}.${item.id}`] = message;
      }
    }
    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

    for (const { item, batchNumber, expiryDate } of lines) {
      await tx
        .update(purchaseItems)
        .set({ batchNumber, expiryDate })
        .where(eq(purchaseItems.id, item.id));
      await addBatch(tx, {
        pharmacyId: pharmacy.id,
        branchId: purchase.branchId,
        productId: item.productId,
        quantity: item.quantity,
        costPrice: item.costPrice,
        batchNumber,
        expiryDate,
        purchaseId: purchase.id,
        type: "purchase",
        userId: user.id,
      });
    }
    await tx
      .update(purchases)
      .set({ status: "received", receivedAt: new Date() })
      .where(eq(purchases.id, purchase.id));
    return { ok: true, message: t("purchases.received") };
  });

  if (result.ok) {
    revalidatePath("/purchases");
    revalidatePath(`/purchases/${purchaseId.data}`);
  }
  return result;
}

/**
 * Cancels a purchase of the current branch that has not been received yet.
 * `branchId` is the branch the page was rendered for.
 */
export async function cancelPurchase(id: string, branchId: string): Promise<ActionState> {
  const { branch } = await requirePharmacy();
  const t = await getT();
  if (branchId !== branch.id) return { ok: false, message: t("branches.changedElsewhere") };
  if (!requiredId.safeParse(id).success) {
    return { ok: false, message: t("common.notFound") };
  }
  const db = await getDb();
  // The status condition makes this a no-op once the purchase was received.
  const cancelled = await db
    .update(purchases)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(purchases.id, id),
        inScope(purchases, branchScope(branch)),
        eq(purchases.status, "ordered"),
      ),
    )
    .returning({ id: purchases.id });
  if (cancelled.length === 0) return { ok: false, message: t("purchases.notOrdered") };

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  return { ok: true, message: t("purchases.cancelled") };
}
