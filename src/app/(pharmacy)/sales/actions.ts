"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { saleItems, sales, taxInvoices } from "@/db/schema";
import { createTranslator, getMessages, type MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { branchChanged } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { lockShiftForCash } from "@/lib/cash-drawer";
import { addBatch, changeBatchQuantity } from "@/lib/stock";
import { now } from "@/lib/time";
import { todayInTimezone } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/db-error";
import { buyerSchema, issueCreditNote, issueTaxInvoice, taxReceiptAllowed } from "@/lib/tax-invoice";
import { formToObject, requiredId } from "@/lib/validation";
import { z } from "zod";

/**
 * Refunds a whole sale: every unit goes back into the batch it was sold from
 * and the sale is marked as refunded. Partial refunds are not supported.
 * `activeBranchId` is the branch the receipt page was rendered for; only
 * sales of the current branch can be refunded, and their stock returns there.
 * The money of a cash sale comes out of `shiftId`, the open session of this
 * device's drawer; without one a cash sale cannot be refunded. A sale with a
 * full tax receipt also gets a credit note cancelling it.
 */
export async function refundSale(
  id: string,
  activeBranchId: string,
  shiftId: string | null,
): Promise<ActionState> {
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
    .select({ status: sales.status, paymentMethod: sales.paymentMethod })
    .from(sales)
    .where(thisSale)
    .limit(1);
  if (!existing) return { ok: false, message: t("common.notFound") };
  if (existing.status !== "completed") {
    return { ok: false, message: t("sales.alreadyRefunded") };
  }
  const validShift = shiftId !== null && requiredId.safeParse(shiftId).success ? shiftId : null;
  if (existing.paymentMethod === "cash" && !validShift) {
    return { ok: false, message: t("sales.refundNeedsDrawer") };
  }

  const refunded = await db.transaction(async (tx): Promise<false | "drawer" | { creditNumber: string | null }> => {
    // Lock the sale and check again, so two people pressing Refund at the
    // same moment cannot both put the stock back.
    const [sale] = await tx
      .select({
        id: sales.id,
        status: sales.status,
        branchId: sales.branchId,
        paymentMethod: sales.paymentMethod,
      })
      .from(sales)
      .where(thisSale)
      .for("update");
    if (!sale || sale.status !== "completed") return false;
    // The cash leaves this device's drawer, which must be open and not being counted.
    const shift = validShift ? await lockShiftForCash(tx, branch, validShift) : null;
    if (sale.paymentMethod === "cash" && !shift) return "drawer";

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
      .set({
        status: "refunded",
        refundedAt: now(),
        refundShiftId: sale.paymentMethod === "cash" ? (shift?.id ?? null) : null,
      })
      .where(thisSale);
    const creditNumber = await issueCreditNote(tx, {
      pharmacyId: pharmacy.id,
      branchId: sale.branchId,
      saleId: sale.id,
      day: todayInTimezone(pharmacy.timezone),
      userId: user.id,
      // The document is Thai and English, so is its reason.
      reason: `${th("taxReceipt.creditReasonRefund")} / ${en("taxReceipt.creditReasonRefund")}`,
    });
    return { creditNumber };
  });
  if (refunded === "drawer") return { ok: false, message: t("sales.refundNeedsDrawer") };
  if (!refunded) return { ok: false, message: t("sales.alreadyRefunded") };

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/pos");
  revalidatePath("/cash-drawer", "layout");
  return {
    ok: true,
    message: refunded.creditNumber
      ? t("sales.refundedWithCredit", { number: refunded.creditNumber })
      : t("sales.refunded"),
  };
}

const issueSchema = z.intersection(buyerSchema, z.object({ saleId: requiredId }));

// Credit notes carry their reason in both languages.
const th = createTranslator(getMessages("th"));
const en = createTranslator(getMessages("en"));

/**
 * Issues a full tax receipt for an existing completed sale of the current
 * branch (one per sale, up to TAX_RECEIPT_DAYS after it), with the next tax
 * receipt number. Only a VAT-registered pharmacy issues them.
 */
export async function issueTaxReceipt(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchChanged(formData, branch)) return { ok: false, message: t("branches.changedElsewhere") };
  if (!pharmacy.vatRegistered) return { ok: false, message: t("taxReceipt.notVatRegistered") };
  const parsed = issueSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const { saleId, ...buyer } = parsed.data;
  const db = await getDb();
  try {
    const refusal = await db.transaction(async (tx): Promise<MessageKey | null> => {
      const [sale] = await tx
        .select({ id: sales.id, status: sales.status, customerId: sales.customerId, createdAt: sales.createdAt })
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.pharmacyId, pharmacy.id), eq(sales.branchId, branch.id)))
        .for("update");
      if (!sale) return "common.notFound";
      if (sale.status !== "completed") return "taxReceipt.refundedSale";
      if (!taxReceiptAllowed(sale.createdAt)) return "taxReceipt.tooLate";
      const existing = await tx.$count(taxInvoices, eq(taxInvoices.saleId, sale.id));
      if (existing > 0) return "taxReceipt.alreadyIssued";
      await issueTaxInvoice(tx, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        saleId: sale.id,
        day: todayInTimezone(pharmacy.timezone),
        userId: user.id,
        // Details are only saved to the sale's own customer.
        buyer: { ...buyer, customerId: sale.customerId, saveToCustomer: buyer.saveToCustomer && sale.customerId !== null },
      });
      return null;
    });
    if (refusal) return { ok: false, message: t(refusal) };
  } catch (error) {
    // Someone issued one for this sale at the same moment.
    if (isUniqueViolation(error)) return { ok: false, message: t("taxReceipt.alreadyIssued") };
    throw error;
  }
  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/customers", "layout");
  return { ok: true, message: t("taxReceipt.issued") };
}
