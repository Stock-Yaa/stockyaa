"use server";

import { hash, truncates } from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import { branches, pharmacies, users, type Pharmacy } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { planLimits } from "@/lib/branches";
import { isUniqueViolation } from "@/lib/db-error";
import { hashPin, pinField } from "@/lib/pin";
import {
  formToObject,
  optionalId,
  requiredEmail,
  requiredId,
  requiredText,
} from "@/lib/validation";

/*
 * The pharmacy admin's user list. Every action checks that the caller is an
 * admin and that the target user belongs to the caller's pharmacy; super
 * admins are never touched.
 */

// bcrypt only reads the first 72 bytes, so longer passwords are refused rather
// than silently truncated.
const passwordField = z
  .string({ error: "common.required" })
  .min(8, "users.passwordTooShort")
  .refine((v) => !truncates(v), "common.tooLong");

const pharmacyRole = z.enum(["admin", "staff"], { error: "common.invalidChoice" });

const userSchema = z.object({
  id: optionalId,
  name: requiredText(100),
  email: requiredEmail,
  role: pharmacyRole,
  branchId: optionalId,
  password: z.preprocess((v) => (v === "" ? undefined : v), passwordField.optional()),
});

/** A user of this pharmacy (never a super admin). */
const pharmacyUser = (pharmacyId: string, userId: string) =>
  and(eq(users.id, userId), eq(users.pharmacyId, pharmacyId), ne(users.role, "superadmin"));

/** True when an active admin other than `exceptUserId` remains. */
async function otherActiveAdmin(tx: Tx, pharmacyId: string, exceptUserId: string) {
  const count = await tx.$count(
    users,
    and(
      eq(users.pharmacyId, pharmacyId),
      eq(users.role, "admin"),
      eq(users.isActive, true),
      ne(users.id, exceptUserId),
    ),
  );
  return count > 0;
}

/**
 * True when the plan has no room for another active admin besides
 * `exceptUserId` (a Standard plan has one). Locks the pharmacy so two requests
 * cannot both take the last admin seat.
 */
async function adminLimitReached(
  tx: Tx,
  pharmacy: Pick<Pharmacy, "id" | "planId">,
  exceptUserId: string | null,
) {
  const { maxAdmins } = await planLimits(tx, pharmacy);
  if (maxAdmins === null) return false;
  await tx
    .select({ id: pharmacies.id })
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacy.id))
    .for("update");
  const count = await tx.$count(
    users,
    and(
      eq(users.pharmacyId, pharmacy.id),
      eq(users.role, "admin"),
      eq(users.isActive, true),
      exceptUserId ? ne(users.id, exceptUserId) : undefined,
    ),
  );
  return count >= maxAdmins;
}

/**
 * Creates a user (with a password), or updates one when the form carries an
 * `id`. Staff must work in an active branch of the pharmacy; admins work in
 * every branch, so their branch is cleared.
 */
export async function saveUser(formData: FormData): Promise<ActionState> {
  const { user: me, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(me)) return { ok: false, message: t("common.adminOnly") };

  const parsed = userSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { id, name, email, role, password } = parsed.data;
  const branchId = role === "staff" ? parsed.data.branchId : null;
  if (!id && !password) return { ok: false, fieldErrors: { password: t("common.required") } };
  if (role === "staff" && !branchId) {
    return { ok: false, fieldErrors: { branchId: t("users.branchRequired") } };
  }
  if (id === me.id && role !== me.role) return { ok: false, message: t("users.notYourself") };

  const db = await getDb();
  const passwordHash = password ? await hash(password, 10) : null;
  try {
    const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
      if (branchId) {
        const [branch] = await tx
          .select({ id: branches.id })
          .from(branches)
          .where(
            and(
              eq(branches.id, branchId),
              eq(branches.pharmacyId, pharmacy.id),
              eq(branches.isActive, true),
            ),
          )
          .limit(1);
        if (!branch) return "users.branchRequired";
      }

      if (!id) {
        if (role === "admin" && (await adminLimitReached(tx, pharmacy, null))) {
          return "users.adminLimit";
        }
        await tx.insert(users).values({
          name,
          email,
          role,
          branchId,
          passwordHash: passwordHash!,
          pharmacyId: pharmacy.id,
        });
        return null;
      }

      const [existing] = await tx
        .select({ role: users.role, isActive: users.isActive })
        .from(users)
        .where(pharmacyUser(pharmacy.id, id))
        .for("update");
      if (!existing) return "common.notFound";
      if (
        existing.role === "admin" &&
        role !== "admin" &&
        existing.isActive &&
        !(await otherActiveAdmin(tx, pharmacy.id, id))
      ) {
        return "users.lastAdmin";
      }
      if (
        existing.role !== "admin" &&
        role === "admin" &&
        existing.isActive &&
        (await adminLimitReached(tx, pharmacy, id))
      ) {
        return "users.adminLimit";
      }
      // A password typed on the edit form is ignored: resetting has its own dialog.
      await tx.update(users).set({ name, email, role, branchId }).where(eq(users.id, id));
      return null;
    });
    if (refusal === "users.branchRequired") {
      return { ok: false, fieldErrors: { branchId: t(refusal) } };
    }
    if (refusal) return { ok: false, message: t(refusal) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { email: t("users.emailTaken") } };
    }
    throw error;
  }

  revalidatePath("/users");
  revalidatePath("/branches");
  return { ok: true, message: t(id ? "common.updated" : "common.created") };
}

const resetSchema = z.object({ userId: requiredId, password: passwordField });

/**
 * Sets a new password for another user of the pharmacy, which signs them out
 * everywhere. Admins change their own password on the profile page.
 */
export async function resetPassword(formData: FormData): Promise<ActionState> {
  const { user: me, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(me)) return { ok: false, message: t("common.adminOnly") };

  const parsed = resetSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { userId, password } = parsed.data;
  if (userId === me.id) return { ok: false, message: t("users.notYourself") };

  const db = await getDb();
  const updated = await db
    .update(users)
    .set({ passwordHash: await hash(password, 10) })
    .where(pharmacyUser(pharmacy.id, userId))
    .returning({ id: users.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  return { ok: true, message: t("users.passwordReset") };
}

const pinSchema = z.object({ userId: requiredId, pin: pinField });

/**
 * Sets the cash drawer PIN of a user of the pharmacy (their own too), and
 * lifts a lock from wrong tries.
 */
export async function setUserPin(formData: FormData): Promise<ActionState> {
  const { user: me, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(me)) return { ok: false, message: t("common.adminOnly") };
  const parsed = pinSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const db = await getDb();
  const updated = await db
    .update(users)
    .set({ pinHash: await hashPin(parsed.data.pin), pinFailures: 0, pinLockedUntil: null })
    .where(pharmacyUser(pharmacy.id, parsed.data.userId))
    .returning({ id: users.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };
  revalidatePath("/users");
  return { ok: true, message: t("users.pinSaved") };
}

const activeArgs = z.tuple([requiredId, z.boolean()]);

/** Activates or deactivates another user; a deactivated user is signed out on their next request. */
export async function setUserActive(userId: string, isActive: boolean): Promise<ActionState> {
  const { user: me, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (!canSwitchBranch(me)) return { ok: false, message: t("common.adminOnly") };
  const args = activeArgs.safeParse([userId, isActive]);
  if (!args.success) return { ok: false, message: t("common.notFound") };
  const [targetId, active] = args.data;
  if (targetId === me.id) return { ok: false, message: t("users.notYourself") };

  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    const [target] = await tx
      .select({ role: users.role, branchId: users.branchId })
      .from(users)
      .where(pharmacyUser(pharmacy.id, targetId))
      .for("update");
    if (!target) return "common.notFound";
    if (!active && target.role === "admin" && !(await otherActiveAdmin(tx, pharmacy.id, targetId))) {
      return "users.lastAdmin";
    }
    if (active && target.role === "admin" && (await adminLimitReached(tx, pharmacy, targetId))) {
      return "users.adminLimit";
    }
    // Staff can only be activated into a branch that is itself active.
    if (active && target.role === "staff") {
      const [branch] = target.branchId
        ? await tx
            .select({ isActive: branches.isActive })
            .from(branches)
            .where(and(eq(branches.id, target.branchId), eq(branches.pharmacyId, pharmacy.id)))
            .limit(1)
        : [];
      if (!branch?.isActive) return "users.branchRequired";
    }
    await tx.update(users).set({ isActive: active }).where(eq(users.id, targetId));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };

  revalidatePath("/users");
  revalidatePath("/branches");
  return { ok: true, message: t(active ? "users.activated" : "users.deactivated") };
}
