import { and, eq, gte, ilike, lt, ne, or, type SQL } from "drizzle-orm";
import { BILLING_METHODS, BILLING_PAYMENT_STATUSES, billingPayments, pharmacies } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { monthStart } from "@/lib/billing";
import { addDays, todayInTimezone, zonedDayStart } from "@/lib/dates";
import { likePattern } from "@/lib/pagination";
import { PLATFORM_TIMEZONE } from "@/lib/platform";

/*
 * The filters of the payments list, shared by the page and its CSV export so
 * the download always matches what is on screen. Dates follow the platform
 * time zone.
 */

export const DATE_RANGES = [
  { value: "today", label: "billing.dateToday" },
  { value: "7d", label: "billing.date7" },
  { value: "30d", label: "billing.date30" },
  { value: "month", label: "billing.dateThisMonth" },
  { value: "last-month", label: "billing.dateLastMonth" },
  { value: "year", label: "billing.dateThisYear" },
] as const satisfies readonly { value: string; label: MessageKey }[];

export const INTERVALS = [
  { value: "month", label: "billing.intervalMonthly" },
  { value: "year", label: "billing.intervalYearly" },
  { value: "other", label: "billing.intervalOther" },
] as const satisfies readonly { value: string; label: MessageKey }[];

type Param = string | string[] | undefined;
export type PaymentParams = {
  q?: Param;
  range?: Param;
  method?: Param;
  status?: Param;
  interval?: Param;
};

const single = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** Valid filter values from query parameters; anything unknown is ignored. */
export function parsePaymentFilters(params: PaymentParams) {
  const pick = <T extends string>(options: readonly T[], value: Param) =>
    options.find((option) => option === single(value));
  return {
    q: single(params.q)?.trim() || undefined,
    range: pick(
      DATE_RANGES.map((r) => r.value),
      params.range,
    ),
    method: pick(BILLING_METHODS, params.method),
    status: pick(BILLING_PAYMENT_STATUSES, params.status),
    interval: pick(
      INTERVALS.map((i) => i.value),
      params.interval,
    ),
  };
}

export type PaymentFilters = ReturnType<typeof parsePaymentFilters>;

function rangeCondition(range: NonNullable<PaymentFilters["range"]>): SQL | undefined {
  const today = todayInTimezone(PLATFORM_TIMEZONE);
  const at = (day: string) => zonedDayStart(day, PLATFORM_TIMEZONE);
  const between = (from: string, to: string) =>
    and(gte(billingPayments.paidAt, at(from)), lt(billingPayments.paidAt, at(to)));
  const tomorrow = addDays(today, 1);
  switch (range) {
    case "today":
      return between(today, tomorrow);
    case "7d":
      return between(addDays(today, -6), tomorrow);
    case "30d":
      return between(addDays(today, -29), tomorrow);
    case "month":
      return between(monthStart(today), monthStart(today, 1));
    case "last-month":
      return between(monthStart(today, -1), monthStart(today));
    case "year":
      return between(`${today.slice(0, 4)}-01-01`, `${Number(today.slice(0, 4)) + 1}-01-01`);
  }
}

/** WHERE condition for the filters. The query must left-join pharmacies. */
export function paymentWhere(filters: PaymentFilters): SQL | undefined {
  const pattern = filters.q ? likePattern(filters.q) : null;
  const interval =
    filters.interval === "month"
      ? eq(billingPayments.months, 1)
      : filters.interval === "year"
        ? eq(billingPayments.months, 12)
        : filters.interval === "other"
          ? and(ne(billingPayments.months, 1), ne(billingPayments.months, 12))
          : undefined;
  return and(
    filters.range ? rangeCondition(filters.range) : undefined,
    filters.method ? eq(billingPayments.method, filters.method) : undefined,
    filters.status ? eq(billingPayments.status, filters.status) : undefined,
    interval,
    pattern
      ? or(
          ilike(billingPayments.pharmacyName, pattern),
          ilike(pharmacies.name, pattern),
          ilike(billingPayments.reference, pattern),
        )
      : undefined,
  );
}

/** Label key for the months a payment covered. */
export function intervalLabel(months: number | null): MessageKey | null {
  if (months === 1) return "billing.intervalMonthly";
  if (months === 12) return "billing.intervalYearly";
  return null;
}
