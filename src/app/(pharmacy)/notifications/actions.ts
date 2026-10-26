"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { notifications, pharmacies } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { scanNotifications, visibleNotifications } from "@/lib/notifications";
import { now } from "@/lib/time";
import { requiredId } from "@/lib/validation";

// The header bell shows the unread count, so refresh the whole layout.
const revalidate = () => revalidatePath("/", "layout");

// Notifications are read and marked by who the user is (admins: every branch,
// staff: their own), not by the branch on screen, so no branchChanged check.

export async function scanNow(): Promise<ActionState> {
  const { pharmacy } = await requirePharmacy({ allowInactive: true });
  const t = await getT();
  const db = await getDb();
  await db
    .update(pharmacies)
    .set({ notificationsScannedAt: now() })
    .where(eq(pharmacies.id, pharmacy.id));
  await scanNotifications(db, pharmacy);
  revalidate();
  return { ok: true, message: t("notifications.scanned") };
}

export async function markAllNotificationsRead(): Promise<ActionState> {
  const viewer = await requirePharmacy({ allowInactive: true });
  const t = await getT();
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: now() })
    .where(and(visibleNotifications(viewer), isNull(notifications.readAt)));
  revalidate();
  return { ok: true, message: t("notifications.allRead") };
}

export async function markNotificationRead(id: string): Promise<ActionState> {
  const viewer = await requirePharmacy({ allowInactive: true });
  const parsed = requiredId.safeParse(id);
  if (!parsed.success) return { ok: false };
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.id, parsed.data),
        visibleNotifications(viewer),
        isNull(notifications.readAt),
      ),
    );
  revalidate();
  return { ok: true };
}
