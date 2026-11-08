import type { INVOICE_DATE_FORMATS, Pharmacy } from "@/db/schema";

/*
 * Invoice number format: prefix + date part + counter, e.g. "INV-" + "202611"
 * + "001". Client-safe, so Settings can preview exactly what createSale makes.
 */

export type InvoiceDateFormat = (typeof INVOICE_DATE_FORMATS)[number];

/** The schema's list, without bundling the schema into the browser. */
export const INVOICE_DATE_FORMAT_OPTIONS = [
  "none",
  "YYYY",
  "YYYYMM",
  "YYYYMMDD",
  "YYMM",
  "YYMMDD",
] as const satisfies typeof INVOICE_DATE_FORMATS;

export type InvoiceFormat = Pick<
  Pharmacy,
  "invoicePrefix" | "invoiceDateFormat" | "invoiceBuddhistYear" | "invoiceDigits"
>;

export const MIN_INVOICE_DIGITS = 3;
export const MAX_INVOICE_DIGITS = 10;
export const MAX_INVOICE_PREFIX = 20;
// Letters (any script), digits and - _ / . #
export const INVOICE_PREFIX_PATTERN = /^[\p{L}\p{N}\-_/.#]*$/u;

/**
 * The date part for calendar day `day` (YYYY-MM-DD, the pharmacy's own day),
 * or "" without one. A Buddhist-era year is 543 years ahead (2026 = 2569).
 */
export function invoicePeriod(format: InvoiceFormat, day: string): string {
  if (format.invoiceDateFormat === "none") return "";
  const [y, m, d] = day.split("-");
  const year = String(Number(y) + (format.invoiceBuddhistYear ? 543 : 0));
  const yy = year.slice(-2);
  switch (format.invoiceDateFormat) {
    case "YYYY":
      return year;
    case "YYYYMM":
      return `${year}${m}`;
    case "YYYYMMDD":
      return `${year}${m}${d}`;
    case "YYMM":
      return `${yy}${m}`;
    case "YYMMDD":
      return `${yy}${m}${d}`;
  }
}

/** The invoice number for counter value `seq` in `period`. */
export function formatInvoiceNumber(format: InvoiceFormat, period: string, seq: number): string {
  return `${format.invoicePrefix}${period}${String(seq).padStart(format.invoiceDigits, "0")}`;
}
