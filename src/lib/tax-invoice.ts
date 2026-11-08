import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { customers, taxInvoices } from "@/db/schema";
import { nextDocumentNumber } from "./numbering";
import { checkbox, optionalId, requiredText } from "./validation";

/*
 * Full tax receipts (Thai ใบกำกับภาษีเต็มรูป): the buyer's details and issuing
 * one for a sale, from the POS or later from the sale's page.
 */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** A 13-digit Thai tax ID (or ID card number); spaces and dashes are ignored. */
export const taxIdField = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.string({ error: "common.required" }).regex(/^\d{13}$/, "taxReceipt.taxIdInvalid"),
);

export const optionalTaxId = z.preprocess(blankToNull, taxIdField.nullable());

/**
 * The buyer's branch: none for a private person, "00000" for a company's
 * head office, or its 5-digit branch number.
 */
export const buyerBranchField = z.preprocess(
  blankToNull,
  z.string().regex(/^\d{5}$/, "taxReceipt.branchInvalid").nullable(),
);

export const buyerSchema = z.object({
  buyerName: requiredText(200),
  buyerTaxId: taxIdField,
  buyerAddress: requiredText(500),
  buyerBranch: buyerBranchField,
  // Also keep these details on the sale's customer, to fill them in next time.
  saveToCustomer: checkbox,
  customerId: optionalId,
});

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
  const number = await nextDocumentNumber(tx, input.pharmacyId, "tax", input.day);
  const [created] = await tx
    .insert(taxInvoices)
    .values({
      pharmacyId: input.pharmacyId,
      branchId: input.branchId,
      saleId: input.saleId,
      number,
      buyerName: input.buyer.buyerName,
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
        taxId: input.buyer.buyerTaxId,
        taxBranch: input.buyer.buyerBranch,
        address: input.buyer.buyerAddress,
      })
      .where(and(eq(customers.id, customerId), eq(customers.pharmacyId, input.pharmacyId)));
  }
  return { id: created.id, number };
}

/** Customer fields for their tax details, shared by the customer form. */
export const customerTaxFields = {
  taxId: optionalTaxId,
  taxBranch: buyerBranchField,
};

