import { compare, hash } from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { users, type Branch } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { now } from "./time";

/*
 * Cash drawer PINs. Several people share one signed-in till, so whoever opens,
 * counts or approves picks their name and types their PIN. A PIN has few
 * combinations, so it locks after a few wrong tries in a row.
 */

export const pinField = z
  .string({ error: "common.required" })
  .regex(/^\d{4,6}$/, "users.pinInvalid");

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export function hashPin(pin: string): Promise<string> {
  return hash(pin, 10);
}

export type PinCheck =
  | { ok: true; user: { id: string; name: string; role: "admin" | "manager" | "staff" } }
  | { ok: false; error: MessageKey };

/**
 * Checks `pin` for an active user of the pharmacy. With `branch`, the user must
 * work there (a manager or staff member of that branch, or an admin); with
 * `managerOnly`, the user must be a manager or an admin (approving
 * something). Counts wrong tries.
 */
export async function checkPin(
  db: DbOrTx,
  input: {
    pharmacyId: string;
    userId: string;
    pin: string;
    branch?: Pick<Branch, "id">;
    managerOnly?: boolean;
  },
): Promise<PinCheck> {
  if (!pinField.safeParse(input.pin).success) return { ok: false, error: "cashDrawer.pinWrong" };
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      branchId: users.branchId,
      isActive: users.isActive,
      pinHash: users.pinHash,
      pinFailures: users.pinFailures,
      pinLockedUntil: users.pinLockedUntil,
    })
    .from(users)
    .where(
      and(
        eq(users.id, input.userId),
        eq(users.pharmacyId, input.pharmacyId),
        ne(users.role, "superadmin"),
      ),
    )
    .limit(1);
  if (!user || !user.isActive) return { ok: false, error: "cashDrawer.pinUserNotFound" };
  const role = user.role === "admin" || user.role === "manager" ? user.role : "staff";
  if (input.managerOnly && role === "staff") return { ok: false, error: "cashDrawer.managerOnly" };
  if (input.branch && role !== "admin" && user.branchId !== input.branch.id) {
    return { ok: false, error: "cashDrawer.pinUserNotFound" };
  }
  if (!user.pinHash) return { ok: false, error: "cashDrawer.pinNotSet" };
  if (user.pinLockedUntil && user.pinLockedUntil > now()) {
    return { ok: false, error: "cashDrawer.pinLocked" };
  }

  if (await compare(input.pin, user.pinHash)) {
    if (user.pinFailures > 0 || user.pinLockedUntil) {
      await db
        .update(users)
        .set({ pinFailures: 0, pinLockedUntil: null })
        .where(eq(users.id, user.id));
    }
    return { ok: true, user: { id: user.id, name: user.name, role } };
  }

  // Counted in the database, so parallel guesses cannot slip past the limit.
  const [after] = await db
    .update(users)
    .set({ pinFailures: sql`${users.pinFailures} + 1` })
    .where(eq(users.id, user.id))
    .returning({ failures: users.pinFailures });
  if (after && after.failures >= MAX_FAILURES) {
    await db
      .update(users)
      .set({
        pinFailures: 0,
        pinLockedUntil: sql`now() + make_interval(mins => ${LOCK_MINUTES})`,
      })
      .where(eq(users.id, user.id));
    return { ok: false, error: "cashDrawer.pinLocked" };
  }
  return { ok: false, error: "cashDrawer.pinWrong" };
}
