"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { getT } from "@/i18n/server";
import { canSwitchBranch } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { branchScope } from "@/lib/branches";
import { addDays, todayInTimezone, zonedDayStart, zonedRange } from "@/lib/dates";
import { getFormat } from "@/lib/format-server";
import {
  getBatchesExpiringBetween,
  getCustomerSpending,
  getExpensesByCategory,
  getLowStockProducts,
  getRevenue,
  getSalesSummary,
  getTopProducts,
} from "@/lib/reports";
import { round2 } from "@/lib/utils";
import { QUESTIONS, matchQuestion, type AssistantAnswer, type QuestionId } from "./questions";

// Rows listed under an answer.
const MAX_ROWS = 8;
// A customer who has not bought anything for this long has not visited recently
// (the "at risk" threshold of the customer insights page).
const INACTIVE_DAYS = 60;

const inputSchema = z.object({
  id: z.enum(QUESTIONS).optional(),
  question: z.string().trim().max(500).optional(),
});

/**
 * Answers a suggested question (`id`) or a typed one (`question`) from the
 * pharmacy's own data. Branch figures cover the branch the user works in.
 */
export async function askAssistant(input: {
  id?: QuestionId;
  question?: string;
}): Promise<AssistantAnswer> {
  const { user, pharmacy, branch, branches } = await requirePharmacy();
  const [t, f, db] = await Promise.all([getT(), getFormat(pharmacy), getDb()]);

  const parsed = inputSchema.safeParse(input);
  const id = parsed.success
    ? (parsed.data.id ?? matchQuestion(parsed.data.question ?? ""))
    : null;
  if (!id) return { text: t("assistant.notUnderstood"), suggest: true };

  const tz = pharmacy.timezone;
  const today = todayInTimezone(tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const scope = branchScope(branch);
  // With several branches, say which one the figures are for.
  const note = branches.length > 1 ? t("assistant.branchNote", { branch: branch.name }) : undefined;

  switch (id) {
    case "bestSeller": {
      const top = await getTopProducts(db, scope, zonedRange(monthStart, today, tz), 5);
      if (top.length === 0) return { text: t("assistant.noSalesMonth"), note };
      const [best] = top;
      return {
        text: t("assistant.bestSeller", {
          name: best.name,
          quantity: f.number(best.quantity),
          revenue: f.money(best.revenue),
        }),
        rows: top.map((row) => ({
          label: row.name,
          value: f.money(row.revenue),
          hint: t("assistant.unitsSold", { count: f.number(row.quantity) }),
        })),
        link: { href: `/reports?from=${monthStart}&to=${today}`, label: t("assistant.openReports") },
        note,
      };
    }

    case "revenueWeek": {
      const from = addDays(today, -6);
      const week = await getRevenue(db, scope, zonedRange(from, today, tz));
      return {
        text:
          week.count === 0
            ? t("assistant.noSalesWeek")
            : t("assistant.revenueWeek", {
                revenue: f.money(week.revenue),
                count: f.number(week.count),
                from: f.day(from),
                to: f.day(today),
              }),
        link: { href: `/reports?from=${from}&to=${today}`, label: t("assistant.openReports") },
        note,
      };
    }

    case "profitMargin": {
      const month = await getSalesSummary(db, scope, zonedRange(monthStart, today, tz));
      if (month.count === 0) return { text: t("assistant.noSalesMonth"), note };
      const margin = month.net > 0 ? ((month.profit / month.net) * 100).toFixed(1) : "0.0";
      return {
        text: t("assistant.profitMargin", { percent: margin, profit: f.money(month.profit) }),
        rows: [
          { label: t("assistant.salesBeforeTax"), value: f.money(month.net) },
          { label: t("assistant.costOfGoods"), value: f.money(month.cogs) },
          { label: t("assistant.grossProfit"), value: f.money(month.profit) },
        ],
        link: { href: `/reports?from=${monthStart}&to=${today}`, label: t("assistant.openReports") },
        note,
      };
    }

    case "topExpenses": {
      // Admins also carry the whole-business expenses, as on the expenses page.
      const rows = await getExpensesByCategory(db, scope, monthStart, today, canSwitchBranch(user));
      const link = {
        href: `/expenses?from=${monthStart}&to=${today}`,
        label: t("assistant.openExpenses"),
      };
      if (rows.length === 0) return { text: t("assistant.noExpenses"), link, note };
      const total = round2(rows.reduce((sum, row) => sum + row.total, 0));
      return {
        text: t("assistant.topExpenses", {
          total: f.money(total),
          category: rows[0].category,
          amount: f.money(rows[0].total),
        }),
        rows: rows.slice(0, MAX_ROWS).map((row) => ({
          label: row.category,
          value: f.money(row.total),
          hint: t("assistant.entries", { count: f.number(row.count) }),
        })),
        link,
        note,
      };
    }

    case "expiring": {
      const days = pharmacy.expiryAlertDays;
      const batches = await getBatchesExpiringBetween(db, scope, today, addDays(today, days));
      const link = { href: "/inventory/alerts", label: t("assistant.openAlerts") };
      if (batches.length === 0) return { text: t("assistant.noExpiring", { days }), link, note };
      return {
        text: t("assistant.expiring", { count: f.number(batches.length), days }),
        rows: batches.slice(0, MAX_ROWS).map((batch) => ({
          label: batch.productName,
          value: f.day(batch.expiryDate ?? today),
          hint: t("assistant.batchLine", {
            batch: batch.batchNumber ?? "—",
            quantity: f.number(batch.quantity),
            unit: batch.unit,
          }),
        })),
        link,
        note,
      };
    }

    case "lowStock": {
      const low = await getLowStockProducts(db, scope, today);
      const link = { href: "/inventory/alerts", label: t("assistant.openAlerts") };
      if (low.length === 0) return { text: t("assistant.noLowStock"), link, note };
      return {
        text: t("assistant.lowStock", { count: f.number(low.length) }),
        rows: low.slice(0, MAX_ROWS).map((product) => ({
          label: product.name,
          value: `${f.number(product.quantity)} ${product.unit}`,
          hint: t("assistant.reorderAt", { level: f.number(product.reorderLevel) }),
        })),
        link,
        note,
      };
    }

    case "inactiveCustomers": {
      // Customers are shared by every branch, so their visits count all of them.
      const before = zonedDayStart(addDays(today, 1 - INACTIVE_DAYS), tz);
      const buyers = await getCustomerSpending(
        db,
        { pharmacyId: pharmacy.id, branchId: null },
        before,
      );
      const link = { href: "/customers/insights", label: t("assistant.openInsights") };
      if (buyers.length === 0) return { text: t("assistant.noCustomers"), link };
      // Highest spenders first, so the customers most worth calling lead.
      const inactive = buyers.filter((c) => c.lastAt < before);
      if (inactive.length === 0) {
        return { text: t("assistant.allCustomersActive", { days: INACTIVE_DAYS }), link };
      }
      return {
        text: t("assistant.inactiveCustomers", {
          count: f.number(inactive.length),
          days: INACTIVE_DAYS,
        }),
        rows: inactive.slice(0, MAX_ROWS).map((customer) => ({
          label: customer.name,
          value: f.money(customer.spent),
          hint: t("assistant.lastVisit", { date: f.dateTime(customer.lastAt) }),
        })),
        link,
      };
    }

    case "salesToday": {
      const sold = await getRevenue(db, scope, zonedRange(today, today, tz));
      return {
        text:
          sold.count === 0
            ? t("assistant.noSalesToday")
            : t("assistant.salesToday", {
                count: f.number(sold.count),
                revenue: f.money(sold.revenue),
              }),
        link: { href: "/sales", label: t("assistant.openSales") },
        note,
      };
    }
  }
}
