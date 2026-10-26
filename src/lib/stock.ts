import { and, asc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db";
import { batches, pharmacies, stockMovements } from "@/db/schema";
import { inScope, type BranchScope } from "./branches";

type MovementType = (typeof stockMovements.$inferInsert)["type"];

export class InsufficientStockError extends Error {
  constructor(
    public productId: string,
    public requested: number,
    public available: number,
  ) {
    super(`Insufficient stock for product ${productId}`);
    this.name = "InsufficientStockError";
  }
}

/** SQL condition: batch is not expired as of `today` (YYYY-MM-DD). */
export function notExpired(today: string) {
  return or(isNull(batches.expiryDate), gte(batches.expiryDate, today));
}

/**
 * Sellable stock per product: units in batches that have not expired, in one
 * branch or (branchId null) across all of them. Returns a Map of productId ->
 * quantity (products with no stock are absent).
 */
export async function getSellableStock(
  db: DbOrTx,
  scope: BranchScope,
  today: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      productId: batches.productId,
      qty: sql<number>`coalesce(sum(${batches.quantity}), 0)`.mapWith(Number),
    })
    .from(batches)
    .where(
      and(inScope(batches, scope), gt(batches.quantity, 0), notExpired(today)),
    )
    .groupBy(batches.productId);
  return new Map(rows.map((r) => [r.productId, r.qty]));
}

/**
 * Earliest expiry date (YYYY-MM-DD) among each product's sellable batches,
 * which is the batch FEFO sells from next. Products whose sellable batches
 * never expire are absent.
 */
export async function getNextExpiry(
  db: DbOrTx,
  scope: BranchScope,
  today: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      productId: batches.productId,
      // As text so every driver returns YYYY-MM-DD rather than a Date.
      expiry: sql<string>`min(${batches.expiryDate})::text`,
    })
    .from(batches)
    .where(
      and(inScope(batches, scope), gt(batches.quantity, 0), gte(batches.expiryDate, today)),
    )
    .groupBy(batches.productId);
  return new Map(rows.map((r) => [r.productId, r.expiry]));
}

/** Adds a new batch to a branch and records the matching stock movement. */
export async function addBatch(
  tx: Tx,
  input: {
    pharmacyId: string;
    branchId: string;
    productId: string;
    quantity: number;
    costPrice: number;
    batchNumber?: string | null;
    expiryDate?: string | null;
    purchaseId?: string | null;
    type: MovementType;
    reason?: string | null;
    /** Sale, purchase or transfer the movement belongs to; defaults to `purchaseId`. */
    referenceId?: string | null;
    userId?: string | null;
  },
) {
  const [batch] = await tx
    .insert(batches)
    .values({
      pharmacyId: input.pharmacyId,
      branchId: input.branchId,
      productId: input.productId,
      quantity: input.quantity,
      costPrice: input.costPrice,
      batchNumber: input.batchNumber || null,
      expiryDate: input.expiryDate || null,
      purchaseId: input.purchaseId ?? null,
    })
    .returning();
  await tx.insert(stockMovements).values({
    pharmacyId: input.pharmacyId,
    branchId: input.branchId,
    productId: input.productId,
    batchId: batch.id,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason ?? null,
    referenceId: input.referenceId ?? input.purchaseId ?? null,
    userId: input.userId ?? null,
  });
  return batch;
}

/** What deductStockFefo took from one batch. */
export type TakenFromBatch = {
  batchId: string;
  quantity: number;
  costPrice: number;
  batchNumber: string | null;
  expiryDate: string | null;
};

/**
 * Removes `quantity` units of a product from a branch, taking from the
 * batches that expire first (FEFO) and skipping expired ones. Throws InsufficientStockError if
 * there is not enough sellable stock. Returns what was taken from each batch.
 */
export async function deductStockFefo(
  tx: Tx,
  input: {
    pharmacyId: string;
    branchId: string;
    productId: string;
    quantity: number;
    today: string;
    type: MovementType;
    referenceId?: string | null;
    userId?: string | null;
  },
): Promise<TakenFromBatch[]> {
  const available = await tx
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.pharmacyId, input.pharmacyId),
        eq(batches.branchId, input.branchId),
        eq(batches.productId, input.productId),
        gt(batches.quantity, 0),
        notExpired(input.today),
      ),
    )
    // Earliest expiry first; batches without an expiry date go last.
    .orderBy(sql`${batches.expiryDate} asc nulls last`, asc(batches.createdAt))
    .for("update");

  const total = available.reduce((sum, b) => sum + b.quantity, 0);
  if (total < input.quantity) {
    throw new InsufficientStockError(input.productId, input.quantity, total);
  }

  const taken: TakenFromBatch[] = [];
  let remaining = input.quantity;
  for (const batch of available) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    remaining -= take;
    await tx
      .update(batches)
      .set({ quantity: batch.quantity - take })
      .where(eq(batches.id, batch.id));
    await tx.insert(stockMovements).values({
      pharmacyId: input.pharmacyId,
      branchId: input.branchId,
      productId: input.productId,
      batchId: batch.id,
      type: input.type,
      quantity: -take,
      referenceId: input.referenceId ?? null,
      userId: input.userId ?? null,
    });
    taken.push({
      batchId: batch.id,
      quantity: take,
      costPrice: batch.costPrice,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
    });
  }
  return taken;
}

/**
 * Changes the quantity of one batch by `delta` (positive or negative) and
 * records a stock movement. Throws if the batch would go below zero or does
 * not belong to the branch.
 */
export async function changeBatchQuantity(
  tx: Tx,
  input: {
    pharmacyId: string;
    branchId: string;
    batchId: string;
    delta: number;
    type: MovementType;
    reason?: string | null;
    referenceId?: string | null;
    userId?: string | null;
  },
) {
  const [batch] = await tx
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.id, input.batchId),
        eq(batches.pharmacyId, input.pharmacyId),
        eq(batches.branchId, input.branchId),
      ),
    )
    .for("update");
  if (!batch) throw new Error("Batch not found");
  const next = batch.quantity + input.delta;
  if (next < 0) {
    throw new InsufficientStockError(batch.productId, -input.delta, batch.quantity);
  }
  await tx.update(batches).set({ quantity: next }).where(eq(batches.id, batch.id));
  await tx.insert(stockMovements).values({
    pharmacyId: input.pharmacyId,
    branchId: input.branchId,
    productId: batch.productId,
    batchId: batch.id,
    type: input.type,
    quantity: input.delta,
    reason: input.reason ?? null,
    referenceId: input.referenceId ?? null,
    userId: input.userId ?? null,
  });
  return { ...batch, quantity: next };
}

/** Next invoice number for a pharmacy, e.g. INV-000123. Call inside a transaction. */
export async function nextInvoiceNumber(tx: Tx, pharmacyId: string): Promise<string> {
  const [row] = await tx
    .update(pharmacies)
    .set({ saleSeq: sql`${pharmacies.saleSeq} + 1` })
    .where(eq(pharmacies.id, pharmacyId))
    .returning({ seq: pharmacies.saleSeq });
  return `INV-${String(row.seq).padStart(6, "0")}`;
}

/** Next purchase reference for a pharmacy, e.g. PO-000012. Call inside a transaction. */
export async function nextPurchaseReference(tx: Tx, pharmacyId: string): Promise<string> {
  const [row] = await tx
    .update(pharmacies)
    .set({ purchaseSeq: sql`${pharmacies.purchaseSeq} + 1` })
    .where(eq(pharmacies.id, pharmacyId))
    .returning({ seq: pharmacies.purchaseSeq });
  return `PO-${String(row.seq).padStart(6, "0")}`;
}

/** Next stock transfer reference for a pharmacy, e.g. TR-000004. Call inside a transaction. */
export async function nextTransferReference(tx: Tx, pharmacyId: string): Promise<string> {
  const [row] = await tx
    .update(pharmacies)
    .set({ transferSeq: sql`${pharmacies.transferSeq} + 1` })
    .where(eq(pharmacies.id, pharmacyId))
    .returning({ seq: pharmacies.transferSeq });
  return `TR-${String(row.seq).padStart(6, "0")}`;
}
