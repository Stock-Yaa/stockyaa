import { and, asc, desc, eq, gt, gte, isNotNull, lt, lte, notLike, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  batches,
  cashShifts,
  products,
  saleItems,
  sales,
  stockMovements,
  users,
} from "@/db/schema";
import { inScope, type BranchScope } from "./branches";
import { addDays, daysBetween, dayInTimezone, zonedDayStart } from "./dates";
import { notExpired } from "./stock";
import { round2 } from "./utils";

/*
 * Rule-based checks for unusual patterns in a branch's data. Nothing is
 * stored: every scan runs the queries again, so an anomaly disappears as soon
 * as its cause is fixed. Each check returns null when it finds nothing.
 */

export const ANOMALY_SEVERITIES = ["high", "medium", "low"] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export const ANOMALY_TYPES = [
  "expiredStock",
  "soldBelowCost",
  "cashShortage",
  "volumeSpike",
  "highRefunds",
  "largeDiscounts",
  "stockWriteOffs",
  "pricedBelowCost",
  "deadStock",
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

// Thresholds, also shown in the descriptions.
export const RECENT_DAYS = 30;
export const SPIKE_DAYS = 7;
const SPIKE_BASELINE_DAYS = 90;
export const SPIKE_FACTOR = 3;
const SPIKE_MIN_UNITS = 5;
// Less history than this before the last week is too little to call normal.
const SPIKE_MIN_BASELINE_DAYS = 14;
export const DEAD_STOCK_DAYS = 90;
export const DISCOUNT_PERCENT = 30;
export const REFUND_PERCENT = 10;
const REFUND_MIN_COUNT = 3;
const WRITE_OFF_MIN_UNITS = 10;

export type AnomalyItem = {
  label: string;
  href?: string;
  /** Money figure for this item (a loss, a shortage, a discount). */
  amount?: number;
  /** Units for this item (sold, written off, in stock). */
  units?: number;
};

export type Anomaly = {
  type: AnomalyType;
  severity: AnomalySeverity;
  /** Number of affected records (products, sales, shifts). */
  count: number;
  /** Extra figures for the description; money values are under `amount`. */
  vars: Record<string, number>;
  amount?: number;
  items: AnomalyItem[];
};

/** The branches being scanned, and the pharmacy's time zone for calendar days. */
type ScanScope = BranchScope & { timezone: string };

const productHref = (name: string) => `/products?q=${encodeURIComponent(name)}`;

/**
 * Runs every check over the branches in `scope` (product prices are
 * pharmacy-wide); results are most severe first. Item links to receipts and
 * the cash drawer open in the current branch, so scan a single branch.
 */
export async function detectAnomalies(
  db: DbOrTx,
  scope: BranchScope,
  timezone: string,
  today: string,
): Promise<Anomaly[]> {
  const s: ScanScope = { ...scope, timezone };
  const results: (Anomaly | null)[] = await Promise.all([
    expiredStock(db, s, today),
    soldBelowCost(db, s, today),
    cashShortage(db, s, today),
    volumeSpike(db, s, today),
    highRefunds(db, s, today),
    largeDiscounts(db, s, today),
    stockWriteOffs(db, s, today),
    pricedBelowCost(db, s),
    deadStock(db, s, today),
  ]);
  return results
    .filter((a): a is Anomaly => a !== null)
    .sort(
      (a, b) =>
        ANOMALY_SEVERITIES.indexOf(a.severity) - ANOMALY_SEVERITIES.indexOf(b.severity) ||
        ANOMALY_TYPES.indexOf(a.type) - ANOMALY_TYPES.indexOf(b.type),
    );
}

/** Expired batches still counted as stock: they could be sold by mistake. */
async function expiredStock(db: DbOrTx, scope: ScanScope, today: string) {
  const rows = await db
    .select({
      name: products.name,
      units: sql<number>`sum(${batches.quantity})`.mapWith(Number),
    })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(
      and(
        inScope(batches, scope),
        gt(batches.quantity, 0),
        lt(batches.expiryDate, today),
      ),
    )
    .groupBy(products.id, products.name)
    .orderBy(desc(sql`sum(${batches.quantity})`));
  if (rows.length === 0) return null;
  return {
    type: "expiredStock",
    severity: "high",
    count: rows.length,
    vars: { units: rows.reduce((sum, r) => sum + r.units, 0) },
    items: rows.map((r) => ({
      label: r.name,
      units: r.units,
      href: "/inventory/alerts?type=expired",
    })),
  } satisfies Anomaly;
}

/** Products sold for less than the cost of the batch they came from. */
async function soldBelowCost(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(RECENT_DAYS - 1)), scope.timezone);
  const loss = sql<number>`sum((${saleItems.costPrice} - ${saleItems.unitPrice}) * ${saleItems.quantity})`;
  const rows = await db
    .select({ name: saleItems.productName, loss: loss.mapWith(Number) })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        inScope(sales, scope),
        eq(sales.status, "completed"),
        gte(sales.createdAt, since),
        lt(saleItems.unitPrice, saleItems.costPrice),
      ),
    )
    .groupBy(saleItems.productName)
    .orderBy(desc(loss));
  if (rows.length === 0) return null;
  return {
    type: "soldBelowCost",
    severity: "high",
    count: rows.length,
    vars: { days: RECENT_DAYS },
    amount: round2(rows.reduce((sum, r) => sum + r.loss, 0)),
    items: rows.map((r) => ({ label: r.name, amount: round2(r.loss), href: productHref(r.name) })),
  } satisfies Anomaly;
}

/** Cash drawer shifts that closed with less cash than expected. */
async function cashShortage(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(RECENT_DAYS - 1)), scope.timezone);
  const rows = await db
    .select({ closedAt: cashShifts.closedAt, difference: cashShifts.difference })
    .from(cashShifts)
    .where(
      and(
        inScope(cashShifts, scope),
        isNotNull(cashShifts.closedAt),
        gte(cashShifts.closedAt, since),
        lt(cashShifts.difference, 0),
      ),
    )
    .orderBy(asc(cashShifts.difference));
  if (rows.length === 0) return null;
  const short = rows.map((r) => ({ closedAt: r.closedAt!, amount: -(r.difference ?? 0) }));
  return {
    type: "cashShortage",
    severity: "high",
    count: rows.length,
    vars: { days: RECENT_DAYS },
    amount: round2(short.reduce((sum, r) => sum + r.amount, 0)),
    // The page formats the closing time as the label.
    items: short.map((r) => ({
      label: r.closedAt.toISOString(),
      amount: round2(r.amount),
      href: "/cash-drawer",
    })),
  } satisfies Anomaly;
}

/** Products selling several times faster this week than over the months before. */
async function volumeSpike(db: DbOrTx, scope: ScanScope, today: string) {
  const tz = scope.timezone;
  const recentStartDay = addDays(today, -(SPIKE_DAYS - 1));
  const recentStart = zonedDayStart(recentStartDay, tz);
  const baselineStartDay = addDays(recentStartDay, -SPIKE_BASELINE_DAYS);
  const recent = sql<number>`coalesce(sum(${saleItems.quantity}) filter (where ${sales.createdAt} >= ${recentStart}), 0)`;
  const baseline = sql<number>`coalesce(sum(${saleItems.quantity}) filter (where ${sales.createdAt} < ${recentStart}), 0)`;
  const [rows, [opened]] = await Promise.all([
    db
      .select({
        name: products.name,
        createdAt: products.createdAt,
        recent: recent.mapWith(Number),
        baseline: baseline.mapWith(Number),
        firstSale: sql<string>`min(${sales.createdAt})`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(
        and(
          inScope(sales, scope),
          eq(sales.status, "completed"),
          gte(sales.createdAt, zonedDayStart(baselineStartDay, tz)),
        ),
      )
      .groupBy(products.id, products.name)
      .having(gte(recent, SPIKE_MIN_UNITS)),
    // The scope's first sale ever: a branch opened recently has not been
    // selling for the whole baseline, even for products created long ago.
    db
      .select({ firstSale: sql<string | null>`min(${sales.createdAt})` })
      .from(sales)
      .where(inScope(sales, scope)),
  ]);
  const openedDay = opened?.firstSale ? dayInTimezone(new Date(opened.firstSale), tz) : null;

  const spikes = rows
    .map((r) => {
      // The baseline starts when the product could first sell (its creation
      // or first sale, whichever is earlier, but not before the branch first
      // sold anything), so a new product, a new branch or a short sales
      // history is not averaged over days it could not have sold.
      const firstSaleDay = dayInTimezone(new Date(r.firstSale), tz);
      const createdDay = dayInTimezone(r.createdAt, tz);
      let availableFrom = firstSaleDay < createdDay ? firstSaleDay : createdDay;
      if (openedDay && openedDay > availableFrom) availableFrom = openedDay;
      const from = availableFrom > baselineStartDay ? availableFrom : baselineStartDay;
      const baselineDays = daysBetween(from, recentStartDay);
      const usual = r.baseline / Math.max(1, baselineDays);
      const ratio = usual > 0 ? r.recent / SPIKE_DAYS / usual : Infinity;
      return { ...r, baselineDays, ratio };
    })
    .filter((r) => r.baselineDays >= SPIKE_MIN_BASELINE_DAYS && r.ratio > SPIKE_FACTOR)
    .sort((a, b) => b.ratio - a.ratio || b.recent - a.recent);
  if (spikes.length === 0) return null;
  return {
    type: "volumeSpike",
    severity: "medium",
    count: spikes.length,
    vars: { days: SPIKE_DAYS, factor: SPIKE_FACTOR },
    items: spikes.map((r) => ({ label: r.name, units: r.recent, href: productHref(r.name) })),
  } satisfies Anomaly;
}

/** A refund rate well above normal, with the staff who made the refunded sales. */
async function highRefunds(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(RECENT_DAYS - 1)), scope.timezone);
  const refunded = sql<number>`count(*) filter (where ${sales.status} = 'refunded')`;
  const rows = await db
    .select({
      name: users.name,
      total: sql<number>`count(*)`.mapWith(Number),
      refunded: refunded.mapWith(Number),
    })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .where(and(inScope(sales, scope), gte(sales.createdAt, since)))
    .groupBy(users.id, users.name)
    .orderBy(desc(refunded));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const count = rows.reduce((sum, r) => sum + r.refunded, 0);
  if (count < REFUND_MIN_COUNT || count * 100 < total * REFUND_PERCENT) return null;
  return {
    type: "highRefunds",
    severity: "medium",
    count,
    vars: { total, percent: Math.round((count / total) * 100), days: RECENT_DAYS },
    items: rows
      .filter((r) => r.refunded > 0)
      .map((r) => ({ label: r.name ?? "—", units: r.refunded, href: "/sales?status=refunded" })),
  } satisfies Anomaly;
}

/** Sales with a discount larger than a set share of the subtotal. */
async function largeDiscounts(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(RECENT_DAYS - 1)), scope.timezone);
  const rows = await db
    .select({ id: sales.id, invoiceNumber: sales.invoiceNumber, discount: sales.discount })
    .from(sales)
    .where(
      and(
        inScope(sales, scope),
        eq(sales.status, "completed"),
        gte(sales.createdAt, since),
        gt(sales.subtotal, 0),
        sql`${sales.discount} * 100 > ${sales.subtotal} * ${DISCOUNT_PERCENT}`,
      ),
    )
    .orderBy(desc(sales.discount));
  if (rows.length === 0) return null;
  return {
    type: "largeDiscounts",
    severity: "medium",
    count: rows.length,
    vars: { days: RECENT_DAYS, percent: DISCOUNT_PERCENT },
    amount: round2(rows.reduce((sum, r) => sum + r.discount, 0)),
    items: rows.map((r) => ({ label: r.invoiceNumber, amount: r.discount, href: `/sales/${r.id}` })),
  } satisfies Anomaly;
}

/**
 * Stock removed by hand for reasons other than expiry (damage, count
 * corrections, other): repeated losses can point to theft or mistakes.
 */
async function stockWriteOffs(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(RECENT_DAYS - 1)), scope.timezone);
  const lost = sql<number>`-sum(${stockMovements.quantity})`;
  const rows = await db
    .select({ name: products.name, units: lost.mapWith(Number) })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      and(
        inScope(stockMovements, scope),
        eq(stockMovements.type, "adjustment"),
        lt(stockMovements.quantity, 0),
        gte(stockMovements.createdAt, since),
        // Throwing away expired stock is routine, not a loss to look into.
        notLike(sql`coalesce(${stockMovements.reason}, '')`, "expired%"),
      ),
    )
    .groupBy(products.id, products.name)
    .having(gte(lost, WRITE_OFF_MIN_UNITS))
    .orderBy(desc(lost));
  if (rows.length === 0) return null;
  return {
    type: "stockWriteOffs",
    severity: "medium",
    count: rows.length,
    vars: { units: rows.reduce((sum, r) => sum + r.units, 0), days: RECENT_DAYS },
    items: rows.map((r) => ({
      label: r.name,
      units: r.units,
      href: "/inventory/movements?type=adjustment",
    })),
  } satisfies Anomaly;
}

/** Active products whose sale price is below their cost price. */
async function pricedBelowCost(db: DbOrTx, scope: ScanScope) {
  const rows = await db
    .select({ name: products.name })
    .from(products)
    .where(
      and(
        eq(products.pharmacyId, scope.pharmacyId),
        eq(products.isActive, true),
        lt(products.salePrice, products.costPrice),
      ),
    )
    .orderBy(asc(products.name));
  if (rows.length === 0) return null;
  return {
    type: "pricedBelowCost",
    severity: "medium",
    count: rows.length,
    vars: {},
    items: rows.map((r) => ({ label: r.name, href: productHref(r.name) })),
  } satisfies Anomaly;
}

/**
 * Products with sellable stock and no sales for a long time. Products added
 * more recently than that have not had the chance to sell and are skipped.
 */
async function deadStock(db: DbOrTx, scope: ScanScope, today: string) {
  const since = zonedDayStart(addDays(today, -(DEAD_STOCK_DAYS - 1)), scope.timezone);
  const recentlySold = db
    .selectDistinct({ productId: saleItems.productId })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        inScope(sales, scope),
        eq(sales.status, "completed"),
        gte(sales.createdAt, since),
      ),
    );
  const units = sql<number>`sum(${batches.quantity})`;
  const rows = await db
    .select({
      name: products.name,
      units: units.mapWith(Number),
      value: sql<number>`sum(${batches.quantity} * ${batches.costPrice})`.mapWith(Number),
    })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(
      and(
        inScope(batches, scope),
        gt(batches.quantity, 0),
        notExpired(today),
        eq(products.isActive, true),
        lte(products.createdAt, since),
        sql`${products.id} not in ${recentlySold}`,
      ),
    )
    .groupBy(products.id, products.name)
    .orderBy(desc(units));
  if (rows.length === 0) return null;
  return {
    type: "deadStock",
    severity: "low",
    count: rows.length,
    vars: { days: DEAD_STOCK_DAYS },
    amount: round2(rows.reduce((sum, r) => sum + r.value, 0)),
    items: rows.map((r) => ({ label: r.name, units: r.units, href: productHref(r.name) })),
  } satisfies Anomaly;
}
