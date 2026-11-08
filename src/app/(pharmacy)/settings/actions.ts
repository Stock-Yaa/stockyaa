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
import { todayInTimezone } from "@/lib/dates";
import {
  INVOICE_PREFIX_PATTERN,
  MAX_INVOICE_DIGITS,
  MAX_INVOICE_PREFIX,
  MIN_INVOICE_DIGITS,
  formatInvoiceNumber,
  invoicePeriod,
} from "@/lib/invoice-number";
import {
  highestCounter,
  resyncCounter,
  seriesCounter,
  seriesFormat,
  type NumberSeries,
} from "@/lib/numbering";
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

const profileSchema = z.object({
  name: requiredText(),
  phone: optionalText(50),
  email: optionalEmail,
  address: optionalText(),
  licenseNumber: optionalText(100),
  taxId: optionalText(50),
  currency: z.enum(CURRENCIES, { error: "settings.invalidOption" }),
  timezone: z.enum(TIMEZONES, { error: "settings.invalidOption" }),
  taxRate: nonNegativeNumber.pipe(z.number().max(100, "settings.taxRateRange")),
  expiryAlertDays: positiveInt.pipe(z.number().max(365, "settings.expiryAlertDaysRange")),
  receiptFooter: optionalText(500),
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

const invoiceFormatSchema = z
  .object({
    invoicePrefix: prefixField,
    taxInvoicePrefix: prefixField,
    invoiceDateFormat: z.enum(INVOICE_DATE_FORMATS, { error: "settings.invalidOption" }),
    invoiceBuddhistYear: checkbox,
    invoiceDigits: positiveInt.pipe(
      z
        .number()
        .min(MIN_INVOICE_DIGITS, "settings.invoiceDigitsRange")
        .max(MAX_INVOICE_DIGITS, "settings.invoiceDigitsRange"),
    ),
  })
  // The same prefix would make both series issue the same numbers.
  .refine((v) => v.taxInvoicePrefix !== v.invoicePrefix, {
    path: ["taxInvoicePrefix"],
    error: "settings.taxPrefixSame",
  });

const SERIES: NumberSeries[] = ["sale", "tax"];

/**
 * The numbers the next sale and the next tax receipt would get with `draft`
 * as the format, for the live preview: they skip numbers already issued.
 */
export async function previewDocumentNumbers(
  draft: unknown,
): Promise<{ sale: string; tax: string } | null> {
  const { user, pharmacy } = await requirePharmacy();
  if (user.role !== "admin") return null;
  const parsed = invoiceFormatSchema.safeParse(draft);
  if (!parsed.success) return null;
  const today = todayInTimezone(pharmacy.timezone);
  const db = await getDb();
  const [sale, tax] = await Promise.all(
    SERIES.map(async (series) => {
      const format = seriesFormat(parsed.data, series);
      const period = invoicePeriod(format, today);
      const now = seriesCounter(pharmacy, series);
      const same =
        format.invoicePrefix === now.prefix &&
        format.invoiceDigits === pharmacy.invoiceDigits &&
        period === now.period;
      const seq = same ? now.seq : await highestCounter(db, pharmacy.id, series, format, period);
      return formatInvoiceNumber(format, period, seq + 1);
    }),
  );
  return { sale, tax };
}

/**
 * Sets how new invoice and tax receipt numbers look. Numbers already issued
 * stay as they are; each counter carries on, or restarts at 1 when the date
 * part is new.
 */
export async function updateInvoiceFormat(formData: FormData): Promise<ActionState> {
  const { user, pharmacy } = await requirePharmacy();
  const t = await getT();
  if (user.role !== "admin") return { ok: false, message: t("settings.adminOnly") };
  const parsed = invoiceFormatSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey)) };
  }
  const today = todayInTimezone(pharmacy.timezone);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(pharmacies).set(parsed.data).where(eq(pharmacies.id, pharmacy.id));
    // Continue after the highest number each format already issued in today's
    // date part, so switching back to an earlier format never repeats one.
    for (const series of SERIES) {
      const format = seriesFormat(parsed.data, series);
      const period = invoicePeriod(format, today);
      const now = seriesCounter(pharmacy, series);
      const changed =
        format.invoicePrefix !== now.prefix ||
        format.invoiceDigits !== pharmacy.invoiceDigits ||
        period !== now.period;
      if (changed) await resyncCounter(tx, pharmacy.id, series, format, period);
    }
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
  await db
    .update(pharmacies)
    .set({ ...parsed.data, taxRate: round2(parsed.data.taxRate) })
    .where(eq(pharmacies.id, pharmacy.id));

  // The shell shows the pharmacy name and every page formats with its currency.
  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.profileSaved") };
}
