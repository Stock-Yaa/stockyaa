"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { PRICE_LEVELS, customers } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { customerTaxFields } from "@/lib/tax-invoice";
import {
  formToObject,
  optionalEmail,
  optionalId,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation";

const customerSchema = z.object({
  id: optionalId,
  name: requiredText(),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(),
  notes: optionalText(),
  priceLevel: z.enum(PRICE_LEVELS, { error: "common.invalidChoice" }).default("regular"),
  ...customerTaxFields,
});

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

/** Deletes a customer. Their sales stay (sales.customer_id is set to null). */
export async function deleteCustomer(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(id).success) {
    return { ok: false, message: t("common.notFound") };
  }
  const db = await getDb();
  await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.pharmacyId, pharmacy.id)));
  revalidatePath("/customers");
  return { ok: true, message: t("common.deleted") };
}
