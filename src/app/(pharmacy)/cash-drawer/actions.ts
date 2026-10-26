"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { CASH_MOVEMENT_TYPES, cashMovements, cashShifts } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { getOpenShift, getShiftTotals } from "@/lib/cash-drawer";
import { now } from "@/lib/time";
import { round2 } from "@/lib/utils";
import { formToObject, nonNegativeNumber, optionalText, requiredId, requiredText } from "@/lib/validation";

// Largest value the money columns (numeric(12, 2)) can hold.
const MAX_MONEY = 9_999_999_999.99;
const amount = nonNegativeNumber.refine((v) => v <= MAX_MONEY, "common.invalidNumber");
const positiveAmount = amount.refine((v) => v > 0, "common.mustBePositive");

const openSchema = z.object({ openingBalance: amount });
const movementSchema = z.object({
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: positiveAmount,
  reason: requiredText(200),
});
const closeSchema = z.object({
  shiftId: requiredId,
  countedCash: amount,
  note: optionalText(500),
});

function invalid(error: z.ZodError, t: Awaited<ReturnType<typeof getT>>): ActionState {
  return { ok: false, fieldErrors: fieldErrorsFrom(error, (m) => t(m as MessageKey)) };
}

/** Starts a shift in the current branch with the cash counted into its drawer. */
export async function openDrawer(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };
  const parsed = openSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);

  const db = await getDb();
  if (await getOpenShift(db, branch)) {
    return { ok: false, message: t("cashDrawer.alreadyOpen") };
  }
  try {
    await db.insert(cashShifts).values({
      pharmacyId: pharmacy.id,
      branchId: branch.id,
      openedBy: user.id,
      openingBalance: round2(parsed.data.openingBalance),
    });
  } catch {
    // The one-open-shift index caught a second tab opening at the same moment.
    revalidatePath("/cash-drawer");
    return { ok: false, message: t("cashDrawer.alreadyOpen") };
  }
  revalidatePath("/cash-drawer");
  return { ok: true, message: t("cashDrawer.opened") };
}

/** Records cash put in, taken out, or paid out as an expense, in the current branch's drawer. */
export async function addCashMovement(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };
  const parsed = movementSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);

  const db = await getDb();
  // Only this branch's open shift: movements belong to a branch through it.
  const shift = await getOpenShift(db, branch);
  if (!shift) return { ok: false, message: t("cashDrawer.notOpen") };

  await db.insert(cashMovements).values({
    pharmacyId: pharmacy.id,
    shiftId: shift.id,
    type: parsed.data.type,
    amount: round2(parsed.data.amount),
    reason: parsed.data.reason,
    userId: user.id,
  });
  revalidatePath("/cash-drawer");
  return { ok: true, message: t("cashDrawer.recorded") };
}

/** Closes the open shift with the counted cash; expected cash is worked out here. */
export async function closeDrawer(formData: FormData): Promise<ActionState> {
  const { user, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };
  const parsed = closeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { shiftId, countedCash, note } = parsed.data;

  const db = await getDb();
  const scope = branchScope(branch);
  const closed = await db.transaction(async (tx) => {
    // Another branch's shift is "not open" here.
    const [shift] = await tx
      .select()
      .from(cashShifts)
      .where(and(eq(cashShifts.id, shiftId), inScope(cashShifts, scope), isNull(cashShifts.closedAt)))
      .for("update");
    if (!shift) return false;

    const totals = await getShiftTotals(tx, shift);
    const counted = round2(countedCash);
    await tx
      .update(cashShifts)
      .set({
        closedBy: user.id,
        closedAt: now(),
        cashSales: totals.cashSales,
        cashRefunds: totals.cashRefunds,
        payIns: totals.payIns,
        payOuts: totals.payOuts,
        expenses: totals.expenses,
        expectedCash: totals.expectedCash,
        countedCash: counted,
        difference: round2(counted - totals.expectedCash),
        note,
      })
      .where(and(eq(cashShifts.id, shift.id), inScope(cashShifts, scope)));
    return true;
  });

  revalidatePath("/cash-drawer");
  if (!closed) return { ok: false, message: t("cashDrawer.notOpen") };
  return { ok: true, message: t("cashDrawer.closed") };
}
