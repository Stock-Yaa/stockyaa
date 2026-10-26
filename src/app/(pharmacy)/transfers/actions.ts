"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import {
  batches,
  branches,
  products,
  stockTransferItems,
  stockTransfers,
  type Branch,
  type StockTransfer,
} from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged, canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy, type SessionUser } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import {
  InsufficientStockError,
  addBatch,
  changeBatchQuantity,
  deductStockFefo,
  nextTransferReference,
} from "@/lib/stock";
import { formToObject, optionalText, positiveInt, requiredId } from "@/lib/validation";

const MAX_ITEMS = 200;
const MAX_QUANTITY = 1_000_000;

/** The line items arrive as a JSON string in a hidden field. */
function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const transferSchema = z.object({
  toBranchId: requiredId,
  notes: optionalText(),
  items: z.preprocess(
    parseJson,
    z
      .array(
        z.object({
          productId: requiredId,
          quantity: positiveInt.refine((v) => v <= MAX_QUANTITY, "common.invalidNumber"),
        }),
        { error: "transfers.itemsRequired" },
      )
      .min(1, "transfers.itemsRequired")
      .max(MAX_ITEMS, "common.tooLong"),
  ),
});

/** Who may act on a transfer: admins anywhere, staff only in their own branch. */
function worksIn(user: SessionUser, branch: Branch, branchId: string): boolean {
  return canSwitchBranch(user) || branch.id === branchId;
}

/**
 * Sends stock from the current branch to another one. The units leave this
 * branch now (earliest expiry first) and wait "in transit" until the other
 * branch receives them; each batch taken becomes one line of the transfer.
 */
export async function createTransfer(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) {
    return { ok: false, message: t("branches.changedElsewhere") };
  }

  const parsed = transferSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }
  const { toBranchId, notes, items } = parsed.data;
  if (toBranchId === branch.id) {
    return { ok: false, fieldErrors: { toBranchId: t("transfers.sameBranch") } };
  }

  // The same product on two lines is sent as one.
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const db = await getDb();
  const [destination] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.id, toBranchId),
        eq(branches.pharmacyId, pharmacy.id),
        eq(branches.isActive, true),
      ),
    )
    .limit(1);
  if (!destination) return { ok: false, fieldErrors: { toBranchId: t("common.invalidChoice") } };

  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.pharmacyId, pharmacy.id), inArray(products.id, [...quantities.keys()])));
  if (productRows.length !== quantities.size) {
    return { ok: false, fieldErrors: { items: t("common.invalidChoice") } };
  }
  const productName = new Map(productRows.map((p) => [p.id, p.name]));

  const today = todayInTimezone(pharmacy.timezone);
  let transferId: string;
  try {
    transferId = await db.transaction(async (tx) => {
      const reference = await nextTransferReference(tx, pharmacy.id);
      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          pharmacyId: pharmacy.id,
          reference,
          fromBranchId: branch.id,
          toBranchId,
          notes,
          sentBy: user.id,
        })
        .returning({ id: stockTransfers.id });

      for (const [productId, quantity] of quantities) {
        const taken = await deductStockFefo(tx, {
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          productId,
          quantity,
          today,
          type: "transfer_out",
          referenceId: transfer.id,
          userId: user.id,
        });
        await tx.insert(stockTransferItems).values(
          taken.map((part) => ({
            transferId: transfer.id,
            productId,
            sourceBatchId: part.batchId,
            batchNumber: part.batchNumber,
            expiryDate: part.expiryDate,
            quantity: part.quantity,
            costPrice: part.costPrice,
          })),
        );
      }
      return transfer.id;
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      // Stock on screen was stale; the transaction rolled back, nothing was sent.
      return {
        ok: false,
        message: t("transfers.insufficientStock", {
          name: productName.get(error.productId) ?? "",
          available: error.available,
        }),
      };
    }
    throw error;
  }

  revalidatePath("/transfers");
  revalidatePath("/inventory");
  redirect(`/transfers/${transferId}`);
}

/** The transfer with this id, locked for the rest of the transaction, if it is in transit. */
async function lockInTransit(
  tx: Tx,
  pharmacyId: string,
  id: string,
): Promise<StockTransfer | "missing" | "closed"> {
  const [transfer] = await tx
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.pharmacyId, pharmacyId)))
    .for("update");
  if (!transfer) return "missing";
  return transfer.status === "in_transit" ? transfer : "closed";
}

/** Adds a transfer's batches to the receiving branch. */
export async function receiveTransfer(id: string): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(id).success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    const transfer = await lockInTransit(tx, pharmacy.id, id);
    if (transfer === "missing") return "common.notFound";
    if (transfer === "closed") return "transfers.notInTransit";
    if (!worksIn(user, branch, transfer.toBranchId)) return "transfers.notAllowedReceive";

    const items = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transfer.id));
    for (const item of items) {
      await addBatch(tx, {
        pharmacyId: pharmacy.id,
        branchId: transfer.toBranchId,
        productId: item.productId,
        quantity: item.quantity,
        costPrice: item.costPrice,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        type: "transfer_in",
        referenceId: transfer.id,
        userId: user.id,
      });
    }
    await tx
      .update(stockTransfers)
      .set({ status: "received", closedBy: user.id, closedAt: new Date() })
      .where(eq(stockTransfers.id, transfer.id));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };

  revalidatePath("/transfers");
  revalidatePath("/inventory");
  return { ok: true, message: t("transfers.received") };
}

/** Cancels a transfer in transit: its units go back into the sending branch's batches. */
export async function cancelTransfer(id: string): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (!requiredId.safeParse(id).success) return { ok: false, message: t("common.notFound") };

  const db = await getDb();
  const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
    const transfer = await lockInTransit(tx, pharmacy.id, id);
    if (transfer === "missing") return "common.notFound";
    if (transfer === "closed") return "transfers.notInTransit";
    if (!worksIn(user, branch, transfer.fromBranchId)) return "transfers.notAllowedCancel";

    const items = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transfer.id));
    const sourceIds = items.flatMap((item) => (item.sourceBatchId ? [item.sourceBatchId] : []));
    const stillThere = new Set(
      sourceIds.length === 0
        ? []
        : (
            await tx
              .select({ id: batches.id })
              .from(batches)
              .where(
                and(inArray(batches.id, sourceIds), eq(batches.branchId, transfer.fromBranchId)),
              )
          ).map((b) => b.id),
    );
    for (const item of items) {
      const common = {
        pharmacyId: pharmacy.id,
        branchId: transfer.fromBranchId,
        type: "transfer_in" as const,
        referenceId: transfer.id,
        userId: user.id,
      };
      if (item.sourceBatchId && stillThere.has(item.sourceBatchId)) {
        await changeBatchQuantity(tx, {
          ...common,
          batchId: item.sourceBatchId,
          delta: item.quantity,
        });
      } else {
        // The original batch is gone; put the units back as a batch of their own.
        await addBatch(tx, {
          ...common,
          productId: item.productId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
        });
      }
    }
    await tx
      .update(stockTransfers)
      .set({ status: "cancelled", closedBy: user.id, closedAt: new Date() })
      .where(eq(stockTransfers.id, transfer.id));
    return null;
  });
  if (refusal) return { ok: false, message: t(refusal) };

  revalidatePath("/transfers");
  revalidatePath("/inventory");
  return { ok: true, message: t("transfers.cancelled") };
}
