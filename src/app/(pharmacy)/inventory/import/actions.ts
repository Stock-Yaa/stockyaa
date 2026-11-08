"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { fieldErrorsFrom } from "@/lib/action";
import { requirePharmacy } from "@/lib/auth";
import {
  DRUG_CLASSES,
  findBestMatch,
  searchCatalog,
  spellingSuggestion,
  type CatalogDrug,
  type DrugClassKey,
} from "@/lib/drug-catalog";
import { productFields } from "@/lib/product-input";
import { addBatch } from "@/lib/stock";
import { optionalText } from "@/lib/validation";
import { MAX_BULK_NAMES, MAX_IMPORT_ROWS } from "./import-item";

type Failure = { ok: false; message: string };

export type SearchResult =
  | { ok: true; results: CatalogDrug[]; suggestion: string | null }
  | Failure;

/** Catalogue products for a typed search, a drug class, or both. */
export async function searchDrugs(query: string, drugClass: string | null): Promise<SearchResult> {
  await requirePharmacy();
  const t = await getT();
  const text = typeof query === "string" ? query.trim().slice(0, 100) : "";
  const cls =
    drugClass && drugClass in DRUG_CLASSES ? (drugClass as DrugClassKey) : undefined;
  if (!text && !cls) return { ok: true, results: [], suggestion: null };

  try {
    const results = await searchCatalog(text, cls);
    const suggestion = results.length === 0 && text ? await spellingSuggestion(text) : null;
    return { ok: true, results, suggestion };
  } catch {
    return { ok: false, message: t("bulkImport.catalogUnavailable") };
  }
}

export type LookupResult = { ok: true; found: CatalogDrug[]; notFound: string[] } | Failure;

/** The best catalogue match for each line of `text` (one medicine per line). */
export async function lookupDrugs(text: string): Promise<LookupResult> {
  await requirePharmacy();
  const t = await getT();
  const names = [
    ...new Set(
      (typeof text === "string" ? text : "")
        .split(/\r?\n/)
        .map((line) => line.trim().slice(0, 100))
        .filter(Boolean),
    ),
  ];
  if (names.length === 0) return { ok: false, message: t("bulkImport.bulkEmpty") };
  if (names.length > MAX_BULK_NAMES) {
    return { ok: false, message: t("bulkImport.bulkTooMany", { max: MAX_BULK_NAMES }) };
  }

  try {
    // A few at a time to stay well inside openFDA's rate limit.
    const matches: (CatalogDrug | null)[] = [];
    for (let i = 0; i < names.length; i += 4) {
      matches.push(...(await Promise.all(names.slice(i, i + 4).map(findBestMatch))));
    }
    return {
      ok: true,
      found: matches.filter((m): m is CatalogDrug => m !== null),
      notFound: names.filter((_, i) => matches[i] === null),
    };
  } catch {
    return { ok: false, message: t("bulkImport.catalogUnavailable") };
  }
}

const rowSchema = z.object({ ...productFields, category: optionalText(100) });

export type ImportResult = {
  ok: boolean;
  message: string;
  /** Row index -> field -> message, for rows that need fixing. */
  rowErrors?: Record<number, Record<string, string>>;
};

const sameProductKey = (name: string, strength: string | null) =>
  `${name.trim().toLowerCase()}|${(strength ?? "").trim().toLowerCase()}`;

/**
 * Creates every queued product, with its category (created when new) and
 * opening stock in the current branch. Nothing is saved unless every row is
 * valid. `branchId` is the branch the page was opened in; the import is
 * refused when the user has since switched branch.
 */
export async function importProducts(items: unknown, branchId: unknown): Promise<ImportResult> {
  const { user, pharmacy, branch } = await requirePharmacy();
  const t = await getT();
  if (branchId !== branch.id) return { ok: false, message: t("branches.changedElsewhere") };
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: t("bulkImport.nothingToImport") };
  }
  if (items.length > MAX_IMPORT_ROWS) {
    return { ok: false, message: t("bulkImport.tooManyRows", { max: MAX_IMPORT_ROWS }) };
  }

  const db = await getDb();
  const existing = await db
    .select({ name: products.name, strength: products.strength, barcode: products.barcode })
    .from(products)
    .where(eq(products.pharmacyId, pharmacy.id));
  const takenNames = new Set(existing.map((p) => sameProductKey(p.name, p.strength)));
  const takenBarcodes = new Set(existing.flatMap((p) => (p.barcode ? [p.barcode] : [])));

  const rowErrors: Record<number, Record<string, string>> = {};
  const rows = items.map((item, index) => {
    const parsed = rowSchema.safeParse(item);
    if (!parsed.success) {
      rowErrors[index] = fieldErrorsFrom(parsed.error, (m) => t(m as MessageKey));
      return null;
    }
    const row = parsed.data;
    const nameKey = sameProductKey(row.name, row.strength);
    if (takenNames.has(nameKey)) {
      rowErrors[index] = { name: t("bulkImport.duplicateProduct") };
    } else if (row.barcode && takenBarcodes.has(row.barcode)) {
      rowErrors[index] = { barcode: t("bulkImport.duplicateBarcode") };
    }
    // Later rows that repeat this one are reported as duplicates too.
    takenNames.add(nameKey);
    if (row.barcode) takenBarcodes.add(row.barcode);
    return row;
  });

  const errorCount = Object.keys(rowErrors).length;
  if (errorCount > 0) {
    return { ok: false, message: t("bulkImport.fixRows", { count: errorCount }), rowErrors };
  }
  const valid = rows.filter((row) => row !== null);

  await db.transaction(async (tx) => {
    // Categories by name, ignoring case; missing ones are created.
    const wanted = [...new Set(valid.flatMap((r) => (r.category ? [r.category] : [])))];
    const categoryIds = new Map<string, string>();
    if (wanted.length > 0) {
      const lowerName = sql<string>`lower(${categories.name})`;
      const lookup = () =>
        tx
          .select({ id: categories.id, name: lowerName })
          .from(categories)
          .where(
            and(
              eq(categories.pharmacyId, pharmacy.id),
              inArray(lowerName, wanted.map((c) => c.toLowerCase())),
            ),
          );
      for (const c of await lookup()) categoryIds.set(c.name, c.id);
      const missing = [
        ...new Map(
          wanted
            .filter((c) => !categoryIds.has(c.toLowerCase()))
            .map((c) => [c.toLowerCase(), c]),
        ).values(),
      ];
      if (missing.length > 0) {
        await tx
          .insert(categories)
          .values(missing.map((name) => ({ pharmacyId: pharmacy.id, name })))
          .onConflictDoNothing();
        for (const c of await lookup()) categoryIds.set(c.name, c.id);
      }
    }

    // Ids are chosen here so opening stock can point at its product.
    const records = valid.map((row) => ({ id: crypto.randomUUID(), row }));
    for (let i = 0; i < records.length; i += 100) {
      await tx.insert(products).values(
        records.slice(i, i + 100).map(({ id, row }) => ({
          id,
          pharmacyId: pharmacy.id,
          name: row.name,
          genericName: row.genericName,
          categoryId: row.category ? (categoryIds.get(row.category.toLowerCase()) ?? null) : null,
          manufacturer: row.manufacturer,
          dosageForm: row.dosageForm,
          strength: row.strength,
          barcode: row.barcode,
          unit: row.unit ?? "pcs",
          salePrice: row.salePrice,
          memberPrice: row.memberPrice,
          staffPrice: row.staffPrice,
          costPrice: row.costPrice,
          reorderLevel: row.reorderLevel,
          requiresPrescription: row.requiresPrescription,
        })),
      );
    }
    for (const { id, row } of records) {
      if (row.openingQuantity <= 0) continue;
      await addBatch(tx, {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        productId: id,
        quantity: row.openingQuantity,
        costPrice: row.costPrice,
        batchNumber: row.openingBatchNumber,
        expiryDate: row.openingExpiryDate,
        type: "opening",
        userId: user.id,
      });
    }
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
  return { ok: true, message: t("bulkImport.imported", { count: valid.length }) };
}
