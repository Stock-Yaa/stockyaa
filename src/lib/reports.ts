import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  batches,
  categories,
  customers,
  expenseCategories,
  expenses,
  products,
  purchases,
  saleItems,
  sales,
} from "@/db/schema";
import { addDays, zonedRange } from "./dates";
import { inScope, type BranchScope } from "./branches";
import { notExpired } from "./stock";

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

type Range = { start: Date; end: Date };

const inRange = (scope: BranchScope, range: Range) =>
  and(
    inScope(sales, scope),
    gte(sales.createdAt, range.start),
    lt(sales.createdAt, range.end),
  );

/**
 * Totals for a period. Revenue counts completed sales only; `net` is revenue
 * without tax, `cogs` the batch cost of what was sold, `profit` = net - cogs.
 */
export async function getSalesSummary(db: DbOrTx, scope: BranchScope, range: Range) {
  const [[totals], [cost]] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*) filter (where ${sales.status} = 'completed')`.mapWith(Number),
        revenue: sql<number>`coalesce(sum(${sales.total}) filter (where ${sales.status} = 'completed'), 0)`.mapWith(Number),
        net: sql<number>`coalesce(sum(${sales.total} - ${sales.tax}) filter (where ${sales.status} = 'completed'), 0)`.mapWith(Number),
        tax: sql<number>`coalesce(sum(${sales.tax}) filter (where ${sales.status} = 'completed'), 0)`.mapWith(Number),
        // Named customers only; walk-in sales have no customer.
        customers: sql<number>`count(distinct ${sales.customerId}) filter (where ${sales.status} = 'completed')`.mapWith(Number),
        // Sales linked to a customer record; the rest are walk-ins.
        withCustomer: sql<number>`count(*) filter (where ${sales.status} = 'completed' and ${sales.customerId} is not null)`.mapWith(Number),
        discount: sql<number>`coalesce(sum(${sales.discount}) filter (where ${sales.status} = 'completed'), 0)`.mapWith(Number),
        refundedCount: sql<number>`count(*) filter (where ${sales.status} = 'refunded')`.mapWith(Number),
        refundedTotal: sql<number>`coalesce(sum(${sales.total}) filter (where ${sales.status} = 'refunded'), 0)`.mapWith(Number),
      })
      .from(sales)
      .where(inRange(scope, range)),
    db
      .select({
        cogs: sql<number>`coalesce(sum(${saleItems.quantity} * ${saleItems.costPrice}), 0)`.mapWith(Number),
        units: sql<number>`coalesce(sum(${saleItems.quantity}), 0)`.mapWith(Number),
        // Sales with at least one prescription-only product.
        prescription: sql<number>`count(distinct ${sales.id}) filter (where ${products.requiresPrescription})`.mapWith(Number),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(and(inRange(scope, range), eq(sales.status, "completed"))),
  ]);
  return {
    ...totals,
    cogs: cost.cogs,
    units: cost.units,
    prescription: cost.prescription,
    profit: totals.net - cost.cogs,
    average: totals.count > 0 ? totals.revenue / totals.count : 0,
  };
}

/** One entry per calendar day from `from` to `to` (days without sales are zero). */
export async function getDailySales(
  db: DbOrTx,
  scope: BranchScope,
  from: string,
  to: string,
  timeZone: string,
): Promise<{ day: string; count: number; revenue: number }[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(${sales.createdAt} at time zone ${timeZone}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
    })
    .from(sales)
    .where(and(inRange(scope, zonedRange(from, to, timeZone)), eq(sales.status, "completed")))
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: { day: string; count: number; revenue: number }[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(byDay.get(day) ?? { day, count: 0, revenue: 0 });
  }
  return days;
}

/** Revenue and number of completed sales in a period. */
export async function getRevenue(db: DbOrTx, scope: BranchScope, range: Range) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
    })
    .from(sales)
    .where(and(inRange(scope, range), eq(sales.status, "completed")));
  return row;
}

/** One entry per clock hour (0-23) in `timeZone`; hours without sales are zero. */
export async function getHourlySales(
  db: DbOrTx,
  scope: BranchScope,
  range: Range,
  timeZone: string,
): Promise<{ hour: number; count: number; revenue: number }[]> {
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${sales.createdAt} at time zone ${timeZone})::int`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
    })
    .from(sales)
    .where(and(inRange(scope, range), eq(sales.status, "completed")))
    .groupBy(sql`1`);
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, count: 0, revenue: 0 });
}

/** Best sellers by revenue for a period (completed sales only). */
export async function getTopProducts(
  db: DbOrTx,
  scope: BranchScope,
  range: Range,
  limit: number,
) {
  return db
    .select({
      productId: saleItems.productId,
      name: sql<string>`max(${saleItems.productName})`,
      quantity: sql<number>`sum(${saleItems.quantity})`.mapWith(Number),
      revenue: sql<number>`sum(${saleItems.total})`.mapWith(Number),
      profit: sql<number>`sum(${saleItems.total} - ${saleItems.quantity} * ${saleItems.costPrice})`.mapWith(Number),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(inRange(scope, range), eq(sales.status, "completed")))
    .groupBy(saleItems.productId)
    .orderBy(sql`4 desc`)
    .limit(limit);
}

/** Line-item revenue of a period grouped by product category, largest first. */
export async function getSalesByCategory(db: DbOrTx, scope: BranchScope, range: Range) {
  return db
    .select({
      category: categories.name,
      revenue: sql<number>`coalesce(sum(${saleItems.total}), 0)`.mapWith(Number),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(inRange(scope, range), eq(sales.status, "completed")))
    .groupBy(categories.name)
    .orderBy(sql`2 desc`);
}

export async function getPaymentBreakdown(db: DbOrTx, scope: BranchScope, range: Range) {
  return db
    .select({
      method: sales.paymentMethod,
      count: sql<number>`count(*)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
    })
    .from(sales)
    .where(and(inRange(scope, range), eq(sales.status, "completed")))
    .groupBy(sales.paymentMethod)
    .orderBy(sql`3 desc`);
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * Active products whose sellable stock (in the scope's branch, or summed over
 * all branches) is at or below their reorder level.
 */
export async function getLowStockProducts(
  db: DbOrTx,
  scope: BranchScope,
  today: string,
  limit?: number,
) {
  const stock = db
    .select({
      productId: batches.productId,
      qty: sql<number>`sum(${batches.quantity})`.mapWith(Number).as("qty"),
    })
    .from(batches)
    .where(and(inScope(batches, scope), gt(batches.quantity, 0), notExpired(today)))
    .groupBy(batches.productId)
    .as("stock");

  const query = db
    .select({
      id: products.id,
      name: products.name,
      genericName: products.genericName,
      strength: products.strength,
      dosageForm: products.dosageForm,
      unit: products.unit,
      reorderLevel: products.reorderLevel,
      quantity: sql<number>`coalesce(${stock.qty}, 0)`.mapWith(Number),
    })
    .from(products)
    .leftJoin(stock, eq(stock.productId, products.id))
    .where(
      and(
        eq(products.pharmacyId, scope.pharmacyId),
        eq(products.isActive, true),
        sql`coalesce(${stock.qty}, 0) <= ${products.reorderLevel}`,
      ),
    )
    .orderBy(sql`coalesce(${stock.qty}, 0) asc`, asc(products.name));
  return limit ? query.limit(limit) : query;
}

/**
 * Batches with stock whose expiry date falls between `fromDay` and `toDay`
 * inclusive, soonest first. Pass a `fromDay` in the past to include expired ones.
 */
export async function getBatchesExpiringBetween(
  db: DbOrTx,
  scope: BranchScope,
  fromDay: string | null,
  toDay: string,
  limit?: number,
) {
  const query = db
    .select({
      id: batches.id,
      productId: batches.productId,
      productName: products.name,
      strength: products.strength,
      dosageForm: products.dosageForm,
      unit: products.unit,
      batchNumber: batches.batchNumber,
      expiryDate: batches.expiryDate,
      quantity: batches.quantity,
      costPrice: batches.costPrice,
    })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(
      and(
        inScope(batches, scope),
        gt(batches.quantity, 0),
        fromDay ? gte(batches.expiryDate, fromDay) : undefined,
        lte(batches.expiryDate, toDay),
      ),
    )
    .orderBy(asc(batches.expiryDate), asc(products.name));
  return limit ? query.limit(limit) : query;
}

/** Counts and value of the stock on hand. */
export async function getStockSummary(
  db: DbOrTx,
  scope: BranchScope,
  today: string,
  expiryAlertDays: number,
) {
  const soon = addDays(today, expiryAlertDays);
  const [row] = await db
    .select({
      value: sql<number>`coalesce(sum(${batches.quantity} * ${batches.costPrice}) filter (where ${batches.expiryDate} is null or ${batches.expiryDate} >= ${today}), 0)`.mapWith(Number),
      units: sql<number>`coalesce(sum(${batches.quantity}) filter (where ${batches.expiryDate} is null or ${batches.expiryDate} >= ${today}), 0)`.mapWith(Number),
      expiringSoon: sql<number>`count(*) filter (where ${batches.expiryDate} >= ${today} and ${batches.expiryDate} <= ${soon})`.mapWith(Number),
      expired: sql<number>`count(*) filter (where ${batches.expiryDate} < ${today})`.mapWith(Number),
      expiredValue: sql<number>`coalesce(sum(${batches.quantity} * ${batches.costPrice}) filter (where ${batches.expiryDate} < ${today}), 0)`.mapWith(Number),
      // What the sellable stock would fetch at today's sale prices.
      retailValue: sql<number>`coalesce(sum(${batches.quantity} * ${products.salePrice}) filter (where ${batches.expiryDate} is null or ${batches.expiryDate} >= ${today}), 0)`.mapWith(Number),
    })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(and(inScope(batches, scope), gt(batches.quantity, 0)));
  return row;
}

/** Most recent sales with the customer, cashier and line items, newest first. */
export async function getRecentSales(db: DbOrTx, scope: BranchScope, limit: number) {
  return db.query.sales.findMany({
    where: inScope(sales, scope),
    orderBy: desc(sales.createdAt),
    limit,
    with: {
      customer: { columns: { name: true } },
      user: { columns: { name: true } },
      items: { columns: { id: true, productName: true, quantity: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

/** All customers, and how many were added from `since` on. */
export async function getCustomerCounts(db: DbOrTx, pharmacyId: string, since: Date) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      added: sql<number>`count(*) filter (where ${gte(customers.createdAt, since)})`.mapWith(Number),
    })
    .from(customers)
    .where(eq(customers.pharmacyId, pharmacyId));
  return row;
}

/**
 * Every customer who has bought something, with their completed sales:
 * count, total spent, first and last purchase, and how many sales fall from
 * `recentSince` on. Highest spenders first; refunded sales are left out.
 */
export async function getCustomerSpending(db: DbOrTx, scope: BranchScope, recentSince: Date) {
  const spent = sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number);
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      orders: sql<number>`count(*)`.mapWith(Number),
      spent,
      recentOrders: sql<number>`count(*) filter (where ${gte(sales.createdAt, recentSince)})`.mapWith(Number),
      firstAt: sql<Date>`min(${sales.createdAt})`.mapWith(sales.createdAt),
      lastAt: sql<Date>`max(${sales.createdAt})`.mapWith(sales.createdAt),
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        inScope(sales, scope),
        eq(customers.pharmacyId, scope.pharmacyId),
        eq(sales.status, "completed"),
      ),
    )
    .groupBy(customers.id)
    .orderBy(desc(spent), asc(customers.name));
}

/**
 * Expenses dated from `from` to `to` (calendar days, inclusive). With a branch
 * in the scope: that branch's expenses plus, when `wholeBusiness`, those not
 * tied to any branch. Without one: all of them.
 */
function expensesIn(scope: BranchScope, from: string, to: string, wholeBusiness: boolean) {
  const branch = scope.branchId ? eq(expenses.branchId, scope.branchId) : undefined;
  return and(
    eq(expenses.pharmacyId, scope.pharmacyId),
    branch && wholeBusiness ? or(branch, isNull(expenses.branchId)) : branch,
    gte(expenses.expenseDate, from),
    lte(expenses.expenseDate, to),
  );
}

/** Total and count of the expenses of a period (see `expensesIn`). */
export async function getExpenseTotal(
  db: DbOrTx,
  scope: BranchScope,
  from: string,
  to: string,
  wholeBusiness: boolean,
) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number),
    })
    .from(expenses)
    .where(expensesIn(scope, from, to, wholeBusiness));
  return row;
}

/** Expenses of a period per expense category, largest first (see `expensesIn`). */
export async function getExpensesByCategory(
  db: DbOrTx,
  scope: BranchScope,
  from: string,
  to: string,
  wholeBusiness: boolean,
) {
  return db
    .select({
      category: expenseCategories.name,
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number),
    })
    .from(expenses)
    .innerJoin(
      expenseCategories,
      and(
        eq(expenseCategories.id, expenses.categoryId),
        eq(expenseCategories.pharmacyId, scope.pharmacyId),
      ),
    )
    .where(expensesIn(scope, from, to, wholeBusiness))
    .groupBy(expenseCategories.name)
    .orderBy(sql`3 desc`);
}

/** Purchase orders that are ordered but not yet received, and their value. */
export async function getOpenPurchases(db: DbOrTx, scope: BranchScope) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      value: sql<number>`coalesce(sum(${purchases.total}), 0)`.mapWith(Number),
    })
    .from(purchases)
    .where(and(inScope(purchases, scope), eq(purchases.status, "ordered")));
  return row;
}

/** Products that are not archived. */
export async function countActiveProducts(db: DbOrTx, pharmacyId: string) {
  return db.$count(
    products,
    and(eq(products.pharmacyId, pharmacyId), eq(products.isActive, true)),
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/**
 * Completed sales of a period per branch: revenue, count and gross profit
 * (revenue without tax minus the batch cost of what was sold).
 */
export async function getSalesByBranch(db: DbOrTx, pharmacyId: string, range: Range) {
  const scope = { pharmacyId, branchId: null };
  const [totals, costs] = await Promise.all([
    db
      .select({
        branchId: sales.branchId,
        count: sql<number>`count(*)`.mapWith(Number),
        revenue: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
        net: sql<number>`coalesce(sum(${sales.total} - ${sales.tax}), 0)`.mapWith(Number),
      })
      .from(sales)
      .where(and(inRange(scope, range), eq(sales.status, "completed")))
      .groupBy(sales.branchId),
    db
      .select({
        branchId: sales.branchId,
        cogs: sql<number>`coalesce(sum(${saleItems.quantity} * ${saleItems.costPrice}), 0)`.mapWith(Number),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(inRange(scope, range), eq(sales.status, "completed")))
      .groupBy(sales.branchId),
  ]);
  const cogsBy = new Map(costs.map((row) => [row.branchId, row.cogs]));
  return new Map(
    totals.map((row) => [
      row.branchId,
      { count: row.count, revenue: row.revenue, profit: row.net - (cogsBy.get(row.branchId) ?? 0) },
    ]),
  );
}

/** Sellable stock per branch: its value at cost and how many batches have expired. */
export async function getStockByBranch(db: DbOrTx, pharmacyId: string, today: string) {
  const rows = await db
    .select({
      branchId: batches.branchId,
      value: sql<number>`coalesce(sum(${batches.quantity} * ${batches.costPrice}) filter (where ${batches.expiryDate} is null or ${batches.expiryDate} >= ${today}), 0)`.mapWith(Number),
      expired: sql<number>`count(*) filter (where ${batches.expiryDate} < ${today})`.mapWith(Number),
    })
    .from(batches)
    .where(and(eq(batches.pharmacyId, pharmacyId), gt(batches.quantity, 0)))
    .groupBy(batches.branchId);
  return new Map(rows.map((row) => [row.branchId, { value: row.value, expired: row.expired }]));
}
