"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import {
  formToObject,
  optionalEmail,
  optionalId,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation";

const supplierSchema = z.object({
  id: optionalId,
  name: requiredText(),
  contactPerson: optionalText(200),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(),
  taxId: optionalText(50),
  notes: optionalText(),
});

/** Creates a supplier, or updates it when the form carries an `id`. */
export async function saveSupplier(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = supplierSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, ...values } = parsed.data;
  const db = await getDb();

  if (id) {
    const updated = await db
      .update(suppliers)
      .set(values)
      .where(and(eq(suppliers.id, id), eq(suppliers.pharmacyId, pharmacy.id)))
      .returning({ id: suppliers.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  } else {
    await db.insert(suppliers).values({ ...values, pharmacyId: pharmacy.id });
  }

  revalidatePath("/suppliers");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/**
 * Deletes a supplier with no purchases. A supplier with purchases (in any
 * branch) stays, so old orders keep the name they were bought from.
 */
export async function deleteSupplier(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(id).success) {
    return { ok: false, message: t("common.notFound") };
  }
  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    // Locking the row holds back a purchase from this supplier while we check.
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.pharmacyId, pharmacy.id)))
      .for("update");
    if (!supplier) return "common.notFound";
    const [purchase] = await tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.supplierId, id), eq(purchases.pharmacyId, pharmacy.id)))
      .limit(1);
    if (purchase) return "suppliers.hasPurchases";
    await tx.delete(suppliers).where(eq(suppliers.id, id));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };
  revalidatePath("/suppliers");
  return { ok: true, message: t("common.deleted") };
}
