"use server";

import { compare } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { formToObject } from "@/lib/validation";
import { hashPin, pinField } from "@/lib/pin";

const pinSchema = z
  .object({
    currentPassword: z.string({ error: "common.required" }).min(1, "common.required"),
    pin: pinField,
    confirmPin: z.string({ error: "common.required" }),
  })
  .refine((v) => v.pin === v.confirmPin, { path: ["confirmPin"], error: "users.pinMismatch" });

/**
 * Sets the caller's own cash drawer PIN. Asks for the password, so nobody
 * can change it on a till someone left signed in.
 */
export async function setOwnPin(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy({ allowInactive: true });
  const t = await getT();
  const parsed = pinSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const db = await getDb();
  const mine = and(eq(users.id, user.id), eq(users.pharmacyId, pharmacy.id));
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(mine).limit(1);
  if (!row || !(await compare(parsed.data.currentPassword, row.passwordHash))) {
    return { ok: false, fieldErrors: { currentPassword: t("settings.currentPasswordWrong") } };
  }
  await db
    .update(users)
    .set({ pinHash: await hashPin(parsed.data.pin), pinFailures: 0, pinLockedUntil: null })
    .where(mine);
  revalidatePath("/profile");
  return { ok: true, message: t("users.pinSaved") };
}
