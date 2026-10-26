"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { saleItems, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { addBatch, changeBatchQuantity } from "@/lib/stock";
import { now } from "@/lib/time";
import { requiredId } from "@/lib/validation";

/**
 * Refunds a whole sale: every unit goes back into the batch it was sold from
 * and the sale is marked as refunded. Partial refunds are not supported.
 * `activeBranchId` is the branch the receipt page was rendered for; only
 * sales of the current branch can be refunded, and their stock returns there.
 */
export async function refundSale(id: string, activeBranchId: string): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (activeBranchId !== branch.id) {
    return { ok: false, message: t("branches.changedElsewhere") };
  }
  if (!requiredId.safeParse(id).success) {
    return { ok: false, message: t("common.notFound") };
  }
  const db = await getDb();
  const thisSale = and(
    eq(sales.id, id),
    eq(sales.pharmacyId, pharmacy.id),
    eq(sales.branchId, branch.id),
  );

  const [existing] = await db
    .select({ status: sales.status })
    .from(sales)
    .where(thisSale)
    .limit(1);
  if (!existing) return { ok: false, message: t("common.notFound") };
  if (existing.status !== "completed") {
    return { ok: false, message: t("sales.alreadyRefunded") };
  }

  const refunded = await db.transaction(async (tx) => {
    // Lock the sale and check again, so two people pressing Refund at the
    // same moment cannot both put the stock back.
    const [sale] = await tx
      .select({ id: sales.id, status: sales.status, branchId: sales.branchId })
      .from(sales)
      .where(thisSale)
      .for("update");
    if (!sale || sale.status !== "completed") return false;

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    for (const item of items) {
      if (item.batchId) {
        await changeBatchQuantity(tx, {
          pharmacyId: pharmacy.id,
          branchId: sale.branchId,
          batchId: item.batchId,
          delta: item.quantity,
          type: "refund",
          referenceId: sale.id,
          userId: user.id,
        });
      } else {
        // The batch has been deleted since the sale: bring the units back as
        // a new batch, in the sale's branch, at the cost they were sold from.
        await addBatch(tx, {
          pharmacyId: pharmacy.id,
          branchId: sale.branchId,
          productId: item.productId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          type: "refund",
          referenceId: sale.id,
          userId: user.id,
        });
      }
    }

    await tx
      .update(sales)
      .set({ status: "refunded", refundedAt: now() })
      .where(thisSale);
    return true;
  });
  if (!refunded) return { ok: false, message: t("sales.alreadyRefunded") };

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/pos");
  return { ok: true, message: t("sales.refunded") };
}
