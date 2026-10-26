import type { Locale } from "@/i18n/config";

const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  // Gregorian years in Thai too, so expiry dates match what is printed on packs.
  th: "th-TH-u-ca-gregory",
};

export type Format = ReturnType<typeof createFormat>;

/**
 * Locale-aware formatters. Use getFormat() on the server and useFormat() in
 * client components rather than calling this directly.
 */
export function createFormat(
  locale: Locale,
  currency = "THB",
  timeZone = "Asia/Bangkok",
) {
  const tag = INTL_LOCALE[locale];
  const moneyFmt = new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  });
  const numberFmt = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone });
  // Calendar dates (YYYY-MM-DD) have no timezone; format them as UTC.
  const calendarFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" });
  const shortFmt = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const monthFmt = new Intl.DateTimeFormat(tag, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  const timeFmt = new Intl.DateTimeFormat(tag, { timeStyle: "short", timeZone });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  return {
    locale,
    currency,
    timeZone,
    money: (value: number | null | undefined) => moneyFmt.format(value ?? 0),
    number: (value: number | null | undefined) => numberFmt.format(value ?? 0),
    /** A point in time (Date / ISO timestamp) shown as a date in the pharmacy's timezone. */
    date: (value: Date | string | null | undefined) =>
      value ? dateFmt.format(new Date(value)) : "—",
    /** A calendar date stored as YYYY-MM-DD (expiry dates). */
    day: (value: string | null | undefined) =>
      value ? calendarFmt.format(new Date(`${value}T00:00:00Z`)) : "—",
    /** A calendar date as a short axis label, e.g. "6 Oct". */
    dayShort: (value: string) => shortFmt.format(new Date(`${value}T00:00:00Z`)),
    /** A calendar month written as YYYY-MM, e.g. "Oct 26". */
    month: (value: string) => monthFmt.format(new Date(`${value}-01T00:00:00Z`)),
    /** Time of day of an instant, in the time zone. */
    time: (value: Date | string) => timeFmt.format(new Date(value)),
    dateTime: (value: Date | string | null | undefined) =>
      value ? dateTimeFmt.format(new Date(value)) : "—",
  };
}
