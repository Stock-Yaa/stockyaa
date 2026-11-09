"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db";
import {
  PAY_IN_CATEGORIES,
  cashDrawers,
  cashMovements,
  cashReviews,
  cashShifts,
  expenseCategories,
  expenses,
  notifications,
  users,
  type Branch,
  type CashCounts,
  type Pharmacy,
} from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged, canSwitchBranch, isManager } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { cleanCounts, countsTotal, denominationsFor } from "@/lib/cash-counts";
import {
  createCashReview,
  drawerBlocked,
  findDrawer,
  getPreviousShift,
  getShiftTotals,
  lockShiftForCash,
  rememberDeviceDrawer,
  type ShiftTotals,
} from "@/lib/cash-drawer";
import { canRecount, cashRulesOf, varianceLevel, type VarianceLevel } from "@/lib/cash-rules";
import { todayInTimezone } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/db-error";
import { checkPin } from "@/lib/pin";
import { StorageNotConfiguredError, putFile } from "@/lib/storage";
import { now } from "@/lib/time";
import { round2 } from "@/lib/utils";
import {
  checkbox,
  formToObject,
  nonNegativeNumber,
  optionalId,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation";

// Largest value the money columns (numeric(12, 2)) can hold.
const MAX_MONEY = 9_999_999_999.99;
const amount = nonNegativeNumber.refine((v) => v <= MAX_MONEY, "common.invalidNumber");
const positiveAmount = amount.refine((v) => v > 0, "common.mustBePositive");
// Receipt photos are shrunk in the browser first; this is the most the server takes.
const MAX_RECEIPT_BYTES = 1_500_000;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type T = Awaited<ReturnType<typeof getT>>;

function invalid(error: z.ZodError, t: T): ActionState {
  return { ok: false, fieldErrors: fieldErrorsFrom(error, (m) => t(m as MessageKey)) };
}

const fail = (message: string): ActionState => ({ ok: false, message });

/**
 * The cash counted in a form: the "counts" field (JSON, pieces per note and
 * coin) for currencies with notes and coins, otherwise the typed "amount".
 */
function readCount(
  formData: FormData,
  pharmacy: Pick<Pharmacy, "currency">,
  notesOnly = false,
): { counts: CashCounts | null; total: number } | null {
  const denominations = denominationsFor(pharmacy.currency);
  if (denominations) {
    const raw = formData.get("counts");
    if (typeof raw !== "string") return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const counts = cleanCounts(parsed, denominations, notesOnly);
    if (!counts) return null;
    const total = countsTotal(counts);
    return total <= MAX_MONEY ? { counts, total } : null;
  }
  const typed = amount.safeParse(formData.get("amount"));
  return typed.success ? { counts: null, total: round2(typed.data) } : null;
}

function revalidateDrawer() {
  revalidatePath("/cash-drawer", "layout");
  revalidatePath("/pos");
}

/** Name of a user of the pharmacy, for review notifications. */
async function userName(db: DbOrTx, pharmacyId: string, userId: string | null) {
  if (!userId) return "";
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.pharmacyId, pharmacyId)));
  return row?.name ?? "";
}

async function drawerName(db: DbOrTx, pharmacyId: string, drawerId: string) {
  const [row] = await db
    .select({ name: cashDrawers.name })
    .from(cashDrawers)
    .where(and(eq(cashDrawers.id, drawerId), eq(cashDrawers.pharmacyId, pharmacyId)));
  return row?.name ?? "";
}

// ---------------------------------------------------------------------------
// The device's drawer
// ---------------------------------------------------------------------------

/** Makes this device work with another drawer of the current branch. */
export async function selectDrawer(drawerId: string, activeBranchId: string): Promise<ActionState> {
  const { branch } = await requirePharmacy();
  const t = await getT();
  if (activeBranchId !== branch.id) return fail(t("branches.changedElsewhere"));
  if (!requiredId.safeParse(drawerId).success) return fail(t("common.notFound"));
  const db = await getDb();
  const drawer = await findDrawer(db, branch, drawerId);
  if (!drawer || !drawer.isActive) return fail(t("common.notFound"));
  await rememberDeviceDrawer(drawer.id);
  revalidateDrawer();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Opening a session
// ---------------------------------------------------------------------------

const openSchema = z.object({
  drawerId: requiredId,
  userId: z.uuid({ error: "cashDrawer.chooseStaff" }),
  pin: z.string({ error: "common.required" }).min(1, "common.required"),
});

/**
 * Opens a session: the person picks their name, types their PIN and counts
 * the float blind. A count that differs from what the drawer's last session
 * left goes to the manager.
 */
export async function openShift(formData: FormData): Promise<ActionState> {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = openSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const count = readCount(formData, pharmacy);
  if (!count) return { ok: false, fieldErrors: { counts: t("cashDrawer.countInvalid") } };

  const db = await getDb();
  const drawer = await findDrawer(db, branch, parsed.data.drawerId);
  if (!drawer || !drawer.isActive) return fail(t("common.notFound"));
  if (await drawerBlocked(db, drawer)) return fail(t("cashDrawer.drawerBlocked"));

  // Outside the transaction, so a wrong PIN is still counted.
  const pin = await checkPin(db, {
    pharmacyId: pharmacy.id,
    userId: parsed.data.userId,
    pin: parsed.data.pin,
    branch,
  });
  if (!pin.ok) return { ok: false, fieldErrors: { pin: t(pin.error) } };

  try {
    await db.transaction(async (tx) => {
      const previous = await getPreviousShift(tx, drawer);
      const expectedOpening = previous?.leftInDrawer ?? null;
      const [shift] = await tx
        .insert(cashShifts)
        .values({
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          drawerId: drawer.id,
          openedBy: pin.user.id,
          openingBalance: count.total,
          openingCounts: count.counts,
          previousShiftId: previous?.id ?? null,
          expectedOpening,
        })
        .returning({ id: cashShifts.id });
      if (expectedOpening !== null && count.total !== expectedOpening) {
        await createCashReview(tx, {
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          drawerId: drawer.id,
          drawerName: drawer.name,
          shiftId: shift.id,
          kind: "opening",
          amount: count.total - expectedOpening,
          userId: pin.user.id,
          userName: pin.user.name,
        });
      }
    });
  } catch (error) {
    // The one-open-session index caught a second device opening the drawer.
    if (isUniqueViolation(error)) {
      revalidateDrawer();
      return fail(t("cashDrawer.alreadyOpen"));
    }
    throw error;
  }
  await rememberDeviceDrawer(drawer.id);
  revalidateDrawer();
  return { ok: true, message: t("cashDrawer.opened", { name: pin.user.name }) };
}

// ---------------------------------------------------------------------------
// Pay-ins, pay-outs, drops and no-sales
// ---------------------------------------------------------------------------

/**
 * Runs `write` against an open session of the current branch that is not
 * being counted, locked so it cannot close meanwhile.
 */
async function withOpenShift(
  branch: Pick<Branch, "id" | "pharmacyId">,
  shiftId: string,
  write: (
    tx: DbOrTx,
    shift: NonNullable<Awaited<ReturnType<typeof lockShiftForCash>>>,
  ) => Promise<void>,
): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const shift = await lockShiftForCash(tx, branch, shiftId);
    if (!shift) return false;
    await write(tx, shift);
    return true;
  });
}

const payInSchema = z.object({
  shiftId: requiredId,
  category: z.enum(PAY_IN_CATEGORIES, { error: "common.invalidChoice" }),
  amount: positiveAmount,
  note: optionalText(200),
});

/** Cash put into the drawer that is not a sale (e.g. change from the safe). */
export async function addPayIn(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = payInSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { shiftId, category, note } = parsed.data;
  if (category === "other" && !note) {
    return { ok: false, fieldErrors: { note: t("common.required") } };
  }

  const done = await withOpenShift(branch, shiftId, async (tx, shift) => {
    await tx.insert(cashMovements).values({
      pharmacyId: pharmacy.id,
      shiftId: shift.id,
      type: "in",
      category,
      amount: round2(parsed.data.amount),
      reason: note ?? "",
      userId: user.id,
    });
  });
  if (!done) return fail(t("cashDrawer.notOpen"));
  revalidateDrawer();
  return { ok: true, message: t("cashDrawer.recorded") };
}

const payOutSchema = z.object({
  shiftId: requiredId,
  categoryId: requiredId,
  amount: positiveAmount,
  note: requiredText(200),
  managerId: optionalId,
  managerPin: optionalText(10),
  requestApproval: checkbox,
});

/**
 * A petty cost paid from the drawer, with a photo of the receipt. It is also
 * booked as an expense of the branch in the chosen category, so it shows in
 * the Expenses report. Above the approval limit a manager types their PIN, or
 * it goes to their review queue.
 */
export async function addPayOut(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = payOutSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { shiftId, categoryId, note, managerId, managerPin, requestApproval } = parsed.data;
  const value = round2(parsed.data.amount);

  const receipt = formData.get("receipt");
  if (!(receipt instanceof File) || receipt.size === 0) {
    return { ok: false, fieldErrors: { receipt: t("cashDrawer.receiptRequired") } };
  }
  const extension = RECEIPT_TYPES[receipt.type];
  if (!extension || receipt.size > MAX_RECEIPT_BYTES) {
    return { ok: false, fieldErrors: { receipt: t("cashDrawer.receiptInvalid") } };
  }

  const db = await getDb();
  const [category] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, categoryId), eq(expenseCategories.pharmacyId, pharmacy.id)));
  if (!category) return { ok: false, fieldErrors: { categoryId: t("common.invalidChoice") } };
  const rules = cashRulesOf(pharmacy);
  let approvedBy: string | null = null;
  let needsReview = false;
  if (value > rules.payoutApprovalLimit) {
    if (managerId && managerPin) {
      const pin = await checkPin(db, {
        pharmacyId: pharmacy.id,
        userId: managerId,
        pin: managerPin,
        branch,
        managerOnly: true,
      });
      if (!pin.ok) return { ok: false, fieldErrors: { managerPin: t(pin.error) } };
      approvedBy = pin.user.id;
    } else if (requestApproval) {
      needsReview = true;
    } else {
      return { ok: false, fieldErrors: { managerPin: t("cashDrawer.managerPinRequired") } };
    }
  }

  // Stored before the transaction: an upload must not hold the session lock.
  const receiptPath = `${pharmacy.id}/receipts/${randomUUID()}.${extension}`;
  try {
    await putFile(receiptPath, new Uint8Array(await receipt.arrayBuffer()), receipt.type);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return fail(t("cashDrawer.storageMissing"));
    console.error(error);
    return fail(t("cashDrawer.uploadFailed"));
  }

  const done = await withOpenShift(branch, shiftId, async (tx, shift) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        categoryId: category.id,
        expenseDate: todayInTimezone(pharmacy.timezone),
        amount: value,
        description: note,
        userId: user.id,
      })
      .returning({ id: expenses.id });
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        pharmacyId: pharmacy.id,
        shiftId: shift.id,
        type: "out",
        expenseId: expense.id,
        amount: value,
        reason: note,
        receiptPath,
        approvedBy,
        userId: user.id,
      })
      .returning({ id: cashMovements.id });
    if (needsReview) {
      await createCashReview(tx, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        drawerId: shift.drawerId,
        drawerName: await drawerName(tx, pharmacy.id, shift.drawerId),
        shiftId: shift.id,
        movementId: movement.id,
        kind: "payout",
        amount: value,
        userId: user.id,
        userName: user.name,
      });
    }
  });
  if (!done) return fail(t("cashDrawer.notOpen"));
  revalidateDrawer();
  return {
    ok: true,
    message: t(needsReview ? "cashDrawer.payOutSentForApproval" : "cashDrawer.recorded"),
  };
}

const dropSchema = z.object({ shiftId: requiredId, bagNumber: requiredText(50) });

/** Excess cash taken to the safe, counted note by note, in a numbered bag. */
export async function addCashDrop(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = dropSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const count = readCount(formData, pharmacy, true);
  if (!count || count.total <= 0) {
    return { ok: false, fieldErrors: { counts: t("cashDrawer.dropEmpty") } };
  }

  const done = await withOpenShift(branch, parsed.data.shiftId, async (tx, shift) => {
    await tx.insert(cashMovements).values({
      pharmacyId: pharmacy.id,
      shiftId: shift.id,
      type: "drop",
      amount: count.total,
      counts: count.counts,
      bagNumber: parsed.data.bagNumber,
      reason: parsed.data.bagNumber,
      userId: user.id,
    });
  });
  if (!done) return fail(t("cashDrawer.notOpen"));
  revalidateDrawer();
  return { ok: true, message: t("cashDrawer.dropRecorded") };
}

const noSaleSchema = z.object({ shiftId: requiredId, reason: requiredText(200) });

/** Logs opening the drawer without a sale (e.g. giving change), with the reason. */
export async function recordNoSale(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = noSaleSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);

  const done = await withOpenShift(branch, parsed.data.shiftId, async (tx, shift) => {
    await tx.insert(cashMovements).values({
      pharmacyId: pharmacy.id,
      shiftId: shift.id,
      type: "no_sale",
      amount: 0,
      reason: parsed.data.reason,
      userId: user.id,
    });
  });
  if (!done) return fail(t("cashDrawer.notOpen"));
  revalidateDrawer();
  return { ok: true, message: t("cashDrawer.noSaleRecorded") };
}

// ---------------------------------------------------------------------------
// Closing a session
// ---------------------------------------------------------------------------

export type CountResult =
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }
  | {
      ok: true;
      counted: number;
      expected: number;
      difference: number;
      level: VarianceLevel;
      canRecount: boolean;
      /** Recounts still allowed after this one. */
      recountsLeft: number;
      openingBalance: number;
      totals: ShiftTotals;
    };

const countSchema = z.object({
  shiftId: requiredId,
  userId: z.uuid({ error: "cashDrawer.chooseStaff" }),
  pin: z.string({ error: "common.required" }).min(1, "common.required"),
});

/**
 * Records a blind count of the drawer and only then reveals what was
 * expected. From the first count on the session takes no more cash; it can
 * be recounted while the rules allow, then it is closed with finishClose.
 */
export async function submitCount(formData: FormData): Promise<CountResult> {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };
  const parsed = countSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const count = readCount(formData, pharmacy);
  if (!count) return { ok: false, fieldErrors: { counts: t("cashDrawer.countInvalid") } };

  const db = await getDb();
  const rules = cashRulesOf(pharmacy);
  const pin = await checkPin(db, {
    pharmacyId: pharmacy.id,
    userId: parsed.data.userId,
    pin: parsed.data.pin,
    branch,
  });
  if (!pin.ok) return { ok: false, fieldErrors: { pin: t(pin.error) } };

  const result = await db.transaction(async (tx): Promise<CountResult> => {
    const [shift] = await tx
      .select()
      .from(cashShifts)
      .where(
        and(
          eq(cashShifts.id, parsed.data.shiftId),
          eq(cashShifts.pharmacyId, pharmacy.id),
          eq(cashShifts.branchId, branch.id),
          isNull(cashShifts.closedAt),
        ),
      )
      .for("update");
    if (!shift) return { ok: false, message: t("cashDrawer.notOpen") };
    // The person accountable for the drawer counts it, or a manager does.
    if (pin.user.id !== shift.openedBy && pin.user.role === "staff") {
      return { ok: false, fieldErrors: { userId: t("cashDrawer.ownerOrManager") } };
    }

    const totals = await getShiftTotals(tx, shift);
    const attempts = shift.countAttempts;
    const last = attempts.at(-1);
    if (last && !canRecount(round2(last.total - last.expected), attempts.length, rules)) {
      return { ok: false, message: t("cashDrawer.noRecountsLeft") };
    }
    const next = [
      ...attempts,
      {
        counts: count.counts,
        total: count.total,
        expected: totals.expectedCash,
        userId: pin.user.id,
        at: now().toISOString(),
      },
    ];
    await tx
      .update(cashShifts)
      .set({ countAttempts: next })
      .where(and(eq(cashShifts.id, shift.id), eq(cashShifts.pharmacyId, pharmacy.id)));

    const difference = round2(count.total - totals.expectedCash);
    const recount = canRecount(difference, next.length, rules);
    return {
      ok: true,
      counted: count.total,
      expected: totals.expectedCash,
      difference,
      level: varianceLevel(difference, rules),
      canRecount: recount,
      recountsLeft: Math.max(0, rules.recounts - (next.length - 1)),
      openingBalance: shift.openingBalance,
      totals,
    };
  });
  revalidateDrawer();
  return result;
}

const finishSchema = z.object({
  shiftId: requiredId,
  reason: optionalText(500),
  closingDrop: amount,
  closingBag: optionalText(50),
});

/**
 * Closes a counted session with its last count. A difference needs a
 * reason; beyond the small tolerance it goes to the manager, and beyond the
 * large one the drawer is blocked until they decide. What is not taken to the
 * safe stays in the drawer, and the next opening count is checked against it.
 */
export async function finishClose(formData: FormData): Promise<ActionState> {
  const { pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = finishSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { shiftId, reason, closingBag } = parsed.data;
  const closingDrop = round2(parsed.data.closingDrop);
  if (closingDrop > 0 && !closingBag) {
    return { ok: false, fieldErrors: { closingBag: t("common.required") } };
  }

  const rules = cashRulesOf(pharmacy);
  const db = await getDb();
  const outcome = await db.transaction(async (tx): Promise<ActionState> => {
    const [shift] = await tx
      .select()
      .from(cashShifts)
      .where(
        and(
          eq(cashShifts.id, shiftId),
          eq(cashShifts.pharmacyId, pharmacy.id),
          eq(cashShifts.branchId, branch.id),
          isNull(cashShifts.closedAt),
        ),
      )
      .for("update");
    if (!shift) return fail(t("cashDrawer.notOpen"));
    const last = shift.countAttempts.at(-1);
    if (!last) return fail(t("cashDrawer.countFirst"));

    const totals = await getShiftTotals(tx, shift);
    const difference = round2(last.total - totals.expectedCash);
    const level = varianceLevel(difference, rules);
    if (level !== "balanced" && !reason) {
      return { ok: false, fieldErrors: { reason: t("cashDrawer.reasonRequired") } };
    }
    if (closingDrop > last.total) {
      return { ok: false, fieldErrors: { closingDrop: t("cashDrawer.dropTooLarge") } };
    }

    await tx
      .update(cashShifts)
      .set({
        closedBy: last.userId,
        closedAt: now(),
        cashSales: totals.cashSales,
        cashRefunds: totals.cashRefunds,
        payIns: totals.payIns,
        payOuts: totals.payOuts,
        expenses: totals.expenses,
        drops: totals.drops,
        cardSales: totals.cardSales,
        transferSales: totals.transferSales,
        salesCount: totals.salesCount,
        expectedCash: totals.expectedCash,
        countedCash: last.total,
        closingCounts: last.counts,
        difference,
        note: reason,
        closingDrop,
        closingBag: closingDrop > 0 ? closingBag : null,
        leftInDrawer: round2(last.total - closingDrop),
      })
      .where(and(eq(cashShifts.id, shift.id), eq(cashShifts.pharmacyId, pharmacy.id)));

    if (level === "major" || level === "severe") {
      await createCashReview(tx, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        drawerId: shift.drawerId,
        drawerName: await drawerName(tx, pharmacy.id, shift.drawerId),
        shiftId: shift.id,
        kind: "variance",
        amount: difference,
        blocking: level === "severe",
        userId: shift.openedBy,
        userName: await userName(tx, pharmacy.id, shift.openedBy),
      });
    }
    return {
      ok: true,
      message: t(level === "major" || level === "severe" ? "cashDrawer.closedForReview" : "cashDrawer.closed"),
    };
  });
  revalidateDrawer();
  return outcome;
}

// ---------------------------------------------------------------------------
// Manager: review queue and forgotten sessions
// ---------------------------------------------------------------------------

const reviewSchema = z.object({
  reviewId: requiredId,
  decision: z.enum(["approved", "rejected"], { error: "common.invalidChoice" }),
  note: optionalText(500),
});

/** Approves or rejects an item of the review queue (an admin: any branch; a manager: their own). */
export async function decideReview(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!isManager(user)) return fail(t("cashDrawer.managerOnly"));
  const parsed = reviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { reviewId, decision, note } = parsed.data;
  if (decision === "rejected" && !note) {
    return { ok: false, fieldErrors: { note: t("cashDrawer.rejectNoteRequired") } };
  }

  const db = await getDb();
  const updated = await db
    .update(cashReviews)
    .set({ status: decision, reviewedBy: user.id, reviewedAt: now(), reviewNote: note })
    .where(
      and(
        eq(cashReviews.id, reviewId),
        eq(cashReviews.pharmacyId, pharmacy.id),
        canSwitchBranch(user) ? undefined : eq(cashReviews.branchId, branch.id),
        eq(cashReviews.status, "pending"),
      ),
    )
    .returning({ id: cashReviews.id });
  if (updated.length === 0) return fail(t("cashDrawer.reviewGone"));
  // Its notification has been dealt with.
  await db
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.pharmacyId, pharmacy.id),
        eq(notifications.key, `cash_review:${reviewId}`),
        isNull(notifications.readAt),
      ),
    );
  revalidateDrawer();
  revalidatePath("/notifications");
  return { ok: true, message: t(decision === "approved" ? "cashDrawer.approved" : "cashDrawer.rejected") };
}

const forceCloseSchema = z.object({ shiftId: requiredId, note: requiredText(500) });

/**
 * A manager closes a session someone forgot to close, with their own count.
 * The result is recorded as already reviewed by them.
 */
export async function forceClose(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!isManager(user)) return fail(t("cashDrawer.managerOnly"));
  const parsed = forceCloseSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const count = readCount(formData, pharmacy);
  if (!count) return { ok: false, fieldErrors: { counts: t("cashDrawer.countInvalid") } };

  const rules = cashRulesOf(pharmacy);
  const db = await getDb();
  const closed = await db.transaction(async (tx) => {
    // Admins work in every branch (any open session of the pharmacy); managers in theirs.
    const [shift] = await tx
      .select()
      .from(cashShifts)
      .where(
        and(
          eq(cashShifts.id, parsed.data.shiftId),
          eq(cashShifts.pharmacyId, pharmacy.id),
          canSwitchBranch(user) ? undefined : eq(cashShifts.branchId, branch.id),
          isNull(cashShifts.closedAt),
        ),
      )
      .for("update");
    if (!shift) return false;
    const totals = await getShiftTotals(tx, shift);
    const difference = round2(count.total - totals.expectedCash);
    const closedAt = now();
    await tx
      .update(cashShifts)
      .set({
        countAttempts: [
          ...shift.countAttempts,
          {
            counts: count.counts,
            total: count.total,
            expected: totals.expectedCash,
            userId: user.id,
            at: closedAt.toISOString(),
          },
        ],
        closedBy: user.id,
        closedAt,
        cashSales: totals.cashSales,
        cashRefunds: totals.cashRefunds,
        payIns: totals.payIns,
        payOuts: totals.payOuts,
        expenses: totals.expenses,
        drops: totals.drops,
        cardSales: totals.cardSales,
        transferSales: totals.transferSales,
        salesCount: totals.salesCount,
        expectedCash: totals.expectedCash,
        countedCash: count.total,
        closingCounts: count.counts,
        difference,
        note: parsed.data.note,
        closingDrop: 0,
        leftInDrawer: count.total,
      })
      .where(and(eq(cashShifts.id, shift.id), eq(cashShifts.pharmacyId, pharmacy.id)));
    const level = varianceLevel(difference, rules);
    if (level === "major" || level === "severe") {
      // Kept for the history and the shortage patterns, decided at once.
      await tx.insert(cashReviews).values({
        pharmacyId: pharmacy.id,
        branchId: shift.branchId,
        drawerId: shift.drawerId,
        shiftId: shift.id,
        kind: "variance",
        amount: difference,
        userId: shift.openedBy,
        status: "approved",
        reviewedBy: user.id,
        reviewedAt: closedAt,
        reviewNote: parsed.data.note,
      });
    }
    return true;
  });
  if (!closed) return fail(t("cashDrawer.notOpen"));
  revalidateDrawer();
  return { ok: true, message: t("cashDrawer.forceClosed") };
}

// ---------------------------------------------------------------------------
// Manager: the branch's drawers
// ---------------------------------------------------------------------------

const drawerSchema = z.object({
  id: optionalId,
  name: requiredText(60),
});

/** Adds a drawer to the current branch, or renames one. */
export async function saveDrawer(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!isManager(user)) return fail(t("cashDrawer.managerOnly"));
  if (branchChanged(formData, branch)) return fail(t("branches.changedElsewhere"));
  const parsed = drawerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { id, name } = parsed.data;

  const db = await getDb();
  try {
    if (id) {
      const updated = await db
        .update(cashDrawers)
        .set({ name })
        .where(
          and(
            eq(cashDrawers.id, id),
            eq(cashDrawers.pharmacyId, pharmacy.id),
            eq(cashDrawers.branchId, branch.id),
          ),
        )
        .returning({ id: cashDrawers.id });
      if (updated.length === 0) return fail(t("common.notFound"));
    } else {
      await db
        .insert(cashDrawers)
        .values({ pharmacyId: pharmacy.id, branchId: branch.id, name });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { name: t("cashDrawer.drawerNameTaken") } };
    }
    throw error;
  }
  revalidateDrawer();
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/** Activates or deactivates a drawer of the current branch; an open drawer stays active. */
export async function setDrawerActive(
  drawerId: string,
  active: boolean,
  activeBranchId: string,
): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!isManager(user)) return fail(t("cashDrawer.managerOnly"));
  if (activeBranchId !== branch.id) return fail(t("branches.changedElsewhere"));
  if (!requiredId.safeParse(drawerId).success) return fail(t("common.notFound"));

  const db = await getDb();
  const drawer = await findDrawer(db, branch, drawerId);
  if (!drawer) return fail(t("common.notFound"));
  if (!active) {
    const open = await db.$count(
      cashShifts,
      and(
        eq(cashShifts.pharmacyId, pharmacy.id),
        eq(cashShifts.drawerId, drawer.id),
        isNull(cashShifts.closedAt),
      ),
    );
    if (open > 0) return fail(t("cashDrawer.drawerInUse"));
  }
  await db
    .update(cashDrawers)
    .set({ isActive: active })
    .where(and(eq(cashDrawers.id, drawer.id), eq(cashDrawers.pharmacyId, pharmacy.id)));
  revalidateDrawer();
  return { ok: true, message: t(active ? "cashDrawer.drawerActivated" : "cashDrawer.drawerDeactivated") };
}
