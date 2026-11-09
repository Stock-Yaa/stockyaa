"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  PAYMENT_METHODS,
  customers,
  notifications,
  products,
  refillReminders,
  saleItems,
  sales,
  type PriceLevel,
} from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { lockShiftForCash } from "@/lib/cash-drawer";
import { todayInTimezone } from "@/lib/dates";
import { priceFor } from "@/lib/pricing";
import { buyerSchema, issueTaxInvoice, type BuyerInput } from "@/lib/tax-invoice";
import { InsufficientStockError, deductStockFefo, nextInvoiceNumber } from "@/lib/stock";
import { round2 } from "@/lib/utils";
import { vatRateOf } from "@/lib/vat";
import { nonNegativeNumber, optionalId, positiveInt, requiredId, requiredText } from "@/lib/validation";
import type { PosCustomer } from "./customer-picker";
import { computeSaleTotals, type SalePayload } from "./totals";

// Largest value the money columns (numeric(12, 2)) can hold.
const MAX_MONEY = 9_999_999_999.99;
const money = nonNegativeNumber.refine((value) => value <= MAX_MONEY);

const saleSchema = z.object({
  branchId: requiredId,
  items: z
    .array(z.object({ productId: requiredId, quantity: positiveInt }))
    .min(1)
    .max(500),
  customerId: optionalId,
  discount: money,
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaid: money,
  shiftId: optionalId,
});

/** The drawer session given for a cash sale is not open (or is being counted). */
class DrawerNotOpenError extends Error {}

export type CreateSaleResult =
  | {
      ok: true;
      saleId: string;
      invoiceNumber: string;
      total: number;
      changeDue: number;
      /** Set when a full tax receipt was issued with the sale. */
      taxInvoiceNumber: string | null;
    }
  | { ok: false; message: string };

/**
 * Records a sale from the POS. Only product ids and quantities are taken from
 * the client; prices, tax and totals are computed here from the database.
 */
export async function createSale(payload: SalePayload): Promise<CreateSaleResult> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();

  const parsed = saleSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: t("pos.invalidSale") };
  const input = parsed.data;
  // The terminal was opened in another branch (switched in another tab): its
  // stock on screen is not this branch's, so nothing is sold.
  if (input.branchId !== branch.id) {
    return { ok: false, message: t("branches.changedElsewhere") };
  }

  // One line per product, even if the same product was sent twice.
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const db = await getDb();
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      salePrice: products.salePrice,
      memberPrice: products.memberPrice,
      staffPrice: products.staffPrice,
    })
    .from(products)
    .where(
      and(
        eq(products.pharmacyId, pharmacy.id),
        eq(products.isActive, true),
        inArray(products.id, [...quantities.keys()]),
      ),
    );
  if (productRows.length !== quantities.size) {
    return { ok: false, message: t("pos.productUnavailable") };
  }
  const productById = new Map(productRows.map((p) => [p.id, p]));

  // The customer's price level decides what every item costs; walk-ins pay the regular price.
  let priceLevel: PriceLevel = "regular";
  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id, priceLevel: customers.priceLevel })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.pharmacyId, pharmacy.id)))
      .limit(1);
    if (!customer) return { ok: false, message: t("pos.customerNotFound") };
    priceLevel = customer.priceLevel;
  }

  // Cart order, so receipts list items the way they were rung up.
  const lines = [...quantities].flatMap(([productId, quantity]) => {
    const product = productById.get(productId);
    return product ? [{ product, quantity, unitPrice: priceFor(product, priceLevel, pharmacy) }] : [];
  });

  const totals = computeSaleTotals(lines, input.discount, vatRateOf(pharmacy));
  if (totals.total > MAX_MONEY) return { ok: false, message: t("pos.invalidSale") };

  // Card and transfer are always paid exactly; only cash has change.
  const amountPaid =
    input.paymentMethod === "cash" ? round2(input.amountPaid) : totals.total;
  if (amountPaid < totals.total) {
    return { ok: false, message: t("pos.insufficientPayment") };
  }
  const changeDue = round2(amountPaid - totals.total);
  const today = todayInTimezone(pharmacy.timezone);

  // A full tax receipt is issued with the sale when the customer asked for one.
  let taxBuyer: BuyerInput | null = null;
  if (payload.taxBuyer) {
    // Only a VAT-registered pharmacy may issue tax receipts.
    if (!pharmacy.vatRegistered) return { ok: false, message: t("taxReceipt.notVatRegistered") };
    const buyer = buyerSchema.safeParse({ ...payload.taxBuyer, customerId: input.customerId });
    if (!buyer.success) return { ok: false, message: t("pos.taxBuyerInvalid") };
    taxBuyer = buyer.data;
  }

  if (input.paymentMethod === "cash" && !input.shiftId) {
    return { ok: false, message: t("pos.drawerClosed") };
  }

  try {
    const sale = await db.transaction(async (tx) => {
      // The till's drawer session, locked so it cannot close while the sale
      // is written. Cash needs one; card and transfer are linked when there is one.
      const shift = input.shiftId ? await lockShiftForCash(tx, branch, input.shiftId) : null;
      if (input.paymentMethod === "cash" && !shift) throw new DrawerNotOpenError();
      const invoiceNumber = await nextInvoiceNumber(tx, pharmacy.id, today, branch.id);
      const [created] = await tx
        .insert(sales)
        .values({
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          invoiceNumber,
          customerId: input.customerId,
          userId: user.id,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          paymentMethod: input.paymentMethod,
          priceLevel,
          amountPaid,
          changeDue,
          shiftId: shift?.id ?? null,
        })
        .returning({ id: sales.id });

      // A manual discount on top of a member or staff price is allowed, and
      // flagged to the managers.
      if (priceLevel !== "regular" && totals.discount > 0) {
        await tx.insert(notifications).values({
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          type: "price_discount",
          key: `price_discount:${created.id}`,
          data: {
            saleId: created.id,
            invoice: invoiceNumber,
            level: priceLevel,
            discount: totals.discount,
            staff: user.name,
          },
        });
      }

      for (const line of lines) {
        const taken = await deductStockFefo(tx, {
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          productId: line.product.id,
          quantity: line.quantity,
          today,
          type: "sale",
          referenceId: created.id,
          userId: user.id,
        });
        // One row per batch, so profit uses the real cost of each unit sold
        // and a refund can put every unit back where it came from.
        await tx.insert(saleItems).values(
          taken.map((part) => ({
            saleId: created.id,
            productId: line.product.id,
            batchId: part.batchId,
            productName: line.product.name,
            quantity: part.quantity,
            unitPrice: line.unitPrice,
            costPrice: part.costPrice,
            total: round2(part.quantity * line.unitPrice),
          })),
        );
      }

      // The customer has just bought their regular medicine: the next refill
      // is due one interval from today.
      if (input.customerId) {
        await tx
          .update(refillReminders)
          .set({
            lastRefillDate: today,
            nextDueDate: sql`${today}::date + ${refillReminders.intervalDays}`,
          })
          .where(
            and(
              eq(refillReminders.pharmacyId, pharmacy.id),
              eq(refillReminders.customerId, input.customerId),
              inArray(refillReminders.productId, [...quantities.keys()]),
            ),
          );
      }
      const tax = taxBuyer
        ? await issueTaxInvoice(tx, {
            pharmacyId: pharmacy.id,
            branchId: branch.id,
            saleId: created.id,
            day: today,
            userId: user.id,
            buyer: taxBuyer,
          })
        : null;
      return { id: created.id, invoiceNumber, taxInvoiceNumber: tax?.number ?? null };
    });

    revalidatePath("/pos");
    revalidatePath("/sales");
    if (taxBuyer?.saveToCustomer) revalidatePath("/customers", "layout");
    revalidatePath("/customers/reminders");
    return {
      ok: true,
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      total: totals.total,
      changeDue,
      taxInvoiceNumber: sale.taxInvoiceNumber,
    };
  } catch (error) {
    if (error instanceof DrawerNotOpenError) {
      // Closed or being counted on another screen; nothing was sold.
      revalidatePath("/pos");
      return { ok: false, message: t("pos.drawerClosed") };
    }
    if (error instanceof InsufficientStockError) {
      // Stock on screen was stale; the transaction rolled back, nothing was sold.
      revalidatePath("/pos");
      return {
        ok: false,
        message: t("pos.insufficientStock", {
          name: productById.get(error.productId)?.name ?? "",
          available: error.available,
        }),
      };
    }
    throw error;
  }
}

const quickCustomerSchema = z.object({ name: requiredText() });

export type CreateCustomerResult =
  | { ok: true; customer: PosCustomer }
  | { ok: false; message: string };

/** Adds a customer by name from the POS, so it can be attached to the sale at once. */
export async function createPosCustomer(name: string): Promise<CreateCustomerResult> {
  const { pharmacy } = await requirePharmacy();
  const t = await getT();

  const parsed = quickCustomerSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, message: t(parsed.error.issues[0].message as MessageKey) };
  }
  const db = await getDb();
  const [customer] = await db
    .insert(customers)
    .values({ pharmacyId: pharmacy.id, name: parsed.data.name })
    .returning({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      priceLevel: customers.priceLevel,
      taxIdType: customers.taxIdType,
      taxId: customers.taxId,
      taxBranch: customers.taxBranch,
      address: customers.address,
    });

  revalidatePath("/customers");
  return { ok: true, customer };
}
