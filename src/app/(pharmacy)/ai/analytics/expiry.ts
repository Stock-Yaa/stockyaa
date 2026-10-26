import { daysBetween } from "@/lib/dates";

export type ExpiryAdvice = "remove" | "noDemand" | "atRisk" | "sellFirst";

type Batch = {
  id: string;
  productId: string;
  expiryDate: string | null;
  quantity: number;
};

/**
 * For each batch, how many units are unlikely to sell before it expires, and
 * what to do about it. Batches of a product sell first-expiry-first-out, so
 * the units of earlier batches use up the demand before a later one's turn.
 * Pure, for testing.
 */
export function expiryRisk<T extends Batch>(
  batches: T[],
  dailyDemand: (productId: string) => number,
  today: string,
): (T & { daysLeft: number; unsold: number; advice: ExpiryAdvice })[] {
  const sorted = [...batches].sort((a, b) =>
    (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""),
  );
  // Units of each product in batches that expire before the current one.
  const ahead = new Map<string, number>();
  return sorted.map((batch) => {
    const daysLeft = batch.expiryDate ? daysBetween(today, batch.expiryDate) : 0;
    const demand = dailyDemand(batch.productId);
    // Expired units cannot be sold, so they take no demand from later batches.
    if (daysLeft < 0) return { ...batch, daysLeft, unsold: batch.quantity, advice: "remove" };
    const before = ahead.get(batch.productId) ?? 0;
    ahead.set(batch.productId, before + batch.quantity);
    // Units that can sell until the expiry day, after the earlier batches.
    const capacity = Math.max(0, Math.floor(demand * daysLeft) - before);
    const unsold = Math.max(0, batch.quantity - capacity);
    const advice: ExpiryAdvice =
      demand === 0 ? "noDemand" : unsold > 0 ? "atRisk" : "sellFirst";
    return { ...batch, daysLeft, unsold: demand === 0 ? batch.quantity : unsold, advice };
  });
}
