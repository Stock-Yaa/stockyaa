import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { DbOrTx } from "@/db";
import {
  cashDrawers,
  cashMovements,
  cashReviews,
  cashShifts,
  notifications,
  sales,
  users,
  type Branch,
  type CashDrawer,
  type CashMovementType,
  type CashReviewKind,
  type CashShift,
} from "@/db/schema";
import { round2 } from "./utils";

/*
 * Cash drawers and their sessions. A branch has one or more drawers; each
 * device (till) remembers which drawer it works with in a cookie. Sales and
 * refunds point at the session of the drawer that took or paid the cash.
 */

/** The drawer this device works with (falls back to the branch's first). */
export const DRAWER_COOKIE = "stockyaa_drawer";

export async function readDeviceDrawerId(): Promise<string | null> {
  return (await cookies()).get(DRAWER_COOKIE)?.value ?? null;
}

export async function rememberDeviceDrawer(drawerId: string) {
  (await cookies()).set(DRAWER_COOKIE, drawerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * The branch's drawers, oldest first. A branch that has none yet gets one
 * named `defaultName`, so every branch can take cash straight away.
 */
export async function listDrawers(
  db: DbOrTx,
  branch: Pick<Branch, "id" | "pharmacyId">,
  defaultName: string,
): Promise<CashDrawer[]> {
  const load = () =>
    db
      .select()
      .from(cashDrawers)
      .where(and(eq(cashDrawers.pharmacyId, branch.pharmacyId), eq(cashDrawers.branchId, branch.id)))
      .orderBy(asc(cashDrawers.createdAt), asc(cashDrawers.name));
  const rows = await load();
  if (rows.length > 0) return rows;
  await db
    .insert(cashDrawers)
    .values({ pharmacyId: branch.pharmacyId, branchId: branch.id, name: defaultName })
    .onConflictDoNothing();
  return load();
}

/** One drawer of the branch, or null (another branch's drawer is "not found"). */
export async function findDrawer(
  db: DbOrTx,
  branch: Pick<Branch, "id" | "pharmacyId">,
  drawerId: string,
) {
  const [drawer] = await db
    .select()
    .from(cashDrawers)
    .where(
      and(
        eq(cashDrawers.id, drawerId),
        eq(cashDrawers.pharmacyId, branch.pharmacyId),
        eq(cashDrawers.branchId, branch.id),
      ),
    )
    .limit(1);
  return drawer ?? null;
}

/** The drawer's open session, if there is one. */
export async function getOpenShift(db: DbOrTx, drawer: Pick<CashDrawer, "id" | "pharmacyId">) {
  const [shift] = await db
    .select()
    .from(cashShifts)
    .where(
      and(
        eq(cashShifts.pharmacyId, drawer.pharmacyId),
        eq(cashShifts.drawerId, drawer.id),
        isNull(cashShifts.closedAt),
      ),
    )
    .limit(1);
  return shift ?? null;
}

/** The drawer's last closed session: what it left in the drawer, and who closed it. */
export async function getPreviousShift(db: DbOrTx, drawer: Pick<CashDrawer, "id" | "pharmacyId">) {
  const [row] = await db
    .select({
      id: cashShifts.id,
      closedAt: cashShifts.closedAt,
      leftInDrawer: cashShifts.leftInDrawer,
      closedByName: users.name,
    })
    .from(cashShifts)
    .leftJoin(users, eq(users.id, cashShifts.closedBy))
    .where(
      and(
        eq(cashShifts.pharmacyId, drawer.pharmacyId),
        eq(cashShifts.drawerId, drawer.id),
        sql`${cashShifts.closedAt} is not null`,
      ),
    )
    .orderBy(desc(cashShifts.closedAt))
    .limit(1);
  if (!row) return null;
  const [review] = await db
    .select({ status: cashReviews.status })
    .from(cashReviews)
    .where(and(eq(cashReviews.shiftId, row.id), eq(cashReviews.kind, "variance")))
    .orderBy(desc(cashReviews.createdAt))
    .limit(1);
  return { ...row, reviewStatus: review?.status ?? null };
}

/** True while a serious closing difference of the drawer waits for a manager. */
export async function drawerBlocked(db: DbOrTx, drawer: Pick<CashDrawer, "id" | "pharmacyId">) {
  const blocking = await db.$count(
    cashReviews,
    and(
      eq(cashReviews.pharmacyId, drawer.pharmacyId),
      eq(cashReviews.drawerId, drawer.id),
      eq(cashReviews.status, "pending"),
      eq(cashReviews.blocking, true),
    ),
  );
  return blocking > 0;
}

export type DrawerState = {
  drawers: CashDrawer[];
  /** The drawer this device works with; null when the branch has no active drawer. */
  drawer: CashDrawer | null;
  shift: CashShift | null;
  ownerName: string | null;
  blocked: boolean;
};

/** The device's drawer in this branch and its open session. */
export async function getDrawerState(
  db: DbOrTx,
  branch: Pick<Branch, "id" | "pharmacyId">,
  defaultName: string,
): Promise<DrawerState> {
  const [all, chosen] = await Promise.all([
    listDrawers(db, branch, defaultName),
    readDeviceDrawerId(),
  ]);
  const drawers = all.filter((d) => d.isActive);
  const drawer = drawers.find((d) => d.id === chosen) ?? drawers[0] ?? null;
  if (!drawer) return { drawers, drawer: null, shift: null, ownerName: null, blocked: false };
  const [shift, blocked] = await Promise.all([getOpenShift(db, drawer), drawerBlocked(db, drawer)]);
  let ownerName: string | null = null;
  if (shift?.openedBy) {
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, shift.openedBy), eq(users.pharmacyId, branch.pharmacyId)));
    ownerName = owner?.name ?? null;
  }
  return { drawers, drawer, shift, ownerName, blocked };
}

/**
 * An open session of the branch that may take cash now: not another
 * branch's, not closed, and not being counted for closing. Locks it against
 * closing (FOR SHARE) until the caller's transaction ends.
 */
export async function lockShiftForCash(
  tx: DbOrTx,
  branch: Pick<Branch, "id" | "pharmacyId">,
  shiftId: string,
): Promise<CashShift | null> {
  const [shift] = await tx
    .select()
    .from(cashShifts)
    .where(
      and(
        eq(cashShifts.id, shiftId),
        eq(cashShifts.pharmacyId, branch.pharmacyId),
        eq(cashShifts.branchId, branch.id),
        isNull(cashShifts.closedAt),
      ),
    )
    .for("share");
  if (!shift || shift.countAttempts.length > 0) return null;
  return shift;
}

/** A shift; the sales and movements it counts are those pointing at it. */
type ShiftRef = { id: string; pharmacyId: string; openingBalance: number; openedAt: Date };

export type ShiftTotals = {
  cashSales: number;
  cashSalesCount: number;
  cashRefunds: number;
  cashRefundsCount: number;
  cardSales: number;
  transferSales: number;
  /** Sales of every payment method rung up in the session. */
  salesCount: number;
  payIns: number;
  payOuts: number;
  expenses: number;
  drops: number;
  movementsCount: number;
  /** What should be in the drawer now. */
  expectedCash: number;
};

const salesOf = (shift: ShiftRef) =>
  and(eq(sales.pharmacyId, shift.pharmacyId), eq(sales.shiftId, shift.id));
const refundsOf = (shift: ShiftRef) =>
  and(
    eq(sales.pharmacyId, shift.pharmacyId),
    eq(sales.refundShiftId, shift.id),
    eq(sales.paymentMethod, "cash"),
  );
// Movements have no branch of their own: they belong to it through their shift.
const movementsOf = (shift: ShiftRef) =>
  and(eq(cashMovements.pharmacyId, shift.pharmacyId), eq(cashMovements.shiftId, shift.id));

const sumWhere = (column: typeof sales.total, condition: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(${column}) filter (where ${condition}), 0)`.mapWith(Number);
const movementSum = (type: CashMovementType) =>
  sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.type} = ${type}), 0)`.mapWith(
    Number,
  );

/**
 * Cash that went through the drawer in the session: every cash sale rung up
 * in it counts as money in, even if refunded later; a cash refund counts as
 * money out of the session that paid it.
 */
export async function getShiftTotals(db: DbOrTx, shift: ShiftRef): Promise<ShiftTotals> {
  const [[sold], [refunded], [moved]] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        cashCount: sql<number>`count(*) filter (where ${sales.paymentMethod} = 'cash')`.mapWith(Number),
        cash: sumWhere(sales.total, sql`${sales.paymentMethod} = 'cash'`),
        card: sumWhere(sales.total, sql`${sales.paymentMethod} = 'card'`),
        transfer: sumWhere(sales.total, sql`${sales.paymentMethod} = 'transfer'`),
      })
      .from(sales)
      .where(salesOf(shift)),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${sales.total}), 0)`.mapWith(Number),
      })
      .from(sales)
      .where(refundsOf(shift)),
    db
      .select({
        count: sql<number>`count(*) filter (where ${cashMovements.type} <> 'no_sale')`.mapWith(Number),
        payIns: movementSum("in"),
        payOuts: movementSum("out"),
        expenses: movementSum("expense"),
        drops: movementSum("drop"),
      })
      .from(cashMovements)
      .where(movementsOf(shift)),
  ]);

  return {
    cashSales: sold.cash,
    cashSalesCount: sold.cashCount,
    cashRefunds: refunded.total,
    cashRefundsCount: refunded.count,
    cardSales: sold.card,
    transferSales: sold.transfer,
    salesCount: sold.count,
    payIns: moved.payIns,
    payOuts: moved.payOuts,
    expenses: moved.expenses,
    drops: moved.drops,
    movementsCount: moved.count,
    expectedCash: round2(
      shift.openingBalance +
        sold.cash -
        refunded.total +
        moved.payIns -
        moved.payOuts -
        moved.expenses -
        moved.drops,
    ),
  };
}

export type ShiftActivity = {
  key: string;
  kind: "sale" | "refund" | CashMovementType;
  /** Signed: positive puts cash in the drawer, negative takes it out. */
  amount: number;
  at: Date;
  /** Invoice number for sales and refunds, the reason for the rest. */
  label: string;
  category: string | null;
  bagNumber: string | null;
  saleId: string | null;
  movementId: string | null;
  hasReceipt: boolean;
  userName: string | null;
};

/** Everything that moved cash in this session (and no-sale openings), newest first. */
export async function getShiftActivity(
  db: DbOrTx,
  shift: ShiftRef,
  limit: number,
): Promise<ShiftActivity[]> {
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
      .where(and(salesOf(shift), eq(sales.paymentMethod, "cash")))
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
      .where(refundsOf(shift))
      .orderBy(desc(sales.refundedAt))
      .limit(limit),
    db
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        amount: cashMovements.amount,
        reason: cashMovements.reason,
        category: cashMovements.category,
        bagNumber: cashMovements.bagNumber,
        receiptPath: cashMovements.receiptPath,
        at: cashMovements.createdAt,
        userName: users.name,
      })
      .from(cashMovements)
      .leftJoin(users, eq(users.id, cashMovements.userId))
      .where(movementsOf(shift))
      .orderBy(desc(cashMovements.createdAt))
      .limit(limit),
  ]);

  const base = { category: null, bagNumber: null, movementId: null, hasReceipt: false };
  const rows: ShiftActivity[] = [
    ...sold.map((s) => ({
      ...base,
      key: `sale-${s.id}`,
      kind: "sale" as const,
      amount: s.total,
      at: s.at,
      label: s.invoiceNumber,
      saleId: s.id,
      userName: s.userName,
    })),
    ...refunded.map((s) => ({
      ...base,
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
      category: m.category,
      bagNumber: m.bagNumber,
      saleId: null,
      movementId: m.id,
      hasReceipt: m.receiptPath !== null,
      userName: m.userName,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/**
 * Puts an item in the manager's review queue and tells the admins through a
 * notification (only admins see cash notifications).
 */
export async function createCashReview(
  tx: DbOrTx,
  review: {
    pharmacyId: string;
    branchId: string;
    drawerId: string;
    drawerName: string;
    shiftId: string;
    movementId?: string | null;
    kind: CashReviewKind;
    amount: number;
    blocking?: boolean;
    userId: string | null;
    userName: string;
  },
): Promise<void> {
  const [created] = await tx
    .insert(cashReviews)
    .values({
      pharmacyId: review.pharmacyId,
      branchId: review.branchId,
      drawerId: review.drawerId,
      shiftId: review.shiftId,
      movementId: review.movementId ?? null,
      kind: review.kind,
      amount: round2(review.amount),
      blocking: review.blocking ?? false,
      userId: review.userId,
    })
    .returning({ id: cashReviews.id });
  await tx
    .insert(notifications)
    .values({
      pharmacyId: review.pharmacyId,
      branchId: review.branchId,
      type: "cash_review",
      key: `cash_review:${created.id}`,
      data: {
        kind: review.kind,
        drawer: review.drawerName,
        staff: review.userName,
        amount: round2(review.amount),
        blocking: review.blocking ? 1 : 0,
      },
    })
    .onConflictDoNothing({ target: [notifications.pharmacyId, notifications.key] });
}
