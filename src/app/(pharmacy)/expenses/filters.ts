import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { expenses, type Branch, type User } from "@/db/schema";
import { canSwitchBranch } from "@/lib/active-branch";
import { addDays, parseDay } from "@/lib/dates";

/**
 * Which expenses a user sees: those of the current branch and, for admins,
 * the whole-business ones (branchId null, e.g. head-office rent). Staff only
 * see their own branch's.
 */
export type ExpenseScope = { pharmacyId: string; branchId: string; wholeBusiness: boolean };

export const expenseScope = (
  user: Pick<User, "role">,
  branch: Pick<Branch, "id" | "pharmacyId">,
): ExpenseScope => ({
  pharmacyId: branch.pharmacyId,
  branchId: branch.id,
  wholeBusiness: canSwitchBranch(user),
});

/** SQL condition: the expense is visible in `scope` (used for reads, edits and deletes). */
export function visibleExpenses(scope: ExpenseScope) {
  const branch = eq(expenses.branchId, scope.branchId);
  return and(
    eq(expenses.pharmacyId, scope.pharmacyId),
    scope.wholeBusiness ? or(branch, isNull(expenses.branchId)) : branch,
  );
}

// Without a `from` parameter the list starts this many days before today.
const DEFAULT_DAYS = 30;

export type ExpenseFilters = {
  /** Calendar days, both inclusive. */
  from: string;
  to: string;
  categoryId: string | null;
};

/**
 * Filters from the `from`, `to` and `category` query parameters. The period
 * defaults to the last 30 days up to today; a reversed period is swapped.
 */
export function resolveExpenseFilters(
  params: { from?: string; to?: string; category?: string },
  today: string,
): ExpenseFilters {
  let to = parseDay(params.to) ?? today;
  let from = parseDay(params.from) ?? addDays(to, -DEFAULT_DAYS);
  if (from > to) [from, to] = [to, from];
  const category = z.uuid().safeParse(params.category);
  return { from, to, categoryId: category.success ? category.data : null };
}

/** WHERE clause for the expenses visible in `scope` that match the filters. */
export function expenseWhere(scope: ExpenseScope, filters: ExpenseFilters) {
  return and(
    visibleExpenses(scope),
    gte(expenses.expenseDate, filters.from),
    lte(expenses.expenseDate, filters.to),
    filters.categoryId ? eq(expenses.categoryId, filters.categoryId) : undefined,
  );
}
