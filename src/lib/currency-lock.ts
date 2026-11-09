import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { expenses, purchases, sales } from "@/db/schema";

/**
 * Whether the pharmacy has any sales, purchases or expenses. Amounts are
 * stored without a currency, so once there are some the currency must not
 * change: old baht sales would read as dollars without being converted.
 */
export async function currencyLocked(db: DbOrTx, pharmacyId: string): Promise<boolean> {
  const found = await Promise.all([
    db.select({ id: sales.id }).from(sales).where(eq(sales.pharmacyId, pharmacyId)).limit(1),
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.pharmacyId, pharmacyId))
      .limit(1),
    db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.pharmacyId, pharmacyId))
      .limit(1),
  ]);
  return found.some((rows) => rows.length > 0);
}
