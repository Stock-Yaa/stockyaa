"use server";

import { and, eq, notExists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CURRENCIES } from "@/lib/options";
import { getDb } from "@/db";
import { PLAN_TYPES, pharmacies, plans } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth";
import { round2 } from "@/lib/utils";
import {
  checkbox,
  formToObject,
  nonNegativeInt,
  nonNegativeNumber,
  optionalId,
  optionalText,
  positiveInt,
  requiredId,
  requiredText,
} from "@/lib/validation";

const planSchema = z.object({
  id: optionalId,
  name: requiredText(100),
  description: optionalText(500),
  // Upper bounds are what the columns can hold: numeric(12,2) and int4.
  priceMonthly: nonNegativeNumber.pipe(z.number().max(9_999_999_999.99, "common.invalidNumber")),
  priceYearly: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    nonNegativeNumber.pipe(z.number().max(9_999_999_999.99, "common.invalidNumber")).nullable(),
  ),
  currency: z.enum(CURRENCIES, { error: "platform.invalidOption" }),
  type: z.enum(PLAN_TYPES, { error: "platform.invalidOption" }),
  // A Standard plan always runs one branch, whatever the form sent.
  maxBranches: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : v),
    positiveInt.pipe(z.number().max(1000, "common.invalidNumber")),
  ),
  isActive: checkbox,
  sortOrder: nonNegativeInt.pipe(z.number().max(2_147_483_647, "common.invalidNumber")),
});

/** Creates a plan, or updates it when the form carries an `id`. */
export async function savePlan(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = planSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, ...rest } = parsed.data;
  if (rest.type === "multi_branch" && rest.maxBranches < 2) {
    return { ok: false, fieldErrors: { maxBranches: t("platform.multiBranchMin") } };
  }
  const values = {
    ...rest,
    maxBranches: rest.type === "standard" ? 1 : rest.maxBranches,
    priceMonthly: round2(rest.priceMonthly),
    priceYearly: rest.priceYearly === null ? null : round2(rest.priceYearly),
  };
  const db = await getDb();

  if (id) {
    const updated = await db
      .update(plans)
      .set(values)
      .where(eq(plans.id, id))
      .returning({ id: plans.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  } else {
    await db.insert(plans).values(values);
  }

  revalidatePath("/superadmin", "layout");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/**
 * Deletes a plan that no pharmacy is on. The schema would allow deleting one
 * in use (pharmacies.plan_id becomes null), but that silently strips the plan
 * from paying pharmacies, so it is refused: deactivate the plan instead.
 */
export async function deletePlan(id: string): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };
  const planId = parsedId.data;

  const db = await getDb();
  // The "not in use" test is part of the DELETE itself rather than a separate
  // query before it, so the two cannot disagree.
  const deleted = await db
    .delete(plans)
    .where(
      and(
        eq(plans.id, planId),
        notExists(
          db.select({ id: pharmacies.id }).from(pharmacies).where(eq(pharmacies.planId, plans.id)),
        ),
      ),
    )
    .returning({ id: plans.id });

  if (deleted.length === 0) {
    const inUse = await db.$count(pharmacies, eq(pharmacies.planId, planId));
    return {
      ok: false,
      message: inUse > 0 ? t("platform.planInUse", { count: inUse }) : t("common.notFound"),
    };
  }

  revalidatePath("/superadmin", "layout");
  return { ok: true, message: t("common.deleted") };
}
