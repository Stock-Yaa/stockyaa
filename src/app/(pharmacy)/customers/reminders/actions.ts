"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { customers, products, refillReminders } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { addDays, todayInTimezone } from "@/lib/dates";
import {
  checkbox,
  formToObject,
  optionalDate,
  optionalId,
  optionalText,
  positiveInt,
} from "@/lib/validation";

const PATH = "/customers/reminders";

const reminderSchema = z.object({
  id: optionalId,
  // Chosen when the reminder is created; fixed afterwards.
  customerId: optionalId,
  productId: optionalId,
  intervalDays: positiveInt.refine((days) => days <= 365, "refills.intervalTooLong"),
  // New reminders count from the last purchase; edits set the due date itself.
  lastRefillDate: optionalDate,
  nextDueDate: optionalDate,
  isActive: checkbox,
  notes: optionalText(),
});

/** Creates a reminder, or updates it when the form carries an `id`. */
export async function saveReminder(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = reminderSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const { id, customerId, productId, intervalDays, lastRefillDate, nextDueDate, isActive, notes } =
    parsed.data;
  const db = await getDb();

  if (id) {
    if (!nextDueDate) return { ok: false, fieldErrors: { nextDueDate: t("common.required") } };
    const updated = await db
      .update(refillReminders)
      .set({ intervalDays, nextDueDate, isActive, notes })
      .where(and(eq(refillReminders.id, id), eq(refillReminders.pharmacyId, pharmacy.id)))
      .returning({ id: refillReminders.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
    revalidatePath(PATH);
    return { ok: true, message: t("common.updated") };
  }

  if (!customerId) return { ok: false, fieldErrors: { customerId: t("common.required") } };
  if (!productId) return { ok: false, fieldErrors: { productId: t("common.required") } };
  const [[customer], [product]] = await Promise.all([
    db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.pharmacyId, pharmacy.id)))
      .limit(1),
    db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.pharmacyId, pharmacy.id)))
      .limit(1),
  ]);
  if (!customer) return { ok: false, fieldErrors: { customerId: t("common.invalidChoice") } };
  if (!product) return { ok: false, fieldErrors: { productId: t("common.invalidChoice") } };

  const last = lastRefillDate ?? todayInTimezone(pharmacy.timezone);
  const created = await db
    .insert(refillReminders)
    .values({
      pharmacyId: pharmacy.id,
      customerId,
      productId,
      intervalDays,
      lastRefillDate: last,
      nextDueDate: addDays(last, intervalDays),
      notes,
    })
    // One reminder per customer and product.
    .onConflictDoNothing()
    .returning({ id: refillReminders.id });
  if (created.length === 0) {
    return { ok: false, fieldErrors: { productId: t("refills.duplicate") } };
  }

  revalidatePath(PATH);
  return { ok: true, message: t("common.created") };
}

/** The customer has collected their refill today: the next one is due one interval on. */
export async function markRefilled(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const today = todayInTimezone(pharmacy.timezone);
  const db = await getDb();
  const updated = await db
    .update(refillReminders)
    .set({
      lastRefillDate: today,
      nextDueDate: sql`${today}::date + ${refillReminders.intervalDays}`,
    })
    .where(and(eq(refillReminders.id, id), eq(refillReminders.pharmacyId, pharmacy.id)))
    .returning({ id: refillReminders.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  revalidatePath(PATH);
  return { ok: true, message: t("refills.refilled") };
}

export async function deleteReminder(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const db = await getDb();
  await db
    .delete(refillReminders)
    .where(and(eq(refillReminders.id, id), eq(refillReminders.pharmacyId, pharmacy.id)));
  revalidatePath(PATH);
  return { ok: true, message: t("common.deleted") };
}
