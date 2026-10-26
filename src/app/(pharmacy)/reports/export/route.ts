import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { batches, branches as branchesTable, categories, customers, products, sales } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requirePharmacy } from "@/lib/auth";
import { inScope } from "@/lib/branches";
import { csvResponse, type CsvCell } from "@/lib/csv";
import { getFormat } from "@/lib/format-server";
import { todayInTimezone, zonedRange } from "@/lib/dates";
import { round2 } from "@/lib/utils";
import { xlsxResponse } from "@/lib/xlsx";
import { REPORT_BRANCH_PARAM, resolveReportScope } from "@/lib/report-scope";
import { resolveRange } from "../range";

export async function GET(request: Request) {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);
  const url = new URL(request.url);
  const today = todayInTimezone(pharmacy.timezone);
  // Same branch filter as the reports page; "All branches" adds a branch column.
  const { scope } = resolveReportScope(
    url.searchParams.get(REPORT_BRANCH_PARAM) ?? undefined,
    { user, branch, branches },
    t,
  );
  const withBranch = scope.branchId === null;
  const branchHeader = withBranch ? [t("branches.current")] : [];

  if (url.searchParams.get("type") === "stock") {
    const rows = await db
      .select({
        branch: branchesTable.name,
        name: products.name,
        genericName: products.genericName,
        category: categories.name,
        batchNumber: batches.batchNumber,
        expiryDate: batches.expiryDate,
        quantity: batches.quantity,
        costPrice: batches.costPrice,
      })
      .from(batches)
      .innerJoin(products, eq(products.id, batches.productId))
      .innerJoin(branchesTable, eq(branchesTable.id, batches.branchId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(inScope(batches, scope), gt(batches.quantity, 0)))
      .orderBy(asc(products.name), asc(branchesTable.name), asc(batches.expiryDate));

    return csvResponse(`stock-${today}.csv`, [
      [
        ...branchHeader,
        t("reports.product"),
        t("reports.csvGeneric"),
        t("reports.category"),
        t("reports.csvBatch"),
        t("reports.csvExpiry"),
        t("reports.csvQuantity"),
        t("reports.csvCost"),
        t("reports.value"),
      ],
      ...rows.map((r): CsvCell[] => [
        ...(withBranch ? [r.branch] : []),
        r.name,
        r.genericName,
        r.category,
        r.batchNumber,
        r.expiryDate,
        r.quantity,
        r.costPrice,
        round2(r.quantity * r.costPrice),
      ]),
    ]);
  }

  const { from, to } = resolveRange(
    {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    today,
  );
  const range = zonedRange(from, to, pharmacy.timezone);
  const rows = await db
    .select({
      branch: branchesTable.name,
      invoiceNumber: sales.invoiceNumber,
      createdAt: sales.createdAt,
      customer: customers.name,
      paymentMethod: sales.paymentMethod,
      status: sales.status,
      subtotal: sales.subtotal,
      discount: sales.discount,
      tax: sales.tax,
      total: sales.total,
    })
    .from(sales)
    .innerJoin(branchesTable, eq(branchesTable.id, sales.branchId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        inScope(sales, scope),
        gte(sales.createdAt, range.start),
        lt(sales.createdAt, range.end),
      ),
    )
    .orderBy(asc(sales.createdAt));

  const methodLabel = {
    cash: t("reports.methodCash"),
    card: t("reports.methodCard"),
    transfer: t("reports.methodTransfer"),
  };
  const table: CsvCell[][] = [
    [
      ...branchHeader,
      t("reports.csvInvoice"),
      t("reports.csvDate"),
      t("reports.csvCustomer"),
      t("reports.paymentMethod"),
      t("reports.csvStatus"),
      t("reports.csvSubtotal"),
      t("reports.csvDiscount"),
      t("reports.csvTax"),
      t("reports.csvTotal"),
    ],
    ...rows.map((r): CsvCell[] => [
      ...(withBranch ? [r.branch] : []),
      r.invoiceNumber,
      f.dateTime(r.createdAt),
      r.customer,
      methodLabel[r.paymentMethod],
      r.status === "refunded" ? t("reports.statusRefunded") : t("reports.statusCompleted"),
      r.subtotal,
      r.discount,
      r.tax,
      r.total,
    ]),
  ];
  const filename = `sales-${from}-to-${to}`;

  if (url.searchParams.get("format") === "xlsx") {
    // Subtotal, discount, tax and total, after the optional branch column.
    const first = branchHeader.length + 5;
    return xlsxResponse(`${filename}.xlsx`, table, {
      sheetName: t("reports.sheetName"),
      moneyColumns: [first, first + 1, first + 2, first + 3],
    });
  }
  return csvResponse(`${filename}.csv`, table);
}
