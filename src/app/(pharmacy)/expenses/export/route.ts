import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseCategories, expenses, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { csvResponse, type CsvCell } from "@/lib/csv";
import { todayInTimezone } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx";
import { expenseScope, expenseWhere, resolveExpenseFilters } from "../filters";

/** The filtered expense list as CSV, or as an Excel workbook with `?format=xlsx`. */
export async function GET(request: Request) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, db] = await Promise.all([getT(), getDb()]);
  const url = new URL(request.url);
  const filters = resolveExpenseFilters(
    {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    },
    todayInTimezone(pharmacy.timezone),
  );

  const rows = await db
    .select({
      expenseDate: expenses.expenseDate,
      branchId: expenses.branchId,
      category: expenseCategories.name,
      description: expenses.description,
      amount: expenses.amount,
      recordedBy: users.name,
    })
    .from(expenses)
    .innerJoin(
      expenseCategories,
      and(
        eq(expenseCategories.id, expenses.categoryId),
        eq(expenseCategories.pharmacyId, pharmacy.id),
      ),
    )
    .leftJoin(users, eq(users.id, expenses.userId))
    // The same rows as the list: this branch's, plus whole-business ones for admins.
    .where(expenseWhere(expenseScope(user, branch), filters))
    .orderBy(asc(expenses.expenseDate), asc(expenses.createdAt));

  // With several branches a Branch column tells whole-business rows apart.
  const multiBranch = branches.length > 1;
  const table: CsvCell[][] = [
    [
      t("expenses.date"),
      ...(multiBranch ? [t("expenses.branch")] : []),
      t("expenses.category"),
      t("expenses.details"),
      t("expenses.amount"),
      t("expenses.recordedBy"),
    ],
    ...rows.map((r): CsvCell[] => [
      r.expenseDate,
      ...(multiBranch ? [r.branchId ? branch.name : t("expenses.wholeBusiness")] : []),
      r.category,
      r.description,
      r.amount,
      r.recordedBy,
    ]),
  ];
  const filename = `expenses-${filters.from}-to-${filters.to}`;

  if (url.searchParams.get("format") === "xlsx") {
    return xlsxResponse(`${filename}.xlsx`, table, {
      sheetName: t("expenses.sheetName"),
      moneyColumns: [multiBranch ? 4 : 3],
    });
  }
  return csvResponse(`${filename}.csv`, table);
}
