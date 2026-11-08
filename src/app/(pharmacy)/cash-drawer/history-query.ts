import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db";
import { cashDrawers, cashShifts, users, type Branch, type Pharmacy } from "@/db/schema";
import { branchScope, inScope } from "@/lib/branches";
import { addDays, zonedRange } from "@/lib/dates";

/*
 * The session history of a branch with its filters (month, drawer, staff),
 * shared by the History tab and its CSV export.
 */

export type HistoryFilters = { month: string | null; drawerId: string | null; staffId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseHistoryFilters(params: {
  month?: string;
  drawer?: string;
  staff?: string;
}): HistoryFilters {
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  return {
    month,
    drawerId: params.drawer && UUID.test(params.drawer) ? params.drawer : null,
    staffId: params.staff && UUID.test(params.staff) ? params.staff : null,
  };
}

/** First and last calendar day of a YYYY-MM month. */
export function monthDays(month: string): { first: string; last: string } {
  const [year, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(next, -1) };
}

/** The last `count` months up to the one containing `today`, newest first. */
export function recentMonths(today: string, count: number): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - i;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

export function historyWhere(
  branch: Pick<Branch, "id" | "pharmacyId">,
  pharmacy: Pick<Pharmacy, "timezone">,
  filters: HistoryFilters,
): SQL {
  const conditions: SQL[] = [inScope(cashShifts, branchScope(branch))];
  if (filters.month) {
    const { first, last } = monthDays(filters.month);
    const range = zonedRange(first, last, pharmacy.timezone);
    conditions.push(gte(cashShifts.openedAt, range.start), lt(cashShifts.openedAt, range.end));
  }
  if (filters.drawerId) conditions.push(eq(cashShifts.drawerId, filters.drawerId));
  if (filters.staffId) conditions.push(eq(cashShifts.openedBy, filters.staffId));
  return and(...conditions)!;
}

/** Latest decision on the session's closing difference, if it needed one. */
export const reviewStatusOf = sql<"pending" | "approved" | "rejected" | null>`(
  select r.status from cash_reviews r
  where r.shift_id = ${cashShifts.id} and r.kind = 'variance'
  order by r.created_at desc limit 1
)`;

export function historyRows(db: DbOrTx, where: SQL) {
  const opener = alias(users, "opener");
  const closer = alias(users, "closer");
  return db
    .select({
      id: cashShifts.id,
      openedAt: cashShifts.openedAt,
      closedAt: cashShifts.closedAt,
      drawerName: cashDrawers.name,
      openedBy: opener.name,
      closedBy: closer.name,
      openingBalance: cashShifts.openingBalance,
      cashSales: cashShifts.cashSales,
      expectedCash: cashShifts.expectedCash,
      countedCash: cashShifts.countedCash,
      difference: cashShifts.difference,
      note: cashShifts.note,
      reviewStatus: reviewStatusOf,
    })
    .from(cashShifts)
    .innerJoin(cashDrawers, eq(cashDrawers.id, cashShifts.drawerId))
    .leftJoin(opener, eq(opener.id, cashShifts.openedBy))
    .leftJoin(closer, eq(closer.id, cashShifts.closedBy))
    .where(where)
    .orderBy(desc(cashShifts.openedAt));
}

export type HistoryRow = Awaited<ReturnType<typeof historyRows>>[number];

export type SessionStatus = "open" | "review" | "rejected" | "closed";

export function sessionStatus(row: Pick<HistoryRow, "closedAt" | "reviewStatus">): SessionStatus {
  if (!row.closedAt) return "open";
  if (row.reviewStatus === "pending") return "review";
  if (row.reviewStatus === "rejected") return "rejected";
  return "closed";
}
