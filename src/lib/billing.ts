import { and, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { billingPayments, pharmacies } from "@/db/schema";
import { addDays, zonedDayStart } from "./dates";
import { PLATFORM_CURRENCY, PLATFORM_TIMEZONE } from "./platform";

/*
 * Platform revenue figures for the super admin. Only succeeded payments in
 * the platform currency are counted; amounts in other currencies are reported
 * separately so they are never silently added together.
 */

const counted = and(
  eq(billingPayments.status, "succeeded"),
  eq(billingPayments.currency, PLATFORM_CURRENCY),
);

const amountSum = sql<number>`coalesce(sum(${billingPayments.amount}), 0)`.mapWith(Number);

/** First day (YYYY-MM-01) of the month `offset` months from the month of `day`. */
export function monthStart(day: string, offset = 0): string {
  const [year, month] = day.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

/** Total of counted payments with paidAt in [start, end). */
export async function revenueBetween(db: DbOrTx, start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ amount: amountSum })
    .from(billingPayments)
    .where(and(counted, gte(billingPayments.paidAt, start), lt(billingPayments.paidAt, end)));
  return row.amount;
}

export async function revenueAllTime(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ amount: amountSum }).from(billingPayments).where(counted);
  return row.amount;
}

/** Revenue per calendar month for the 12 months ending with the month of `today`. */
export async function monthlyRevenue(
  db: DbOrTx,
  today: string,
): Promise<{ month: string; revenue: number }[]> {
  const first = monthStart(today, -11);
  const rows = await db
    .select({
      month: sql<string>`to_char(${billingPayments.paidAt} at time zone ${PLATFORM_TIMEZONE}, 'YYYY-MM')`,
      revenue: amountSum,
    })
    .from(billingPayments)
    .where(and(counted, gte(billingPayments.paidAt, zonedDayStart(first, PLATFORM_TIMEZONE))))
    .groupBy(sql`1`);
  const byMonth = new Map(rows.map((r) => [r.month, r.revenue]));
  return Array.from({ length: 12 }, (_, i) => {
    const month = monthStart(first, i).slice(0, 7);
    return { month, revenue: byMonth.get(month) ?? 0 };
  });
}

/** Counted payments of the last `days` days, by method. */
export async function revenueByMethod(db: DbOrTx, today: string, days: number) {
  const since = zonedDayStart(addDays(today, -(days - 1)), PLATFORM_TIMEZONE);
  return db
    .select({ method: billingPayments.method, amount: amountSum, count: count() })
    .from(billingPayments)
    .where(and(counted, gte(billingPayments.paidAt, since)))
    .groupBy(billingPayments.method);
}

/** Pharmacies that have paid the most over their lifetime. */
export async function topPayingPharmacies(db: DbOrTx, limit: number) {
  return db
    .select({
      pharmacyId: billingPayments.pharmacyId,
      // Current name when the pharmacy still exists, otherwise the copied one.
      name: sql<string>`coalesce(max(${pharmacies.name}), max(${billingPayments.pharmacyName}))`,
      amount: amountSum,
      count: count(),
      lastPaidAt: sql<Date>`max(${billingPayments.paidAt})`.mapWith(
        (value: string | Date) => new Date(value),
      ),
    })
    .from(billingPayments)
    .leftJoin(pharmacies, eq(pharmacies.id, billingPayments.pharmacyId))
    .where(counted)
    .groupBy(billingPayments.pharmacyId)
    .orderBy(desc(amountSum))
    .limit(limit);
}

/** Most recent payments of any status and currency. */
export async function recentPayments(db: DbOrTx, limit: number) {
  return db
    .select({
      id: billingPayments.id,
      pharmacyId: billingPayments.pharmacyId,
      name: sql<string>`coalesce(${pharmacies.name}, ${billingPayments.pharmacyName})`,
      amount: billingPayments.amount,
      currency: billingPayments.currency,
      method: billingPayments.method,
      status: billingPayments.status,
      paidAt: billingPayments.paidAt,
    })
    .from(billingPayments)
    .leftJoin(pharmacies, eq(pharmacies.id, billingPayments.pharmacyId))
    .orderBy(desc(billingPayments.paidAt))
    .limit(limit);
}

/** Currencies other than the platform currency that have succeeded payments. */
export async function otherPaymentCurrencies(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .selectDistinct({ currency: billingPayments.currency })
    .from(billingPayments)
    .where(
      and(
        eq(billingPayments.status, "succeeded"),
        ne(billingPayments.currency, PLATFORM_CURRENCY),
      ),
    );
  return rows.map((r) => r.currency).sort();
}
