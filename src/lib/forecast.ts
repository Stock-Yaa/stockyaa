import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { batches, branches, products, saleItems, sales } from "@/db/schema";
import { inScope, type BranchScope } from "./branches";
import { addDays, daysBetween, dayInTimezone, zonedDayStart } from "./dates";
import { notExpired } from "./stock";

/*
 * Statistical demand forecast per product for one branch (or all of them),
 * from its completed sales over the last 180 whole days (today is left out
 * because it is not over yet) against its stock. No AI: a blend of the recent
 * and the long-run daily rate, so a product that has started selling faster
 * is picked up without one busy day swinging it.
 */

export const HISTORY_DAYS = 180;
const RECENT_DAYS = 30;
// Share of the last 30 days in the blended daily rate.
const RECENT_WEIGHT = 0.6;
// Extra days of demand kept on hand on top of the forecast period.
export const SAFETY_DAYS = 7;
export const CRITICAL_DAYS = 7;
export const WARNING_DAYS = 14;

export type ForecastStatus = "critical" | "warning" | "healthy";
export type ForecastTrend = "up" | "down" | "flat";
export type ForecastConfidence = "low" | "medium" | "high";

export type ProductForecast = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  /** Default cost per unit, to price a reorder. */
  costPrice: number;
  stock: number;
  /** Expected units sold per day. */
  dailyDemand: number;
  /** Expected units sold over the forecast period. */
  projected: number;
  /** Whole days until stock runs out; null when no demand is expected. */
  daysToStockout: number | null;
  status: ForecastStatus;
  trend: ForecastTrend;
  confidence: ForecastConfidence;
  /** Units to order to cover the period plus a safety margin (0 = none). */
  suggestedOrder: number;
};

type SalesHistory = {
  stock: number;
  /** Units sold in the last 30 days, the 30 days before, and the whole window. */
  recent: number;
  previous: number;
  total: number;
  /** Days with at least one sale. */
  saleDays: number;
  /** Days of history the rates are based on (1..180). */
  historyDays: number;
};

/** The forecast figures for one product's sales history. Pure, for testing. */
export function forecastFromHistory(history: SalesHistory, horizonDays: number) {
  const { stock, recent, previous, total, saleDays, historyDays } = history;
  const longRate = total / historyDays;
  const recentRate = recent / Math.min(RECENT_DAYS, historyDays);
  const dailyDemand =
    historyDays > RECENT_DAYS
      ? RECENT_WEIGHT * recentRate + (1 - RECENT_WEIGHT) * longRate
      : longRate;

  // Trend: the last 30 days against the 30 before, once there are enough days
  // to compare and enough units that a couple of sales are not "a trend".
  let trend: ForecastTrend = "flat";
  const previousDays = Math.min(RECENT_DAYS, historyDays - RECENT_DAYS);
  if (previousDays >= 14) {
    const previousRate = previous / previousDays;
    if (recent >= 3 && recentRate > previousRate * 1.2) trend = "up";
    else if (previous >= 3 && recentRate < previousRate * 0.8) trend = "down";
  }

  const confidence: ForecastConfidence =
    saleDays >= 30 ? "high" : saleDays >= 8 ? "medium" : "low";

  const daysToStockout =
    stock <= 0 ? 0 : dailyDemand > 0 ? Math.floor(stock / dailyDemand) : null;
  const status: ForecastStatus =
    daysToStockout === null
      ? "healthy"
      : daysToStockout < CRITICAL_DAYS
        ? "critical"
        : daysToStockout < WARNING_DAYS
          ? "warning"
          : "healthy";

  const projected = dailyDemand * horizonDays;
  const suggestedOrder = Math.max(
    0,
    Math.ceil(dailyDemand * (horizonDays + SAFETY_DAYS) - stock),
  );

  return { dailyDemand, projected, daysToStockout, status, trend, confidence, suggestedOrder };
}

/**
 * Forecasts for every active product sold in the scope (one branch, or all
 * branches) in the last 180 days, against the scope's sellable stock, most
 * urgent first (soonest stockout, then highest demand).
 */
export async function getDemandForecast(
  db: DbOrTx,
  scope: BranchScope,
  tz: string,
  today: string,
  horizonDays: number,
): Promise<ProductForecast[]> {
  const windowStartDay = addDays(today, -HISTORY_DAYS);
  const windowStart = zonedDayStart(windowStartDay, tz);
  const recentStart = zonedDayStart(addDays(today, -RECENT_DAYS), tz);
  const previousStart = zonedDayStart(addDays(today, -2 * RECENT_DAYS), tz);
  const windowEnd = zonedDayStart(today, tz);

  const sold = db
    .select({
      productId: saleItems.productId,
      total: sql<number>`sum(${saleItems.quantity})`.mapWith(Number).as("total"),
      recent:
        sql<number>`coalesce(sum(${saleItems.quantity}) filter (where ${sales.createdAt} >= ${recentStart}), 0)`
          .mapWith(Number)
          .as("recent"),
      previous:
        sql<number>`coalesce(sum(${saleItems.quantity}) filter (where ${sales.createdAt} >= ${previousStart} and ${sales.createdAt} < ${recentStart}), 0)`
          .mapWith(Number)
          .as("previous"),
      saleDays:
        sql<number>`count(distinct (timezone(${tz}, ${sales.createdAt}))::date)`
          .mapWith(Number)
          .as("sale_days"),
      firstSale: sql<string>`min(${sales.createdAt})`.as("first_sale"),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        inScope(sales, scope),
        eq(sales.status, "completed"),
        gte(sales.createdAt, windowStart),
        lt(sales.createdAt, windowEnd),
      ),
    )
    .groupBy(saleItems.productId)
    .as("sold");

  const stock = db
    .select({
      productId: batches.productId,
      qty: sql<number>`sum(${batches.quantity})`.mapWith(Number).as("qty"),
    })
    .from(batches)
    .where(and(inScope(batches, scope), gt(batches.quantity, 0), notExpired(today)))
    .groupBy(batches.productId)
    .as("stock");

  const [rows, [branch]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        barcode: products.barcode,
        unit: products.unit,
        costPrice: products.costPrice,
        createdAt: products.createdAt,
        stock: sql<number>`coalesce(${stock.qty}, 0)`.mapWith(Number),
        total: sold.total,
        recent: sold.recent,
        previous: sold.previous,
        saleDays: sold.saleDays,
        firstSale: sold.firstSale,
      })
      .from(products)
      .innerJoin(sold, eq(sold.productId, products.id))
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(and(eq(products.pharmacyId, scope.pharmacyId), eq(products.isActive, true))),
    scope.branchId
      ? db
          .select({ createdAt: branches.createdAt })
          .from(branches)
          .where(and(eq(branches.id, scope.branchId), eq(branches.pharmacyId, scope.pharmacyId)))
          .limit(1)
      : [],
  ]);
  const openedDay = branch ? dayInTimezone(branch.createdAt, tz) : null;

  return rows
    .map((row) => {
      // History starts when the product could first be sold here: its
      // creation (or the branch's opening, if later) or its first sale in the
      // window, whichever is earlier (imported or seeded products, and branches
      // that took over older sales, can have sales from before their record
      // was created). The driver returns the min() timestamp as a Date or a string.
      const firstSaleDay = dayInTimezone(new Date(row.firstSale), tz);
      const productDay = dayInTimezone(row.createdAt, tz);
      const createdDay = openedDay && openedDay > productDay ? openedDay : productDay;
      const availableFrom = firstSaleDay < createdDay ? firstSaleDay : createdDay;
      const startDay = availableFrom > windowStartDay ? availableFrom : windowStartDay;
      const historyDays = Math.min(HISTORY_DAYS, Math.max(1, daysBetween(startDay, today)));
      const forecast = forecastFromHistory(
        {
          stock: row.stock,
          recent: row.recent,
          previous: row.previous,
          total: row.total,
          saleDays: row.saleDays,
          historyDays,
        },
        horizonDays,
      );
      return {
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        unit: row.unit,
        costPrice: row.costPrice,
        stock: row.stock,
        ...forecast,
      };
    })
    .sort(
      (a, b) =>
        (a.daysToStockout ?? Infinity) - (b.daysToStockout ?? Infinity) ||
        b.dailyDemand - a.dailyDemand ||
        a.name.localeCompare(b.name),
    );
}
