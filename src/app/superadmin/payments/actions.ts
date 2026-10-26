"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { billingPayments, pharmacies, plans } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth";
import { dayInTimezone, todayInTimezone, zonedDayEnd, zonedDayStart } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { now } from "@/lib/time";
import { round2 } from "@/lib/utils";
import {
  formToObject,
  nonNegativeNumber,
  optionalDate,
  optionalText,
  requiredId,
} from "@/lib/validation";
import { addMonths } from "../_lib/dates";

const paymentSchema = z.object({
  pharmacyId: requiredId,
  planId: z.uuid({ error: "billing.selectPlan" }),
  months: z.coerce
    .number({ error: "platform.invalidOption" })
    .pipe(z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)], {
      error: "platform.invalidOption",
    })),
  amount: nonNegativeNumber.pipe(z.number().max(9_999_999_999.99, "common.invalidNumber")),
  method: z.enum(["cash", "transfer"], { error: "platform.invalidOption" }),
  reference: optionalText(100),
  note: optionalText(500),
  paidOn: optionalDate,
});

/**
 * Records a cash or bank transfer payment and extends the pharmacy's access
 * by the months paid for, counted from the current end date (or from now if
 * that has passed). The pharmacy is switched to the paid plan and to active.
 */
export async function recordPayment(formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const t = await getT();

  const parsed = paymentSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const input = parsed.data;
  const db = await getDb();

  const result = await db.transaction(async (tx) => {
    // Lock the pharmacy so two payments recorded at once both extend it.
    const [pharmacy] = await tx
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, input.pharmacyId))
      .for("update");
    if (!pharmacy) return null;
    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (!plan) return null;

    const current = now();
    const today = todayInTimezone(pharmacy.timezone);
    if (input.paidOn && input.paidOn > today) return "future" as const;

    const endsAt = pharmacy.subscriptionEndsAt;
    const from = endsAt && endsAt > current ? endsAt : current;
    const periodEnd = zonedDayEnd(
      addMonths(dayInTimezone(from, pharmacy.timezone), input.months),
      pharmacy.timezone,
    );
    // A back-dated payment keeps its date; today's gets the current time.
    const paidAt =
      input.paidOn && input.paidOn !== today
        ? zonedDayStart(input.paidOn, pharmacy.timezone)
        : current;

    await tx.insert(billingPayments).values({
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      planId: plan.id,
      planName: plan.name,
      amount: round2(input.amount),
      currency: plan.currency,
      method: input.method,
      status: "succeeded",
      months: input.months,
      periodStart: from,
      periodEnd,
      reference: input.reference,
      note: input.note,
      recordedBy: admin.id,
      paidAt,
    });
    await tx
      .update(pharmacies)
      .set({ planId: plan.id, subscriptionStatus: "active", subscriptionEndsAt: periodEnd })
      .where(eq(pharmacies.id, pharmacy.id));
    return { pharmacy, periodEnd };
  });

  if (result === null) return { ok: false, message: t("common.notFound") };
  if (result === "future") return { ok: false, fieldErrors: { paidOn: t("common.invalidDate") } };

  revalidatePath("/superadmin", "layout");
  const f = await getFormat(result.pharmacy);
  return { ok: true, message: t("billing.paymentRecorded", { date: f.date(result.periodEnd) }) };
}
