import { desc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { billingPayments, pharmacies, users } from "@/db/schema";
import type { Format } from "@/lib/format";
import { getFormat } from "@/lib/format-server";

/** Payment rows for a table, newest first, with the recording user's name. */
export function paymentRows(db: Db, where: SQL | undefined) {
  return db
    .select({
      id: billingPayments.id,
      pharmacyId: billingPayments.pharmacyId,
      pharmacyName: sql<string>`coalesce(${pharmacies.name}, ${billingPayments.pharmacyName})`,
      planName: billingPayments.planName,
      months: billingPayments.months,
      amount: billingPayments.amount,
      currency: billingPayments.currency,
      method: billingPayments.method,
      status: billingPayments.status,
      periodEnd: billingPayments.periodEnd,
      reference: billingPayments.reference,
      paidAt: billingPayments.paidAt,
      recordedByName: users.name,
    })
    .from(billingPayments)
    .leftJoin(pharmacies, eq(pharmacies.id, billingPayments.pharmacyId))
    .leftJoin(users, eq(users.id, billingPayments.recordedBy))
    .where(where)
    .orderBy(desc(billingPayments.paidAt));
}

/** One formatter per currency present in `rows`. */
export async function moneyFormatsFor(rows: { currency: string }[], base: Format) {
  const formats = new Map([[base.currency, base]]);
  for (const { currency } of rows) {
    if (!formats.has(currency)) formats.set(currency, await getFormat(null, currency));
  }
  return formats;
}
