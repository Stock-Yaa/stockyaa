import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { creditNotes, customers, taxInvoices } from "@/db/schema";
import { BUYER_ID_KINDS, isBuyerId, normaliseBuyerId, type BuyerIdKind } from "./buyer-id";
import { nextDocumentNumber } from "./numbering";
import { daysFromNow } from "./time";
import { checkbox, optionalId, requiredText } from "./validation";

/*
 * Full tax receipts (Thai ใบกำกับภาษีเต็มรูป): the buyer's details, issuing
 * one for a sale (from the POS or later from the sale's page), and the
 * credit note (ใบลดหนี้) that cancels one when its sale is refunded.
 */

/** A tax receipt can be issued for a bill up to this many days after the purchase. */
export const TAX_RECEIPT_DAYS = 7;

/** Whether a sale made at `soldAt` is still recent enough for a tax receipt. */
export function taxReceiptAllowed(soldAt: Date): boolean {
  return soldAt >= daysFromNow(-TAX_RECEIPT_DAYS);
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const idType = z.enum(BUYER_ID_KINDS, { error: "common.invalidChoice" }).default("tax_id");

/**
 * The buyer's branch: none for a private person, "00000" for a company's
 * head office, or its 5-digit branch number.
 */
export const buyerBranchField = z.preprocess(
  blankToNull,
  z.string().regex(/^\d{5}$/, "taxReceipt.branchInvalid").nullable(),
);

/** Adds an issue at `path` when `value` is not a valid ID of `type`. */
function checkBuyerId(type: BuyerIdKind, value: string | null, path: string, ctx: z.RefinementCtx) {
  if (value !== null && !isBuyerId(value, type)) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: type === "passport" ? "taxReceipt.passportInvalid" : "taxReceipt.taxIdInvalid",
    });
  }
}

export const buyerSchema = z
  .object({
    buyerName: requiredText(200),
    buyerIdType: idType,
    buyerTaxId: requiredText(30),
    buyerAddress: requiredText(500),
    buyerBranch: buyerBranchField,
    // Also keep these details on the sale's customer, to fill them in next time.
    saveToCustomer: checkbox,
    customerId: optionalId,
  })
  .superRefine((v, ctx) => checkBuyerId(v.buyerIdType, v.buyerTaxId, "buyerTaxId", ctx))
  .transform((v) => ({
    ...v,
    buyerTaxId: normaliseBuyerId(v.buyerTaxId, v.buyerIdType),
    // A foreign buyer has no Thai branch.
    buyerBranch: v.buyerIdType === "passport" ? null : v.buyerBranch,
  }));

export type BuyerInput = z.infer<typeof buyerSchema>;

export const HEAD_OFFICE = "00000";

/** Issues the sale's tax receipt with the next tax receipt number. */
export async function issueTaxInvoice(
  tx: Tx,
  input: {
    pharmacyId: string;
    branchId: string;
    saleId: string;
    day: string;
    userId: string;
    buyer: BuyerInput;
  },
): Promise<{ id: string; number: string }> {
  const number = await nextDocumentNumber(tx, input.pharmacyId, "tax", input.day, input.branchId);
  const [created] = await tx
    .insert(taxInvoices)
    .values({
      pharmacyId: input.pharmacyId,
      branchId: input.branchId,
      saleId: input.saleId,
      number,
      buyerName: input.buyer.buyerName,
      buyerIdType: input.buyer.buyerIdType,
      buyerTaxId: input.buyer.buyerTaxId,
      buyerAddress: input.buyer.buyerAddress,
      buyerBranch: input.buyer.buyerBranch,
      issuedBy: input.userId,
    })
    .returning({ id: taxInvoices.id });
  const { customerId, saveToCustomer } = input.buyer;
  if (saveToCustomer && customerId) {
    await tx
      .update(customers)
      .set({
        taxIdType: input.buyer.buyerIdType,
        taxId: input.buyer.buyerTaxId,
        taxBranch: input.buyer.buyerBranch,
        address: input.buyer.buyerAddress,
      })
      .where(and(eq(customers.id, customerId), eq(customers.pharmacyId, input.pharmacyId)));
  }
  return { id: created.id, number };
}

/**
 * Issues a credit note for the tax receipt of a sale being refunded, if it
 * has one; returns its number, or null when the sale had no tax receipt.
 */
export async function issueCreditNote(
  tx: Tx,
  input: { pharmacyId: string; branchId: string; saleId: string; day: string; userId: string; reason: string },
): Promise<string | null> {
  const [invoice] = await tx
    .select({ id: taxInvoices.id })
    .from(taxInvoices)
    .where(and(eq(taxInvoices.saleId, input.saleId), eq(taxInvoices.pharmacyId, input.pharmacyId)));
  if (!invoice) return null;
  const number = await nextDocumentNumber(tx, input.pharmacyId, "credit", input.day, input.branchId);
  await tx.insert(creditNotes).values({
    pharmacyId: input.pharmacyId,
    branchId: input.branchId,
    taxInvoiceId: invoice.id,
    saleId: input.saleId,
    number,
    reason: input.reason,
    issuedBy: input.userId,
  });
  return number;
}

/** Customer fields for their tax details, shared by the customer form. */
export const customerTaxFields = {
  taxIdType: idType,
  taxId: z.preprocess(blankToNull, z.string().max(30, "common.tooLong").nullable()),
  taxBranch: buyerBranchField,
};

/** Checks a customer's tax ID against its type; use as the customer schema's superRefine. */
export function refineCustomerTaxId(v: { taxIdType: BuyerIdKind; taxId: string | null }, ctx: z.RefinementCtx) {
  checkBuyerId(v.taxIdType, v.taxId, "taxId", ctx);
}
