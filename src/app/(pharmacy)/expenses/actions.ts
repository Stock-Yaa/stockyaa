"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { EXPENSE_COLORS, expenseCategories, expenses } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged, canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { isCalendarDay, MAX_DAY, MIN_DAY } from "@/lib/dates";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-error";
import { round2 } from "@/lib/utils";
import {
  formToObject,
  nonNegativeNumber,
  optionalId,
  requiredId,
  requiredText,
} from "@/lib/validation";
import { expenseScope, visibleExpenses } from "./filters";

// Largest value the money columns (numeric(12, 2)) can hold.
const MAX_MONEY = 9_999_999_999.99;

const expenseSchema = z.object({
  id: optionalId,
  categoryId: z.uuid("expenses.categoryMissing"),
  expenseDate: z
    .string({ error: "common.required" })
    .refine((v) => isCalendarDay(v) && v >= MIN_DAY && v <= MAX_DAY, "common.invalidDate"),
  amount: nonNegativeNumber
    .refine((v) => v > 0, "common.mustBePositive")
    .refine((v) => v <= MAX_MONEY, "common.invalidNumber"),
  description: requiredText(500),
});

/**
 * Creates an expense, or updates it when the form carries an `id`. Staff
 * record against their own branch; admins choose between a branch they may
 * use (`branchId`) and the whole business (an empty `branchId`).
 */
export async function saveExpense(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };

  const parsed = expenseSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }

  let branchId: string | null = branch.id;
  if (canSwitchBranch(user)) {
    const sent = formData.get("branchId");
    if (sent === "") branchId = null;
    else if (typeof sent === "string" && branches.some((b) => b.id === sent)) branchId = sent;
    else return { ok: false, fieldErrors: { branchId: t("expenses.invalidBranch") } };
  }

  const { id, ...data } = parsed.data;
  const values = { ...data, amount: round2(data.amount), branchId };
  const db = await getDb();

  const [category] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.id, values.categoryId),
        eq(expenseCategories.pharmacyId, pharmacy.id),
      ),
    )
    .limit(1);
  if (!category) {
    return { ok: false, fieldErrors: { categoryId: t("expenses.categoryMissing") } };
  }

  if (id) {
    // Only an expense the user can see: staff cannot edit whole-business ones.
    const updated = await db
      .update(expenses)
      .set(values)
      .where(and(eq(expenses.id, id), visibleExpenses(expenseScope(user, branch))))
      .returning({ id: expenses.id });
    if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  } else {
    await db.insert(expenses).values({ ...values, pharmacyId: pharmacy.id, userId: user.id });
  }

  revalidatePath("/expenses");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/**
 * Deletes an expense the user can see (the same visibility as the list).
 * `branchId` is the branch the page was rendered for.
 */
export async function deleteExpense(id: string, branchId: string): Promise<ActionState> {
  const { user, branch } = await requirePharmacy();
  const t = await getT();
  if (branchId !== branch.id) return { ok: false, message: t("branches.changedElsewhere") };
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  await db
    .delete(expenses)
    .where(and(eq(expenses.id, parsedId.data), visibleExpenses(expenseScope(user, branch))));
  revalidatePath("/expenses");
  return { ok: true, message: t("common.deleted") };
}

const categorySchema = z.object({
  id: optionalId,
  name: requiredText(100),
  color: z.enum(EXPENSE_COLORS, { error: "common.invalidChoice" }),
});

/** Creates an expense category, or edits it when the form carries an `id`. */
export async function saveExpenseCategory(formData: FormData): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, name, color } = parsed.data;
  const db = await getDb();
  const duplicate: ActionState = {
    ok: false,
    fieldErrors: { name: t("expenses.categoryExists") },
  };

  // The unique index is case-sensitive; also refuse names that differ only by case.
  const [sameName] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.pharmacyId, pharmacy.id),
        eq(sql`lower(${expenseCategories.name})`, name.toLowerCase()),
        id ? ne(expenseCategories.id, id) : undefined,
      ),
    )
    .limit(1);
  if (sameName) return duplicate;

  try {
    if (id) {
      const updated = await db
        .update(expenseCategories)
        .set({ name, color })
        .where(
          and(eq(expenseCategories.id, id), eq(expenseCategories.pharmacyId, pharmacy.id)),
        )
        .returning({ id: expenseCategories.id });
      if (updated.length === 0) return { ok: false, message: t("common.notFound") };
    } else {
      await db.insert(expenseCategories).values({ pharmacyId: pharmacy.id, name, color });
    }
  } catch (error) {
    // Someone else created the same name between the check and the write.
    if (isUniqueViolation(error)) return duplicate;
    throw error;
  }

  revalidatePath("/expenses");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

/** Deletes an expense category; refused while it still has expenses. */
export async function deleteExpenseCategory(id: string): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  try {
    await db
      .delete(expenseCategories)
      .where(
        and(
          eq(expenseCategories.id, parsedId.data),
          eq(expenseCategories.pharmacyId, pharmacy.id),
        ),
      );
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, message: t("expenses.categoryInUse") };
    throw error;
  }
  revalidatePath("/expenses");
  return { ok: true, message: t("common.deleted") };
}
