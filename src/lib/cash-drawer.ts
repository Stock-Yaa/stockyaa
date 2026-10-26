import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { cashMovements, cashShifts, sales, users, type Branch } from "@/db/schema";
import { branchScope, inScope } from "./branches";
import { round2 } from "./utils";

/** The branch's open cash drawer shift, if there is one (each branch has its own drawer). */
export async function getOpenShift(db: DbOrTx, branch: Pick<Branch, "id" | "pharmacyId">) {
  const [shift] = await db
    .select()
    .from(cashShifts)
    .where(and(inScope(cashShifts, branchScope(branch)), isNull(cashShifts.closedAt)))
    .orderBy(desc(cashShifts.openedAt))
    .limit(1);
  return shift ?? null;
}

/** A shift; the sales and refunds it counts are those of its own branch. */
type ShiftRef = {
  id: string;
  pharmacyId: string;
  branchId: string;
  openedAt: Date;
  openingBalance: number;
};

export type ShiftTotals = {
  cashSales: number;
  cashSalesCount: number;
  cashRefunds: number;
  cashRefundsCount: number;
  payIns: number;
  payOuts: number;
  expenses: number;
  movementsCount: number;
  /** What should be in the drawer now. */
  expectedCash: number;
};

// Cash sales of the shift's branch; a refund of one is cash leaving the drawer.
const cashSalesOf = (shift: ShiftRef) =>
  and(
    inScope(sales, { pharmacyId: shift.pharmacyId, branchId: shift.branchId }),
    eq(sales.paymentMethod, "cash"),
  );
// Movements have no branch of their own: they belong to it through their shift.
const movementsOf = (shift: ShiftRef) =>
  and(eq(cashMovements.pharmacyId, shift.pharmacyId), eq(cashMovements.shiftId, shift.id));
const refundedSince = (from: Date) =>
  and(eq(sales.status, "refunded"), gte(sales.refundedAt, from));

/**
 * Cash that went through the drawer since the shift opened. Every cash sale
 * of the shift's branch counts as money in when it was made; a refund of a
 * cash sale counts as money out when it was refunded, even if the sale was in
 * an earlier shift.
 */
export async function getShiftTotals(db: DbOrTx, shift: ShiftRef): Promise<ShiftTotals> {
  const cash = cashSalesOf(shift);
  const [[sold], [refunded], [moved]] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
      })
      .from(sales)
      .where(and(cash, gte(sales.createdAt, shift.openedAt))),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
      })
      .from(sales)
      .where(and(cash, refundedSince(shift.openedAt))),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        payIns: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.type} = 'in'), 0)`.mapWith(Number),
        payOuts: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.type} = 'out'), 0)`.mapWith(Number),
        expenses: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.type} = 'expense'), 0)`.mapWith(Number),
      })
      .from(cashMovements)
      .where(movementsOf(shift)),
  ]);

  return {
    cashSales: sold.total,
    cashSalesCount: sold.count,
    cashRefunds: refunded.total,
    cashRefundsCount: refunded.count,
    payIns: moved.payIns,
    payOuts: moved.payOuts,
    expenses: moved.expenses,
    movementsCount: moved.count,
    expectedCash: round2(
      shift.openingBalance +
        sold.total -
        refunded.total +
        moved.payIns -
        moved.payOuts -
        moved.expenses,
    ),
  };
}

export type ShiftActivity = {
  key: string;
  kind: "sale" | "refund" | "in" | "out" | "expense";
  /** Signed: positive puts cash in the drawer, negative takes it out. */
  amount: number;
  at: Date;
  /** Invoice number for sales and refunds, the reason for the rest. */
  label: string;
  saleId: string | null;
  userName: string | null;
};

/** Everything that moved cash in this shift, newest first. */
export async function getShiftActivity(
  db: DbOrTx,
  shift: ShiftRef,
  limit: number,
): Promise<ShiftActivity[]> {
  const cash = cashSalesOf(shift);
  const [sold, refunded, moved] = await Promise.all([
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        total: sales.total,
        at: sales.createdAt,
        userName: users.name,
      })
      .from(sales)
      .leftJoin(users, eq(users.id, sales.userId))
      .where(and(cash, gte(sales.createdAt, shift.openedAt)))
      .orderBy(desc(sales.createdAt))
      .limit(limit),
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        total: sales.total,
        at: sales.refundedAt,
      })
      .from(sales)
      .where(and(cash, refundedSince(shift.openedAt)))
      .orderBy(desc(sales.refundedAt))
      .limit(limit),
    db
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        amount: cashMovements.amount,
        reason: cashMovements.reason,
        at: cashMovements.createdAt,
        userName: users.name,
      })
      .from(cashMovements)
      .leftJoin(users, eq(users.id, cashMovements.userId))
      .where(movementsOf(shift))
      .orderBy(desc(cashMovements.createdAt))
      .limit(limit),
  ]);

  const rows: ShiftActivity[] = [
    ...sold.map((s) => ({
      key: `sale-${s.id}`,
      kind: "sale" as const,
      amount: s.total,
      at: s.at,
      label: s.invoiceNumber,
      saleId: s.id,
      userName: s.userName,
    })),
    ...refunded.map((s) => ({
      key: `refund-${s.id}`,
      kind: "refund" as const,
      amount: -s.total,
      // Never null here: the query only returns refunded sales.
      at: s.at ?? shift.openedAt,
      label: s.invoiceNumber,
      saleId: s.id,
      userName: null,
    })),
    ...moved.map((m) => ({
      key: `move-${m.id}`,
      kind: m.type,
      amount: m.type === "in" ? m.amount : -m.amount,
      at: m.at,
      label: m.reason,
      saleId: null,
      userName: m.userName,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
