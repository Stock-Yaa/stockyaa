"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { LABEL_LANGUAGES, LABEL_PRESETS, dispensedLabels, products, sales, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { ActionState } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import { branchScope, inScope } from "@/lib/branches";
import { SLOTS, licenseNumber } from "@/lib/label-layout";

const text = (max: number) => z.string().trim().max(max);

const slotsSchema = z
  .object(Object.fromEntries(SLOTS.map((s) => [s, z.string().max(20).nullable()])) as Record<
    (typeof SLOTS)[number],
    z.ZodNullable<z.ZodString>
  >)
  .nullable();

const labelSchema = z.object({
  productId: z.uuid(),
  drugName: text(300).min(1),
  strength: text(100),
  quantity: text(100).min(1),
  indication: text(500).min(1),
  directions: text(2000).min(1),
  slots: slotsSchema,
  warnings: z.array(text(500)).max(10),
  secondSticker: z.array(text(500)).max(10),
  thai: z.record(z.string(), z.unknown()).nullable(),
});

const recordSchema = z.object({
  branchId: z.uuid(),
  saleId: z.uuid().nullable(),
  pharmacistId: z.uuid(),
  patientName: text(200).min(1),
  language: z.enum(LABEL_LANGUAGES),
  preset: z.enum(LABEL_PRESETS),
  labels: z.array(labelSchema).min(1).max(100),
});

export type PrintedLabelsPayload = z.infer<typeof recordSchema>;

/**
 * Records the labels being printed (Thai GPP: what was dispensed, to whom, by
 * which pharmacist). Called just before the print dialog opens; nothing is
 * printed if this fails.
 */
export async function recordPrintedLabels(payload: PrintedLabelsPayload): Promise<ActionState> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  const parsed = recordSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: t("dispensing.recordInvalid") };
  const data = parsed.data;
  // The page was opened in this branch: a label of another branch is refused.
  if (data.branchId !== branch.id) return { ok: false, message: t("branches.changedElsewhere") };

  const db = await getDb();
  if (data.saleId) {
    const [sale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.id, data.saleId), inScope(sales, branchScope(branch))));
    if (!sale) return { ok: false, message: t("common.notFound") };
  }
  const [pharmacist] = await db
    .select({ id: users.id, name: users.name, license: users.pharmacistLicense })
    .from(users)
    .where(and(eq(users.id, data.pharmacistId), eq(users.pharmacyId, pharmacy.id), eq(users.isActive, true)));
  if (!pharmacist?.license?.trim()) return { ok: false, message: t("dispensing.pharmacistLicenseMissing") };

  const productIds = [...new Set(data.labels.map((l) => l.productId))];
  const known = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.pharmacyId, pharmacy.id), inArray(products.id, productIds)));
  if (known.length !== productIds.length) return { ok: false, message: t("common.notFound") };

  await db.insert(dispensedLabels).values(
    data.labels.map((label) => ({
      pharmacyId: pharmacy.id,
      branchId: branch.id,
      saleId: data.saleId,
      productId: label.productId,
      userId: user.id,
      pharmacistId: pharmacist.id,
      pharmacistName: pharmacist.name,
      pharmacistLicense: licenseNumber(pharmacist.license),
      patientName: data.patientName,
      language: data.language,
      preset: data.preset,
      indication: label.indication,
      printed: {
        drugName: label.drugName,
        strength: label.strength,
        quantity: label.quantity,
        indication: label.indication,
        directions: label.directions,
        slots: label.slots,
        warnings: label.warnings,
        secondSticker: label.secondSticker,
      },
      thai: label.thai,
    })),
  );
  return { ok: true };
}
