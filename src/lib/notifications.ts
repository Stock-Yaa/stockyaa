import { and, count, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  batches as batchesTable,
  notifications,
  pharmacies,
  type Branch,
  type NotificationType,
  type Pharmacy,
  type User,
} from "@/db/schema";
import { canSwitchBranch } from "./active-branch";
import { branchScope, listBranches } from "./branches";
import { addDays, daysBetween, todayInTimezone } from "./dates";
import { getBatchesExpiringBetween, getLowStockProducts } from "./reports";
import { subscriptionState } from "./subscription";
import { daysFromNow, daysUntil, now } from "./time";

/*
 * Notifications are created by scanning the pharmacy's current state, not by
 * the code that changes it, so every way stock can change is covered. A scan
 * is idempotent: each alert has a key, unique per pharmacy, and inserting an
 * existing key does nothing. Stock alerts belong to one branch (its id is part
 * of the key); subscription alerts belong to the whole pharmacy (branchId null).
 */

// Page loads scan at most this often; "Scan now" always scans.
const AUTO_SCAN_MINUTES = 5;
// Stock alerts come back once a week while the problem lasts.
const REPEAT_DAYS = 7;
// Warn this many days before the subscription ends.
const SUBSCRIPTION_WARNING_DAYS = 7;
// Read notifications older than this are deleted during a scan.
const KEEP_READ_DAYS = 90;

/** Types that concern the whole pharmacy rather than one branch. */
export const PHARMACY_WIDE_TYPES: NotificationType[] = ["subscription_ended", "subscription_ending"];
const STOCK_TYPES: NotificationType[] = ["out_of_stock", "low_stock", "expired", "expiring"];
/** Types only admins see; created by the code that raises them, not by the scan. */
const MANAGER_TYPES: NotificationType[] = ["cash_review"];

type NewNotification = typeof notifications.$inferInsert;

/** Number of the REPEAT_DAYS-long period `day` falls in, for repeating keys. */
function periodOf(day: string): number {
  return Math.floor(daysBetween("1970-01-01", day) / REPEAT_DAYS);
}

/** Creates any missing notifications for the pharmacy's current state, in every active branch. */
export async function scanNotifications(db: DbOrTx, pharmacy: Pharmacy): Promise<void> {
  const today = todayInTimezone(pharmacy.timezone);
  const period = periodOf(today);
  const alertUntil = addDays(today, pharmacy.expiryAlertDays);
  const active = (await listBranches(db, pharmacy.id)).filter((b) => b.isActive);
  const stock = await Promise.all(
    active.map(async (branch) => {
      const scope = branchScope(branch);
      const [lowStock, batches, carried] = await Promise.all([
        getLowStockProducts(db, scope, today),
        getBatchesExpiringBetween(db, scope, null, alertUntil),
        // With several branches, a branch is only warned about products it
        // has stocked at some point, so a new branch is not flooded with
        // "out of stock" for everything the pharmacy sells.
        active.length > 1
          ? db
              .selectDistinct({ productId: batchesTable.productId })
              .from(batchesTable)
              .where(eq(batchesTable.branchId, branch.id))
              .then((rows) => new Set(rows.map((r) => r.productId)))
          : null,
      ]);
      return {
        branch,
        lowStock: carried ? lowStock.filter((p) => carried.has(p.id)) : lowStock,
        batches,
      };
    }),
  );

  const rows: NewNotification[] = [];
  const add = (
    branchId: string | null,
    type: NewNotification["type"],
    key: string,
    data: NewNotification["data"],
  ) => rows.push({ pharmacyId: pharmacy.id, branchId, type, key: `${type}:${key}`, data });

  for (const { branch, lowStock, batches } of stock) {
    for (const p of lowStock) {
      const data = { productId: p.id, name: p.name, unit: p.unit, quantity: p.quantity, reorderLevel: p.reorderLevel };
      if (p.quantity <= 0) add(branch.id, "out_of_stock", `${branch.id}:${p.id}:${period}`, data);
      else add(branch.id, "low_stock", `${branch.id}:${p.id}:${period}`, data);
    }
    for (const b of batches) {
      const data = {
        productId: b.productId,
        name: b.productName,
        unit: b.unit,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
      };
      if (b.expiryDate! < today) add(branch.id, "expired", `${branch.id}:${b.id}`, data);
      else add(branch.id, "expiring", `${branch.id}:${b.id}`, data);
    }
  }

  const endsAt = pharmacy.subscriptionEndsAt;
  if (endsAt) {
    const state = subscriptionState(pharmacy, now());
    const endsKey = endsAt.toISOString();
    if (state === "expired") {
      add(null, "subscription_ended", endsKey, { endsAt: endsKey });
    } else if (
      (state === "active" || state === "trial") &&
      endsAt <= daysFromNow(SUBSCRIPTION_WARNING_DAYS)
    ) {
      add(null, "subscription_ending", endsKey, { endsAt: endsKey, days: daysUntil(endsAt) });
    }
  }

  if (rows.length > 0) {
    await db
      .insert(notifications)
      .values(rows)
      .onConflictDoNothing({ target: [notifications.pharmacyId, notifications.key] });
  }
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.pharmacyId, pharmacy.id),
        or(
          and(isNotNull(notifications.readAt), lt(notifications.createdAt, daysFromNow(-KEEP_READ_DAYS))),
          // Stock alerts from before branches existed: the scan above has just
          // recreated whatever still applies, now tied to its branch.
          and(isNull(notifications.branchId), inArray(notifications.type, STOCK_TYPES)),
        ),
      ),
    );
}

/**
 * Scans unless another request scanned in the last few minutes. Claiming the
 * scan with a conditional update keeps simultaneous page loads from all scanning.
 */
export async function scanNotificationsIfDue(db: DbOrTx, pharmacy: Pharmacy): Promise<void> {
  const claimed = await db
    .update(pharmacies)
    .set({ notificationsScannedAt: now() })
    .where(
      and(
        eq(pharmacies.id, pharmacy.id),
        or(
          isNull(pharmacies.notificationsScannedAt),
          lt(
            pharmacies.notificationsScannedAt,
            sql`now() - make_interval(mins => ${AUTO_SCAN_MINUTES})`,
          ),
        ),
      ),
    )
    .returning({ id: pharmacies.id });
  if (claimed.length > 0) await scanNotifications(db, pharmacy);
}

/** Who is looking: the user and their pharmacy and branch, as requirePharmacy() returns them. */
export type NotificationViewer = {
  user: Pick<User, "role">;
  pharmacy: Pick<Pharmacy, "id">;
  branch: Pick<Branch, "id">;
};

/**
 * The notifications a user may see and mark read: admins see the whole
 * pharmacy; staff see their own branch's alerts and the pharmacy-wide ones.
 */
export function visibleNotifications({ user, pharmacy, branch }: NotificationViewer): SQL {
  const mine = eq(notifications.pharmacyId, pharmacy.id);
  if (canSwitchBranch(user)) return mine;
  return and(
    mine,
    // Cash drawer reviews are for managers.
    notInArray(notifications.type, MANAGER_TYPES),
    or(
      eq(notifications.branchId, branch.id),
      // Only subscription types: a stock alert without a branch predates
      // branches and must not reach staff of every branch.
      and(isNull(notifications.branchId), inArray(notifications.type, PHARMACY_WIDE_TYPES)),
    ),
  )!;
}

export async function countUnreadNotifications(
  db: DbOrTx,
  viewer: NotificationViewer,
): Promise<number> {
  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(visibleNotifications(viewer), isNull(notifications.readAt)));
  return unread;
}
