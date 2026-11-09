import { and, eq, sql, type SQL } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db";
import {
  branches,
  creditNotes,
  documentCounters,
  pharmacies,
  purchases,
  sales,
  stockTransfers,
  taxInvoices,
  type Branch,
  type DocumentSeries,
  type Pharmacy,
} from "@/db/schema";
import { formatInvoiceNumber, invoicePeriod, type InvoiceFormat } from "./invoice-number";

/*
 * Running document numbers in the pharmacy's own format (Settings): sales
 * invoices, full tax receipts, credit notes, purchase orders and stock
 * transfers. All use the same date part and digits, each series with its
 * own prefix and counter; a counter restarts at 1 when the date part changes
 * (a new month for YYYYMM). With "numbers per branch" every branch counts on
 * its own and its code follows the prefix: INV-SKV-202611001.
 */

export type NumberSeries = DocumentSeries;

export const NUMBER_SERIES = ["sale", "tax", "credit", "purchase", "transfer"] as const satisfies readonly NumberSeries[];

const SERIES = {
  sale: { prefix: "invoicePrefix", number: sales.invoiceNumber, owner: sales.pharmacyId },
  tax: { prefix: "taxInvoicePrefix", number: taxInvoices.number, owner: taxInvoices.pharmacyId },
  credit: { prefix: "creditNotePrefix", number: creditNotes.number, owner: creditNotes.pharmacyId },
  purchase: { prefix: "purchasePrefix", number: purchases.reference, owner: purchases.pharmacyId },
  transfer: { prefix: "transferPrefix", number: stockTransfers.reference, owner: stockTransfers.pharmacyId },
} as const;

const TABLES = {
  sale: sales,
  tax: taxInvoices,
  credit: creditNotes,
  purchase: purchases,
  transfer: stockTransfers,
} as const;

export type NumberingSettings = Pick<
  Pharmacy,
  | "invoicePrefix"
  | "taxInvoicePrefix"
  | "creditNotePrefix"
  | "purchasePrefix"
  | "transferPrefix"
  | "invoiceDateFormat"
  | "invoiceBuddhistYear"
  | "invoiceDigits"
  | "numberPerBranch"
>;

export type NumberingBranch = Pick<Branch, "id" | "code">;

/** A branch without a code (should not happen: one is required) still gets distinct numbers. */
export function branchCodeOf(branch: NumberingBranch): string {
  return branch.code || `B${branch.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

/** The counter a branch's documents use: "" (whole pharmacy) or the branch's own. */
export function counterScope(settings: Pick<Pharmacy, "numberPerBranch">, branch: NumberingBranch): string {
  return settings.numberPerBranch ? branch.id : "";
}

/** The format of one series for a branch: its prefix (plus the branch code) with the shared date part and digits. */
export function seriesFormat(
  settings: NumberingSettings,
  series: NumberSeries,
  branch: NumberingBranch,
): InvoiceFormat {
  const prefix = settings[SERIES[series].prefix];
  return {
    invoicePrefix: settings.numberPerBranch ? `${prefix}${branchCodeOf(branch)}-` : prefix,
    invoiceDateFormat: settings.invoiceDateFormat,
    invoiceBuddhistYear: settings.invoiceBuddhistYear,
    invoiceDigits: settings.invoiceDigits,
  };
}

async function isUsed(db: DbOrTx, pharmacyId: string, series: NumberSeries, number: string) {
  const { number: column, owner } = SERIES[series];
  return (await db.$count(TABLES[series], and(eq(owner, pharmacyId), eq(column, number)))) > 0;
}

const counterKey = (pharmacyId: string, series: NumberSeries, scope: string) =>
  and(
    eq(documentCounters.pharmacyId, pharmacyId),
    eq(documentCounters.series, series),
    eq(documentCounters.scope, scope),
  );

async function setCounter(tx: Tx, pharmacyId: string, series: NumberSeries, scope: string, seq: number, period: string) {
  await tx
    .insert(documentCounters)
    .values({ pharmacyId, series, scope, seq, period })
    .onConflictDoUpdate({
      target: [documentCounters.pharmacyId, documentCounters.series, documentCounters.scope],
      set: { seq, period },
    });
}

/**
 * Next number of a series for a document of `branchId`. `day` (YYYY-MM-DD,
 * the pharmacy's calendar day) fills the date part. Call inside a
 * transaction: the counter row stays locked until it ends, so two documents
 * never get the same number, and the pharmacy row is share-locked so the
 * format cannot change halfway.
 */
export async function nextDocumentNumber(
  tx: Tx,
  pharmacyId: string,
  series: NumberSeries,
  day: string,
  branchId: string,
): Promise<string> {
  const [settings] = await tx
    .select({
      invoicePrefix: pharmacies.invoicePrefix,
      taxInvoicePrefix: pharmacies.taxInvoicePrefix,
      creditNotePrefix: pharmacies.creditNotePrefix,
      purchasePrefix: pharmacies.purchasePrefix,
      transferPrefix: pharmacies.transferPrefix,
      invoiceDateFormat: pharmacies.invoiceDateFormat,
      invoiceBuddhistYear: pharmacies.invoiceBuddhistYear,
      invoiceDigits: pharmacies.invoiceDigits,
      numberPerBranch: pharmacies.numberPerBranch,
    })
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacyId))
    .for("share");
  const [branch] = await tx
    .select({ id: branches.id, code: branches.code })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.pharmacyId, pharmacyId)));
  if (!branch) throw new Error("Unknown branch for document number");

  const format = seriesFormat(settings, series, branch);
  const period = invoicePeriod(format, day);
  const scope = counterScope(settings, branch);
  // excluded.* is the row proposed above; the qualified names are the stored one.
  const [row] = await tx
    .insert(documentCounters)
    .values({ pharmacyId, series, scope, seq: 1, period })
    .onConflictDoUpdate({
      target: [documentCounters.pharmacyId, documentCounters.series, documentCounters.scope],
      set: {
        seq: sql.raw(
          `case when "document_counters"."period" = excluded."period" then "document_counters"."seq" + 1 else 1 end`,
        ),
        period: sql.raw(`excluded."period"`),
      },
    })
    .returning({ seq: documentCounters.seq });
  const number = formatInvoiceNumber(format, period, row.seq);
  if (!(await isUsed(tx, pharmacyId, series, number))) return number;

  // The format was changed back to one used before: carry on after the
  // highest number it already issued instead of repeating one.
  let seq = Math.max(row.seq, (await highestCounter(tx, pharmacyId, series, format, period)) + 1);
  for (;;) {
    const candidate = formatInvoiceNumber(format, period, seq);
    if (!(await isUsed(tx, pharmacyId, series, candidate))) {
      await tx.update(documentCounters).set({ seq }).where(counterKey(pharmacyId, series, scope));
      return candidate;
    }
    seq++;
  }
}

/**
 * The highest counter among a series' numbers of this format in `period`:
 * prefix + date part followed by the counter's digits (or up to two more,
 * once the counter has outgrown them); 0 if none. Numbers of another format,
 * such as INV-202611001 when looking for INV- + 6 digits, do not match.
 */
export async function highestCounter(
  db: DbOrTx,
  pharmacyId: string,
  series: NumberSeries,
  format: Pick<InvoiceFormat, "invoicePrefix" | "invoiceDigits">,
  period: string,
): Promise<number> {
  const { number, owner } = SERIES[series];
  const start = format.invoicePrefix + period;
  // LIKE wildcards in a prefix are matched literally.
  const pattern = `${start.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // ::int matters: with a text parameter, "substring(x from y)" is a regex match.
  const tail: SQL = sql`substring(${number} from ${start.length + 1}::int)`;
  const digits = `^[0-9]{${format.invoiceDigits},${format.invoiceDigits + 2}}$`;
  const [row] = await db
    .select({ highest: sql<number>`coalesce(max(${tail}::numeric), 0)`.mapWith(Number) })
    .from(TABLES[series])
    .where(and(eq(owner, pharmacyId), sql`${number} like ${pattern}`, sql`${tail} ~ ${digits}`));
  return row?.highest ?? 0;
}

/** Where a series' counter is now (seq 0 in period "" when it has not started). */
export async function getCounter(db: DbOrTx, pharmacyId: string, series: NumberSeries, scope: string) {
  const [row] = await db
    .select({ seq: documentCounters.seq, period: documentCounters.period })
    .from(documentCounters)
    .where(counterKey(pharmacyId, series, scope));
  return row ?? { seq: 0, period: "" };
}

const sameFormat = (a: InvoiceFormat, b: InvoiceFormat) =>
  a.invoicePrefix === b.invoicePrefix && a.invoiceDigits === b.invoiceDigits;

/**
 * The number the next document of `series` in `branch` would get with
 * `draft` as the format (the Settings preview); it skips numbers already
 * issued when the format is new.
 */
export async function previewNumber(
  db: DbOrTx,
  pharmacy: Pharmacy,
  draft: NumberingSettings,
  series: NumberSeries,
  branch: NumberingBranch,
  day: string,
): Promise<string> {
  const format = seriesFormat(draft, series, branch);
  const period = invoicePeriod(format, day);
  let seq: number;
  if (sameFormat(format, seriesFormat(pharmacy, series, branch))) {
    const counter = await getCounter(db, pharmacy.id, series, counterScope(draft, branch));
    seq = counter.period === period ? counter.seq : 0;
  } else {
    seq = await highestCounter(db, pharmacy.id, series, format, period);
  }
  return formatInvoiceNumber(format, period, seq + 1);
}

/**
 * After a format change, points each changed counter (per branch when
 * numbers are per branch) past every number the new format has already
 * issued in today's date part, so the next one is free.
 */
export async function resyncCounters(
  tx: Tx,
  pharmacy: Pharmacy,
  next: NumberingSettings,
  branchList: NumberingBranch[],
  day: string,
) {
  for (const series of NUMBER_SERIES) {
    for (const branch of next.numberPerBranch ? branchList : branchList.slice(0, 1)) {
      const format = seriesFormat(next, series, branch);
      const period = invoicePeriod(format, day);
      const scope = counterScope(next, branch);
      const counter = await getCounter(tx, pharmacy.id, series, scope);
      const unchanged =
        sameFormat(format, seriesFormat(pharmacy, series, branch)) &&
        counterScope(pharmacy, branch) === scope &&
        counter.period === period;
      if (unchanged) continue;
      const highest = await highestCounter(tx, pharmacy.id, series, format, period);
      await setCounter(tx, pharmacy.id, series, scope, highest, period);
    }
  }
}
