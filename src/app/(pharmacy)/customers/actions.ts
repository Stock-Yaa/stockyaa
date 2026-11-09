"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { PRICE_LEVELS, customers, sales } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { normaliseBuyerId } from "@/lib/buyer-id";
import { customerTaxFields, refineCustomerTaxId } from "@/lib/tax-invoice";
import {
  formToObject,
  optionalEmail,
  optionalId,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation";

const customerSchema = z
  .object({
    id: optionalId,
    name: requiredText(),
    phone: optionalText(50),
    email: optionalEmail,
    address: optionalText(),
    notes: optionalText(),
    priceLevel: z.enum(PRICE_LEVELS, { error: "common.invalidChoice" }).default("regular"),
    ...customerTaxFields,
  })
  .superRefine(refineCustomerTaxId)
  .transform((v) => ({
    ...v,
    taxId: v.taxId === null ? null : normaliseBuyerId(v.taxId, v.taxIdType),
    // A passport holder has no Thai branch.
    taxBranch: v.taxIdType === "passport" ? null : v.taxBranch,
  }));

/** Creates a customer, or updates it when the form carries an `id`. */
export async function saveCustomer(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = customerSchema.safeParse(formToObject(formData));
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
      .update(customers)
      .set(values)
      .where(and(eq(customers.id, id), eq(customers.pharmacyId, pharmacy.id)))
      .returning({ id: customers.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
    revalidatePath(`/customers/${id}`);
  } else {
    await db.insert(customers).values({ ...values, pharmacyId: pharmacy.id });
  }

  revalidatePath("/customers");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/**
 * Deletes a customer who has no sales. A customer with sales stays, so old
 * invoices keep the name they were sold to (customers are pharmacy-wide, so
 * sales in any branch count).
 */
export async function deleteCustomer(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(id).success) {
    return { ok: false, message: t("common.notFound") };
  }
  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    // Locking the row holds back a sale for this customer while we check.
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.pharmacyId, pharmacy.id)))
      .for("update");
    if (!customer) return "common.notFound";
    const [sale] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.customerId, id), eq(sales.pharmacyId, pharmacy.id)))
      .limit(1);
    if (sale) return "customers.hasSales";
    await tx.delete(customers).where(eq(customers.id, id));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };
  revalidatePath("/customers");
  return { ok: true, message: t("common.deleted") };
}
