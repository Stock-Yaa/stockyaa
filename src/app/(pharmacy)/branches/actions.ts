"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { branches, cashShifts, pharmacies, stockTransfers, users } from "@/db/schema";
import type { MessageKey, TranslateVars } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchLimit, limitReachedKey } from "@/lib/branches";
import { isUniqueViolation } from "@/lib/db-error";
import { buyerBranchField } from "@/lib/tax-invoice";
import { formToObject, optionalId, optionalText, requiredId, requiredText } from "@/lib/validation";

/** Why a branch change was refused, or null when it went through. */
type Refusal = { key: MessageKey; vars?: TranslateVars } | null;

const branchSchema = z.object({
  id: optionalId,
  name: requiredText(100),
  address: optionalText(),
  phone: optionalText(50),
  taxBranchCode: buyerBranchField,
});

/**
 * Creates a branch, or updates it when the form carries an `id`. A new branch
 * is refused once the pharmacy has as many active branches as its plan allows.
 */
export async function saveBranch(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(user)) return { ok: false, message: t("common.adminOnly") };

  const parsed = branchSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, ...values } = parsed.data;
  const db = await getDb();

  try {
    const refusal = await db.transaction(async (tx): Promise<Refusal> => {
      if (id) {
        const updated = await tx
          .update(branches)
          .set(values)
          .where(and(eq(branches.id, id), eq(branches.pharmacyId, pharmacy.id)))
          .returning({ id: branches.id });
        return updated.length === 0 ? { key: "common.notFound" } : null;
      }
      // Lock the pharmacy so two requests cannot both take the last free branch.
      await tx
        .select({ id: pharmacies.id })
        .from(pharmacies)
        .where(eq(pharmacies.id, pharmacy.id))
        .for("update");
      const limit = await branchLimit(tx, pharmacy);
      const active = await tx.$count(
        branches,
        and(eq(branches.pharmacyId, pharmacy.id), eq(branches.isActive, true)),
      );
      if (active >= limit) return { key: limitReachedKey(limit), vars: { limit } };
      await tx.insert(branches).values({ ...values, pharmacyId: pharmacy.id });
      return null;
    });
    if (refusal) return { ok: false, message: t(refusal.key, refusal.vars) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { name: t("branches.nameTaken") } };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

const activeArgs = z.tuple([requiredId, z.boolean()]);


/**
 * Activates or deactivates a branch. Deactivating keeps all its history but is
 * refused while work is still open there: it is the last active branch, staff
 * still work in it, its cash drawer is open, or transfers are on their way.
 */
export async function setBranchActive(id: string, isActive: boolean): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(user)) return { ok: false, message: t("common.adminOnly") };
  const args = activeArgs.safeParse([id, isActive]);
  if (!args.success) return { ok: false, message: t("common.notFound") };
  const [branchId, active] = args.data;

  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<Refusal> => {
    await tx
      .select({ id: pharmacies.id })
      .from(pharmacies)
      .where(eq(pharmacies.id, pharmacy.id))
      .for("update");
    const [branch] = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.pharmacyId, pharmacy.id)))
      .limit(1);
    if (!branch) return { key: "common.notFound" };
    if (branch.isActive === active) return null;

    if (active) {
      const limit = await branchLimit(tx, pharmacy);
      const count = await tx.$count(
        branches,
        and(eq(branches.pharmacyId, pharmacy.id), eq(branches.isActive, true)),
      );
      if (count >= limit) return { key: limitReachedKey(limit), vars: { limit } };
    } else {
      const others = await tx.$count(
        branches,
        and(
          eq(branches.pharmacyId, pharmacy.id),
          eq(branches.isActive, true),
          ne(branches.id, branch.id),
        ),
      );
      if (others === 0) return { key: "branches.lastActive" };
      const staff = await tx.$count(
        users,
        and(eq(users.branchId, branch.id), eq(users.isActive, true)),
      );
      if (staff > 0) return { key: "branches.hasStaff" };
      const openShifts = await tx.$count(
        cashShifts,
        and(eq(cashShifts.branchId, branch.id), isNull(cashShifts.closedAt)),
      );
      if (openShifts > 0) return { key: "branches.hasOpenShift" };
      const inTransit = await tx.$count(
        stockTransfers,
        and(
          eq(stockTransfers.pharmacyId, pharmacy.id),
          eq(stockTransfers.status, "in_transit"),
          or(eq(stockTransfers.fromBranchId, branch.id), eq(stockTransfers.toBranchId, branch.id)),
        ),
      );
      if (inTransit > 0) return { key: "branches.hasTransfers" };
    }

    await tx.update(branches).set({ isActive: active }).where(eq(branches.id, branch.id));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal.key, refusal.vars) };

  revalidatePath("/", "layout");
  return { ok: true, message: t(active ? "branches.activated" : "branches.deactivated") };
}
