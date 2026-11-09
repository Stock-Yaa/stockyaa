"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { INVOICE_DATE_FORMATS, pharmacies } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom, type ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { currencyLocked } from "@/lib/currency-lock";
import { todayInTimezone } from "@/lib/dates";
import {
  INVOICE_PREFIX_PATTERN,
  MAX_INVOICE_DIGITS,
  MAX_INVOICE_PREFIX,
  MIN_INVOICE_DIGITS,
} from "@/lib/invoice-number";
import { NUMBER_SERIES, previewNumber, resyncCounters, type NumberSeries } from "@/lib/numbering";
import { round2 } from "@/lib/utils";
import {
  checkbox,
  formToObject,
  nonNegativeInt,
  nonNegativeNumber,
  optionalEmail,
  optionalText,
  positiveInt,
  requiredText,
} from "@/lib/validation";
import { CURRENCIES, TIMEZONES } from "@/lib/options";

// Blank = no rule; otherwise a percentage off the regular price.
const optionalPercent = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  nonNegativeNumber.pipe(z.number().max(100, "settings.percentRange")).nullable(),
);

const profileSchema = z
  .object({
  name: requiredText(),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(),
  licenseNumber: optionalText(100),
  taxId: optionalText(50),
  currency: z.enum(CURRENCIES, { error: "settings.invalidOption" }),
  timezone: z.enum(TIMEZONES, { error: "settings.invalidOption" }),
  vatRegistered: checkbox,
  taxRate: nonNegativeNumber.pipe(z.number().max(100, "settings.taxRateRange")),
  memberDiscount: optionalPercent,
  staffDiscount: optionalPercent,
  expiryAlertDays: positiveInt.pipe(z.number().max(365, "settings.expiryAlertDaysRange")),
  receiptFooter: optionalText(500),
  })
  // VAT receipts and tax receipts print the seller's tax ID and a rate.
  .superRefine((v, ctx) => {
    if (!v.vatRegistered) return;
    if (!v.taxId) ctx.addIssue({ code: "custom", path: ["taxId"], message: "settings.taxIdRequiredForVat" });
    if (v.taxRate <= 0) ctx.addIssue({ code: "custom", path: ["taxRate"], message: "settings.vatRateRequired" });
  });

const maxMoney = (v: number) => v <= 9_999_999_999.99;
const cashRulesSchema = z
  .object({
    cashMinorTolerance: nonNegativeNumber.refine(maxMoney, "common.invalidNumber"),
    cashMajorTolerance: nonNegativeNumber.refine(maxMoney, "common.invalidNumber"),
    payoutApprovalLimit: nonNegativeNumber.refine(maxMoney, "common.invalidNumber"),
    cashRecounts: nonNegativeInt.pipe(z.number().max(5, "settings.recountsRange")),
  })
  .refine((v) => v.cashMajorTolerance >= v.cashMinorTolerance, {
    path: ["cashMajorTolerance"],
    error: "settings.majorBelowMinor",
  });

/** Updates the pharmacy's cash drawer rules. Pharmacy admins only. */
export async function updateCashRules(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (user.role !== "admin") return { ok: false, message: t("settings.adminOnly") };
  const parsed = cashRulesSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const db = await getDb();
  await db
    .update(pharmacies)
    .set({
      cashMinorTolerance: round2(parsed.data.cashMinorTolerance),
      cashMajorTolerance: round2(parsed.data.cashMajorTolerance),
      payoutApprovalLimit: round2(parsed.data.payoutApprovalLimit),
      cashRecounts: parsed.data.cashRecounts,
    })
    .where(eq(pharmacies.id, pharmacy.id));
  revalidatePath("/settings");
  revalidatePath("/cash-drawer", "layout");
  revalidatePath("/pos");
  return { ok: true, message: t("settings.cashRulesSaved") };
}

const prefixField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : ""),
  z
    .string()
    .max(MAX_INVOICE_PREFIX, "common.tooLong")
    .regex(INVOICE_PREFIX_PATTERN, "settings.invoicePrefixInvalid"),
);

const PREFIX_FIELDS = [
  "invoicePrefix",
  "taxInvoicePrefix",
  "creditNotePrefix",
  "purchasePrefix",
  "transferPrefix",
] as const;

const invoiceFormatSchema = z
  .object({
    invoicePrefix: prefixField,
    taxInvoicePrefix: prefixField,
    creditNotePrefix: prefixField,
    purchasePrefix: prefixField,
    transferPrefix: prefixField,
    invoiceDateFormat: z.enum(INVOICE_DATE_FORMATS, { error: "settings.invalidOption" }),
    invoiceBuddhistYear: checkbox,
    invoiceDigits: positiveInt.pipe(
      z
        .number()
        .min(MIN_INVOICE_DIGITS, "settings.invoiceDigitsRange")
        .max(MAX_INVOICE_DIGITS, "settings.invoiceDigitsRange"),
    ),
    numberPerBranch: checkbox,
  })
  // Each series needs its own prefix, or two kinds of document would share numbers.
  .superRefine((v, ctx) => {
    PREFIX_FIELDS.forEach((field, index) => {
      if (PREFIX_FIELDS.slice(0, index).some((earlier) => v[earlier] === v[field])) {
        ctx.addIssue({ code: "custom", path: [field], message: "settings.prefixSame" });
      }
    });
  });

/**
 * The numbers the next document of each series in the current branch would
 * get with `draft` as the format, for the live preview: they skip numbers
 * already issued.
 */
export async function previewDocumentNumbers(draft: unknown): Promise<Record<NumberSeries, string> | null> {
  const { user, pharmacy, branch } = await requirePharmacy();
  if (user.role !== "admin") return null;
  const parsed = invoiceFormatSchema.safeParse(draft);
  if (!parsed.success) return null;
  const today = todayInTimezone(pharmacy.timezone);
  const db = await getDb();
  const numbers = await Promise.all(
    NUMBER_SERIES.map((series) => previewNumber(db, pharmacy, parsed.data, series, branch, today)),
  );
  return Object.fromEntries(NUMBER_SERIES.map((series, i) => [series, numbers[i]])) as Record<NumberSeries, string>;
}

/**
 * Sets how new document numbers look. Numbers already issued stay as they
 * are; each counter carries on, or restarts at 1 when the date part is new.
 * Numbers per branch need a code on every active branch.
 */
export async function updateInvoiceFormat(formData: FormData): Promise<ActionState> {
  const { user, pharmacy, branches: active } = await requirePharmacy();
  const t = await getT();
  if (user.role !== "admin") return { ok: false, message: t("settings.adminOnly") };
  const parsed = invoiceFormatSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  if (parsed.data.numberPerBranch) {
    const withoutCode = active.filter((b) => !b.code);
    if (withoutCode.length > 0) {
      return {
        ok: false,
        fieldErrors: {
          numberPerBranch: t("settings.branchCodesMissing", { names: withoutCode.map((b) => b.name).join(", ") }),
        },
      };
    }
  }
  const today = todayInTimezone(pharmacy.timezone);
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Lock first, so no document takes a number while the counters move.
    await tx.select({ id: pharmacies.id }).from(pharmacies).where(eq(pharmacies.id, pharmacy.id)).for("update");
    await tx.update(pharmacies).set(parsed.data).where(eq(pharmacies.id, pharmacy.id));
    // Continue after the highest number each format already issued in today's
    // date part, so switching back to an earlier format never repeats one.
    await resyncCounters(tx, pharmacy, parsed.data, active, today);
  });
  revalidatePath("/settings");
  return { ok: true, message: t("settings.invoiceFormatSaved") };
}

/** Updates the caller's own pharmacy. Pharmacy admins only. */
export async function updatePharmacyProfile(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (user.role !== "admin") return { ok: false, message: t("settings.adminOnly") };

  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)),
    };
  }

  const db = await getDb();
  if (parsed.data.currency !== pharmacy.currency && (await currencyLocked(db, pharmacy.id))) {
    return { ok: false, fieldErrors: { currency: t("settings.currencyLocked") } };
  }
  await db
    .update(pharmacies)
    .set({
      ...parsed.data,
      taxRate: round2(parsed.data.taxRate),
      memberDiscount: parsed.data.memberDiscount === null ? null : round2(parsed.data.memberDiscount),
      staffDiscount: parsed.data.staffDiscount === null ? null : round2(parsed.data.staffDiscount),
    })
    .where(eq(pharmacies.id, pharmacy.id));

  // The shell shows the pharmacy name and every page formats with its currency.
  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.profileSaved") };
}
