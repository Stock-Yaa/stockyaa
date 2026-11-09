import { asc, count, desc, eq, sql } from "drizzle-orm";
import { Banknote, FileSpreadsheet, FileText, Filter, ReceiptText, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { DateFilter } from "@/components/ui/date-filter";
import { FilterSelect, Pagination } from "@/components/ui/list-controls";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { getDb } from "@/db";
import { cashMovements, expenseCategories, expenses, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import { pageTitle } from "@/lib/metadata";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { deleteExpense } from "./actions";
import { ExpenseCategoryManagerButton } from "./category-manager";
import { EXPENSE_COLOR_DOT } from "./colors";
import { ExpenseFormButton } from "./expense-form";
import { expenseScope, expenseWhere, resolveExpenseFilters } from "./filters";
import { PrintButton } from "./print-button";

export const generateMetadata = pageTitle("expenses.title");

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

const HEAD = "uppercase tracking-wider";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: Param; to?: Param; category?: Param; page?: Param }>;
}) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const t = await getT();
  const f = await getFormat(pharmacy);
  const params = await searchParams;
  const today = todayInTimezone(pharmacy.timezone);
  const filters = resolveExpenseFilters(
    { from: first(params.from), to: first(params.to), category: first(params.category) },
    today,
  );
  const page = parsePage(first(params.page));
  // The current branch's expenses, plus the whole-business ones for admins.
  const where = expenseWhere(expenseScope(user, branch), filters);
  // Whole-business rows are only worth labelling when there is more than one branch.
  const multiBranch = branches.length > 1;
  const db = await getDb();

  const [categories, byCategory, [{ total }], rows] = await Promise.all([
    db
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        color: expenseCategories.color,
        expenseCount: count(expenses.id),
      })
      .from(expenseCategories)
      .leftJoin(expenses, eq(expenses.categoryId, expenseCategories.id))
      .where(eq(expenseCategories.pharmacyId, pharmacy.id))
      .groupBy(expenseCategories.id)
      .orderBy(asc(expenseCategories.name)),
    db
      .select({
        categoryId: expenses.categoryId,
        amount: sql<number>`sum(${expenses.amount})`.mapWith(Number),
      })
      .from(expenses)
      .where(where)
      .groupBy(expenses.categoryId),
    db.select({ total: count() }).from(expenses).where(where),
    db
      .select({
        id: expenses.id,
        branchId: expenses.branchId,
        categoryId: expenses.categoryId,
        expenseDate: expenses.expenseDate,
        amount: expenses.amount,
        description: expenses.description,
        recordedBy: users.name,
        // Booked by a cash drawer pay-out: changed only through the drawer.
        fromDrawer: sql<boolean>`exists (select 1 from ${cashMovements} where ${cashMovements.expenseId} = ${expenses.id})`,
      })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.userId))
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const grandTotal = byCategory.reduce((sum, c) => sum + c.amount, 0);
  const categoryTotals = byCategory
    .flatMap((c) => {
      const category = categoryById.get(c.categoryId);
      return category ? [{ ...category, amount: c.amount }] : [];
    })
    .sort((a, b) => b.amount - a.amount);
  const selectedCategory = filters.categoryId ? categoryById.get(filters.categoryId) : undefined;

  const exportQuery = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.categoryId) exportQuery.set("category", filters.categoryId);
  const period = t("expenses.period", { from: f.day(filters.from), to: f.day(filters.to) });
  const formCategories = categories.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageHeader title={t("expenses.title")} description={t("expenses.description")}>
        <a
          href={`/expenses/export?format=xlsx&${exportQuery}`}
          className={buttonClass({
            variant: "outline",
            className: "border-success/40 text-success hover:bg-success/10",
          })}
        >
          <FileSpreadsheet />
          {t("expenses.excel")}
        </a>
        <a
          href={`/expenses/export?${exportQuery}`}
          className={buttonClass({
            variant: "outline",
            className: "border-info/40 text-info hover:bg-info/10",
          })}
        >
          <FileText />
          {t("expenses.csv")}
        </a>
        <PrintButton />
        <ExpenseCategoryManagerButton categories={categories} />
        <ExpenseFormButton categories={formCategories} today={today} />
      </PageHeader>

      {/* Heading on paper, where the page header and filters are hidden. */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-semibold">{t("expenses.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {pharmacy.name}
          {multiBranch && ` · ${branch.name}`} · {period}
          {selectedCategory && ` · ${selectedCategory.name}`}
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">
              <Banknote className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">{t("expenses.totalExpenses")}</p>
          </div>
          <p className="mt-3 truncate text-2xl font-semibold tabular-nums">
            {f.money(grandTotal)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("expenses.forSelectedPeriod")}</p>
        </Card>
        {categoryTotals.map((category) => (
          <Card key={category.id} className="p-5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", EXPENSE_COLOR_DOT[category.color])}
              />
              <p className="truncate text-sm text-muted-foreground">{category.name}</p>
            </div>
            <p className="mt-3 truncate text-2xl font-semibold tabular-nums">
              {f.money(category.amount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("expenses.percentOfTotal", {
                percent: f.number(
                  grandTotal > 0 ? Math.round((category.amount / grandTotal) * 1000) / 10 : 0,
                ),
              })}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 print:hidden">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="size-4" />
          {t("expenses.filters")}
        </p>
        <DateFilter
          param="from"
          label={t("expenses.dateFrom")}
          fallback={filters.from}
          max={filters.to}
        />
        <DateFilter
          param="to"
          label={t("expenses.dateTo")}
          fallback={filters.to}
          min={filters.from}
        />
        <FilterSelect
          param="category"
          aria-label={t("expenses.category")}
          options={[
            { value: "", label: t("expenses.allCategories") },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={t("expenses.empty")} hint={t("expenses.emptyHint")} />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH className={HEAD}>{t("expenses.date")}</TH>
                <TH className={HEAD}>{t("expenses.category")}</TH>
                <TH className={HEAD}>{t("expenses.details")}</TH>
                <TH className={cn(HEAD, "text-right")}>{t("expenses.amount")}</TH>
                <TH className={HEAD}>{t("expenses.recordedBy")}</TH>
                <TH className={cn(HEAD, "text-right print:hidden")}>{t("common.actions")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((expense) => {
                const category = categoryById.get(expense.categoryId);
                return (
                  <TR key={expense.id}>
                    <TD className="whitespace-nowrap">{f.day(expense.expenseDate)}</TD>
                    <TD>
                      {category && (
                        <Badge tone="muted" className="gap-1.5 text-foreground">
                          <span
                            aria-hidden
                            className={cn("size-1.5 rounded-full", EXPENSE_COLOR_DOT[category.color])}
                          />
                          {category.name}
                        </Badge>
                      )}
                    </TD>
                    <TD className="max-w-md">
                      {expense.description}
                      {multiBranch && !expense.branchId && (
                        <Badge tone="info" className="ml-2 whitespace-nowrap">
                          {t("expenses.wholeBusiness")}
                        </Badge>
                      )}
                      {expense.fromDrawer && (
                        <Badge tone="muted" className="ml-2 whitespace-nowrap">
                          {t("expenses.fromDrawerBadge")}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right font-semibold whitespace-nowrap tabular-nums">
                      {f.money(expense.amount)}
                    </TD>
                    <TD className="text-muted-foreground">{expense.recordedBy ?? "—"}</TD>
                    <TD className="print:hidden">
                      {expense.fromDrawer ? null : (
                      <div className="flex justify-end gap-1">
                        <ExpenseFormButton
                          expense={expense}
                          categories={formCategories}
                          today={today}
                        />
                        <ConfirmButton
                          action={deleteExpense.bind(null, expense.id, branch.id)}
                          body={t("expenses.deleteBody")}
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          aria-label={t("common.delete")}
                        >
                          <Trash2 />
                        </ConfirmButton>
                      </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCountOf(total)} />
        </>
      )}
    </>
  );
}
