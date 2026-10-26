"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { pharmacies } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { round2 } from "@/lib/utils";
import {
  formToObject,
  nonNegativeNumber,
  optionalEmail,
  optionalText,
  positiveInt,
  requiredText,
} from "@/lib/validation";
import { CURRENCIES, TIMEZONES } from "@/lib/options";

const profileSchema = z.object({
  name: requiredText(),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(),
  licenseNumber: optionalText(100),
  taxId: optionalText(50),
  currency: z.enum(CURRENCIES, { error: "settings.invalidOption" }),
  timezone: z.enum(TIMEZONES, { error: "settings.invalidOption" }),
  taxRate: nonNegativeNumber.pipe(z.number().max(100, "settings.taxRateRange")),
  expiryAlertDays: positiveInt.pipe(z.number().max(365, "settings.expiryAlertDaysRange")),
  receiptFooter: optionalText(500),
});

/** Updates the caller's own pharmacy. Pharmacy admins only. */
export async function updatePharmacyProfile(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (user.role !== "admin") return { ok: false, message: t("settings.adminOnly") };

  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }

  const db = await getDb();
  await db
    .update(pharmacies)
    .set({ ...parsed.data, taxRate: round2(parsed.data.taxRate) })
    .where(eq(pharmacies.id, pharmacy.id));

  // The shell shows the pharmacy name and every page formats with its currency.
  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.profileSaved") };
}
