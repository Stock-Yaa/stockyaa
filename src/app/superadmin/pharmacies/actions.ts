"use server";

import { hash, truncates } from "bcryptjs";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CURRENCIES, TIMEZONES } from "@/lib/options";
import { getDb, type Db } from "@/db";
import {
  PHARMACY_STATUSES,
  SUBSCRIPTION_STATUSES,
  branches,
  pharmacies,
  plans,
  purchaseItems,
  purchases,
  saleItems,
  sales,
  users,
} from "@/db/schema";
import type { MessageKey, Translate } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth";
import { currencyLocked } from "@/lib/currency-lock";
import { dayInTimezone, zonedDayEnd } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { now } from "@/lib/time";
import {
  formToObject,
  optionalDate,
  optionalEmail,
  optionalId,
  optionalText,
  requiredEmail,
  requiredId,
  requiredText,
} from "@/lib/validation";
import { addMonths, isValidDay } from "../_lib/dates";

/*
 * Every action here is a public endpoint: each one starts with
 * requireSuperAdmin() and validates its own arguments, including the ids that
 * arrive through .bind().
 */

const detailsShape = {
  name: requiredText(),
  email: optionalEmail,
  phone: optionalText(50),
  address: optionalText(),
  licenseNumber: optionalText(100),
  currency: z.enum(CURRENCIES, { error: "platform.invalidOption" }),
  timezone: z.enum(TIMEZONES, { error: "platform.invalidOption" }),
};

// bcrypt only reads the first 72 bytes, so longer passwords are refused rather
// than silently truncated.
const passwordField = z
  .string({ error: "common.required" })
  .min(8, "platform.passwordTooShort")
  .refine((v) => !truncates(v), "common.tooLong");

function invalid(error: z.ZodError, t: Translate): ActionState {
  return { ok: false, fieldErrors: fieldErrorsFrom(error, (m) => t(m as MessageKey)) };
}

function revalidatePlatform() {
  revalidatePath("/superadmin", "layout");
}

/** True when `error`, or a cause of it (Drizzle wraps driver errors), is a Postgres unique violation. */
function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ("code" in e && e.code === "23505") return true;
  }
  return false;
}

async function emailInUse(db: Db, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row !== undefined;
}

/** A plan a pharmacy may be put on: an active one, or the plan it already has. */
async function planAssignable(
  db: Db,
  planId: string,
  currentPlanId: string | null,
): Promise<boolean> {
  const [plan] = await db
    .select({ id: plans.id, isActive: plans.isActive })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  return plan !== undefined && (plan.isActive || plan.id === currentPlanId);
}

/** Instant for the form's end date: null for "no end date", undefined when it is not a real day. */
function endDateToInstant(day: string | null, timeZone: string): Date | null | undefined {
  if (!day) return null;
  return isValidDay(day) ? zonedDayEnd(day, timeZone) : undefined;
}

/** Users an action on a pharmacy's user list may touch: that pharmacy's own, never a super admin. */
function pharmacyUser(pharmacyId: string, userId: string) {
  return and(
    eq(users.id, userId),
    eq(users.pharmacyId, pharmacyId),
    ne(users.role, "superadmin"),
  );
}

// ---------------------------------------------------------------------------
// Pharmacy
// ---------------------------------------------------------------------------

const createSchema = z.object({
  ...detailsShape,
  planId: optionalId,
  subscriptionStatus: z.enum(["trial", "active"], { error: "platform.invalidOption" }),
  endDate: optionalDate,
  adminName: requiredText(100),
  adminEmail: requiredEmail,
  adminPassword: passwordField,
});

/**
 * Creates a pharmacy with its first branch (named after it) and its first
 * admin user together, then opens its detail page.
 */
export async function createPharmacy(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = createSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { planId, subscriptionStatus, endDate, adminName, adminEmail, adminPassword, ...details } =
    parsed.data;

  const subscriptionEndsAt = endDateToInstant(endDate, details.timezone);
  if (subscriptionEndsAt === undefined) {
    return { ok: false, fieldErrors: { endDate: t("platform.invalidDate") } };
  }

  const db = await getDb();
  if (planId && !(await planAssignable(db, planId, null))) {
    return { ok: false, fieldErrors: { planId: t("platform.invalidOption") } };
  }
  if (await emailInUse(db, adminEmail)) {
    return { ok: false, fieldErrors: { adminEmail: t("platform.emailTaken") } };
  }

  const passwordHash = await hash(adminPassword, 10);
  let pharmacyId: string;
  try {
    pharmacyId = await db.transaction(async (tx) => {
      const [pharmacy] = await tx
        .insert(pharmacies)
        .values({ ...details, planId, subscriptionStatus, subscriptionEndsAt })
        .returning({ id: pharmacies.id });
      await tx.insert(branches).values({
        pharmacyId: pharmacy.id,
        name: details.name,
        address: details.address,
        phone: details.phone,
      });
      await tx.insert(users).values({
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: "admin",
        pharmacyId: pharmacy.id,
      });
      return pharmacy.id;
    });
  } catch (error) {
    // Two requests can pass the check above together; the unique index on
    // users.email decides, and the transaction leaves no pharmacy behind.
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { adminEmail: t("platform.emailTaken") } };
    }
    throw error;
  }

  revalidatePlatform();
  redirect(`/superadmin/pharmacies/${pharmacyId}`);
}

const detailsSchema = z.object({ id: requiredId, ...detailsShape });

export async function updatePharmacyDetails(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = detailsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { id, ...details } = parsed.data;

  const db = await getDb();
  // Old amounts would be relabelled, not converted (see currencyLocked).
  const [current] = await db
    .select({ currency: pharmacies.currency })
    .from(pharmacies)
    .where(eq(pharmacies.id, id))
    .limit(1);
  if (!current) return { ok: false, message: t("common.notFound") };
  if (details.currency !== current.currency && (await currencyLocked(db, id))) {
    return { ok: false, fieldErrors: { currency: t("platform.currencyLocked") } };
  }
  const updated = await db
    .update(pharmacies)
    .set(details)
    .where(eq(pharmacies.id, id))
    .returning({ id: pharmacies.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  revalidatePlatform();
  return { ok: true, message: t("common.updated") };
}

const statusArgs = z.tuple([requiredId, z.enum(PHARMACY_STATUSES)]);

/** Suspends or reactivates a pharmacy. Nothing is deleted either way. */
export async function setPharmacyStatus(
  id: string,
  status: (typeof PHARMACY_STATUSES)[number],
): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();
  const args = statusArgs.safeParse([id, status]);
  if (!args.success) return { ok: false, message: t("common.notFound") };
  const [pharmacyId, newStatus] = args.data;

  const db = await getDb();
  const updated = await db
    .update(pharmacies)
    .set({ status: newStatus })
    .where(eq(pharmacies.id, pharmacyId))
    .returning({ id: pharmacies.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  revalidatePlatform();
  return {
    ok: true,
    message: t(
      newStatus === "suspended" ? "platform.suspendedNotice" : "platform.reactivatedNotice",
    ),
  };
}

const deleteSchema = z.object({ id: requiredId, confirmName: requiredText() });

/**
 * Deletes a pharmacy and everything it owns. Irreversible, so the name typed
 * in the confirmation dialog is checked again here.
 */
export async function deletePharmacy(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = deleteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { id, confirmName } = parsed.data;

  const db = await getDb();
  const outcome = await db.transaction(async (tx) => {
    // Lock the row first. Creating a sale or purchase updates the pharmacy's
    // counters, so none can be added between the deletes below.
    const [pharmacy] = await tx
      .select({ name: pharmacies.name })
      .from(pharmacies)
      .where(eq(pharmacies.id, id))
      .for("update");
    if (!pharmacy) return "missing";
    if (pharmacy.name !== confirmName) return "mismatch";

    // sale_items and purchase_items point at products with ON DELETE RESTRICT,
    // which would stop the cascade from the pharmacy when it reaches products.
    // Remove them first; every other table follows the pharmacy by cascade.
    await tx
      .delete(saleItems)
      .where(
        inArray(
          saleItems.saleId,
          tx.select({ id: sales.id }).from(sales).where(eq(sales.pharmacyId, id)),
        ),
      );
    await tx
      .delete(purchaseItems)
      .where(
        inArray(
          purchaseItems.purchaseId,
          tx.select({ id: purchases.id }).from(purchases).where(eq(purchases.pharmacyId, id)),
        ),
      );
    await tx.delete(pharmacies).where(eq(pharmacies.id, id));
    return "deleted";
  });

  if (outcome === "missing") return { ok: false, message: t("common.notFound") };
  if (outcome === "mismatch") {
    return { ok: false, fieldErrors: { confirmName: t("platform.deleteNameMismatch") } };
  }

  revalidatePlatform();
  redirect("/superadmin/pharmacies");
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

const subscriptionSchema = z.object({
  id: requiredId,
  planId: optionalId,
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES, { error: "platform.invalidOption" }),
  endDate: optionalDate,
});

export async function updateSubscription(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = subscriptionSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { id, planId, subscriptionStatus, endDate } = parsed.data;

  const db = await getDb();
  const [pharmacy] = await db
    .select({ planId: pharmacies.planId, timezone: pharmacies.timezone })
    .from(pharmacies)
    .where(eq(pharmacies.id, id))
    .limit(1);
  if (!pharmacy) return { ok: false, message: t("common.notFound") };

  const subscriptionEndsAt = endDateToInstant(endDate, pharmacy.timezone);
  if (subscriptionEndsAt === undefined) {
    return { ok: false, fieldErrors: { endDate: t("platform.invalidDate") } };
  }
  if (planId && !(await planAssignable(db, planId, pharmacy.planId))) {
    return { ok: false, fieldErrors: { planId: t("platform.invalidOption") } };
  }

  await db
    .update(pharmacies)
    .set({ planId, subscriptionStatus, subscriptionEndsAt })
    .where(eq(pharmacies.id, id));

  revalidatePlatform();
  return { ok: true, message: t("platform.subscriptionSaved") };
}

const extendArgs = z.tuple([requiredId, z.enum(["month", "year"])]);

/**
 * "+1 month" / "+1 year": moves the end date on from the later of now and the
 * current end date, keeping it at the end of a day in the pharmacy's time zone.
 */
export async function extendSubscription(
  id: string,
  period: "month" | "year",
): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();
  const args = extendArgs.safeParse([id, period]);
  if (!args.success) return { ok: false, message: t("common.notFound") };
  const [pharmacyId, by] = args.data;

  const db = await getDb();
  const [pharmacy] = await db
    .select({
      subscriptionEndsAt: pharmacies.subscriptionEndsAt,
      currency: pharmacies.currency,
      timezone: pharmacies.timezone,
    })
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacyId))
    .limit(1);
  if (!pharmacy) return { ok: false, message: t("common.notFound") };

  const current = now();
  const endsAt = pharmacy.subscriptionEndsAt;
  const from = endsAt && endsAt > current ? endsAt : current;
  const newDay = addMonths(dayInTimezone(from, pharmacy.timezone), by === "year" ? 12 : 1);
  const subscriptionEndsAt = zonedDayEnd(newDay, pharmacy.timezone);

  await db
    .update(pharmacies)
    .set({ subscriptionEndsAt })
    .where(eq(pharmacies.id, pharmacyId));

  revalidatePlatform();
  const f = await getFormat(pharmacy);
  return { ok: true, message: t("platform.extended", { date: f.date(subscriptionEndsAt) }) };
}

/** "No end date": the subscription runs until the super admin changes it. */
export async function clearSubscriptionEnd(id: string): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();
  const parsedId = requiredId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  const updated = await db
    .update(pharmacies)
    .set({ subscriptionEndsAt: null })
    .where(eq(pharmacies.id, parsedId.data))
    .returning({ id: pharmacies.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  revalidatePlatform();
  return { ok: true, message: t("platform.endDateCleared") };
}

// ---------------------------------------------------------------------------
// Users of a pharmacy
// ---------------------------------------------------------------------------

const addUserSchema = z.object({
  pharmacyId: requiredId,
  name: requiredText(100),
  email: requiredEmail,
  password: passwordField,
});

/** Adds another admin user to a pharmacy. */
export async function addPharmacyUser(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = addUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { pharmacyId, name, email, password } = parsed.data;

  const db = await getDb();
  const [pharmacy] = await db
    .select({ id: pharmacies.id })
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacyId))
    .limit(1);
  if (!pharmacy) return { ok: false, message: t("common.notFound") };
  if (await emailInUse(db, email)) {
    return { ok: false, fieldErrors: { email: t("platform.emailTaken") } };
  }

  try {
    await db.insert(users).values({
      name,
      email,
      passwordHash: await hash(password, 10),
      role: "admin",
      pharmacyId: pharmacy.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { email: t("platform.emailTaken") } };
    }
    throw error;
  }

  revalidatePlatform();
  return { ok: true, message: t("platform.userAdded") };
}

const resetPasswordSchema = z.object({
  pharmacyId: requiredId,
  userId: requiredId,
  password: passwordField,
});

export async function resetUserPassword(formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();

  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error, t);
  const { pharmacyId, userId, password } = parsed.data;

  const db = await getDb();
  const updated = await db
    .update(users)
    // A new password also lifts a sign-in pause from wrong guesses.
    .set({ passwordHash: await hash(password, 10), loginFailures: 0, loginLockedUntil: null })
    .where(pharmacyUser(pharmacyId, userId))
    .returning({ id: users.id });
  if (updated.length === 0) return { ok: false, message: t("common.notFound") };

  return { ok: true, message: t("platform.passwordReset") };
}

const userActiveArgs = z.tuple([requiredId, requiredId, z.boolean()]);

/** Activates or deactivates a pharmacy user; a deactivated user is signed out on their next request. */
export async function setUserActive(
  pharmacyId: string,
  userId: string,
  isActive: boolean,
): Promise<ActionState> {
  await requireSuperAdmin();
  const t = await getT();
  const args = userActiveArgs.safeParse([pharmacyId, userId, isActive]);
  if (!args.success) return { ok: false, message: t("common.notFound") };
  const [ofPharmacy, targetUser, active] = args.data;

  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    const [target] = await tx
      .select({ role: users.role })
      .from(users)
      .where(pharmacyUser(ofPharmacy, targetUser))
      .for("update");
    if (!target) return "common.notFound";
    // As on the pharmacy side: the last active admin stays, or nobody can manage the pharmacy.
    if (!active && target.role === "admin") {
      const otherAdmins = await tx.$count(
        users,
        and(
          eq(users.pharmacyId, ofPharmacy),
          eq(users.role, "admin"),
          eq(users.isActive, true),
          ne(users.id, targetUser),
        ),
      );
      if (otherAdmins === 0) return "platform.lastAdmin";
    }
    await tx.update(users).set({ isActive: active }).where(eq(users.id, targetUser));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };

  revalidatePlatform();
  return {
    ok: true,
    message: t(active ? "platform.userActivated" : "platform.userDeactivated"),
  };
}
