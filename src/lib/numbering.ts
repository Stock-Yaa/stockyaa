import { and, eq, sql, type SQL } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db";
import { pharmacies, sales, taxInvoices, type Pharmacy } from "@/db/schema";
import { formatInvoiceNumber, invoicePeriod, type InvoiceFormat } from "./invoice-number";

/*
 * Running document numbers in the pharmacy's own format (Settings): sales
 * invoices and full tax receipts. Both use the same date part and digits,
 * each with its own prefix and counter; the counter restarts at 1 when the
 * date part changes (a new month for YYYYMM).
 */

export type NumberSeries = "sale" | "tax";

const SERIES = {
  sale: {
    prefix: (p: Pick<Pharmacy, "invoicePrefix">) => p.invoicePrefix,
    seq: pharmacies.saleSeq,
    period: pharmacies.invoiceSeqPeriod,
    seqKey: "saleSeq",
    periodKey: "invoiceSeqPeriod",
    table: sales,
    number: sales.invoiceNumber,
    owner: sales.pharmacyId,
  },
  tax: {
    prefix: (p: Pick<Pharmacy, "taxInvoicePrefix">) => p.taxInvoicePrefix,
    seq: pharmacies.taxSeq,
    period: pharmacies.taxSeqPeriod,
    seqKey: "taxSeq",
    periodKey: "taxSeqPeriod",
    table: taxInvoices,
    number: taxInvoices.number,
    owner: taxInvoices.pharmacyId,
  },
} as const;

export type NumberingSettings = Pick<
  Pharmacy,
  "invoicePrefix" | "taxInvoicePrefix" | "invoiceDateFormat" | "invoiceBuddhistYear" | "invoiceDigits"
>;

/** The format of one series: its prefix with the shared date part and digits. */
export function seriesFormat(settings: NumberingSettings, series: NumberSeries): InvoiceFormat {
  return {
    invoicePrefix: SERIES[series].prefix(settings),
    invoiceDateFormat: settings.invoiceDateFormat,
    invoiceBuddhistYear: settings.invoiceBuddhistYear,
    invoiceDigits: settings.invoiceDigits,
  };
}

async function isUsed(db: DbOrTx, pharmacyId: string, series: NumberSeries, number: string) {
  const { table, number: column, owner } = SERIES[series];
  return (await db.$count(table, and(eq(owner, pharmacyId), eq(column, number)))) > 0;
}

/**
 * Next number of a series. `day` (YYYY-MM-DD, the pharmacy's calendar day)
 * fills the date part. Call inside a transaction: it locks the pharmacy row,
 * so two documents never get the same number.
 */
export async function nextDocumentNumber(
  tx: Tx,
  pharmacyId: string,
  series: NumberSeries,
  day: string,
): Promise<string> {
  const config = SERIES[series];
  const [settings] = await tx
    .select({
      invoicePrefix: pharmacies.invoicePrefix,
      taxInvoicePrefix: pharmacies.taxInvoicePrefix,
      invoiceDateFormat: pharmacies.invoiceDateFormat,
      invoiceBuddhistYear: pharmacies.invoiceBuddhistYear,
      invoiceDigits: pharmacies.invoiceDigits,
    })
    .from(pharmacies)
    .where(eq(pharmacies.id, pharmacyId))
    .for("update");
  const format = seriesFormat(settings, series);
  const period = invoicePeriod(format, day);
  const [row] = await tx
    .update(pharmacies)
    .set({
      [config.seqKey]: sql`case when ${config.period} = ${period} then ${config.seq} + 1 else 1 end`,
      [config.periodKey]: period,
    })
    .where(eq(pharmacies.id, pharmacyId))
    .returning({ seq: config.seq });
  const number = formatInvoiceNumber(format, period, row.seq);
  if (!(await isUsed(tx, pharmacyId, series, number))) return number;

  // The format was changed back to one used before: carry on after the
  // highest number it already issued instead of repeating one.
  let seq = (await highestCounter(tx, pharmacyId, series, format, period)) + 1;
  for (;;) {
    const candidate = formatInvoiceNumber(format, period, seq);
    if (!(await isUsed(tx, pharmacyId, series, candidate))) {
      await tx.update(pharmacies).set({ [config.seqKey]: seq }).where(eq(pharmacies.id, pharmacyId));
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
  const { table, number, owner } = SERIES[series];
  const start = format.invoicePrefix + period;
  // LIKE wildcards in a prefix are matched literally.
  const pattern = `${start.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // ::int matters: with a text parameter, "substring(x from y)" is a regex match.
  const tail: SQL = sql`substring(${number} from ${start.length + 1}::int)`;
  const digits = `^[0-9]{${format.invoiceDigits},${format.invoiceDigits + 2}}$`;
  const [row] = await db
    .select({ highest: sql<number>`coalesce(max(${tail}::numeric), 0)`.mapWith(Number) })
    .from(table)
    .where(and(eq(owner, pharmacyId), sql`${number} like ${pattern}`, sql`${tail} ~ ${digits}`));
  return row?.highest ?? 0;
}

/**
 * Points a series' counter at `period` after a format change, past every
 * number the new format has already issued, so the next one is free.
 */
export async function resyncCounter(
  tx: Tx,
  pharmacyId: string,
  series: NumberSeries,
  format: Pick<InvoiceFormat, "invoicePrefix" | "invoiceDigits">,
  period: string,
) {
  const config = SERIES[series];
  const highest = await highestCounter(tx, pharmacyId, series, format, period);
  await tx
    .update(pharmacies)
    .set({ [config.seqKey]: highest, [config.periodKey]: period })
    .where(eq(pharmacies.id, pharmacyId));
}

/** Where a series' counter is now, to preview its next number. */
export function seriesCounter(pharmacy: Pharmacy, series: NumberSeries) {
  return series === "sale"
    ? { seq: pharmacy.saleSeq, period: pharmacy.invoiceSeqPeriod, prefix: pharmacy.invoicePrefix }
    : { seq: pharmacy.taxSeq, period: pharmacy.taxSeqPeriod, prefix: pharmacy.taxInvoicePrefix };
}
