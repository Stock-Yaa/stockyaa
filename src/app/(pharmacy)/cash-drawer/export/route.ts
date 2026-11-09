import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getT } from "@/i18n/server";
import { isManager } from "@/lib/active-branch";
import { requirePharmacy } from "@/lib/auth";
import { csvResponse, type CsvCell } from "@/lib/csv";
import { todayInTimezone } from "@/lib/dates";
import { historyRows, historyWhere, parseHistoryFilters, sessionStatus } from "../history-query";
import { STATUS_BADGE } from "../history-tab";

/** The filtered session history of the current branch as CSV (managers only). */
export async function GET(request: Request) {
  const { user, pharmacy, branch } = await requirePharmacy();
  if (!isManager(user)) notFound();
  const [t, db] = await Promise.all([getT(), getDb()]);
  const url = new URL(request.url);
  const filters = parseHistoryFilters({
    month: url.searchParams.get("month") ?? undefined,
    drawer: url.searchParams.get("drawer") ?? undefined,
    staff: url.searchParams.get("staff") ?? undefined,
  });
  const rows = await historyRows(db, historyWhere(branch, pharmacy, filters));

  // Times as the pharmacy's local wall clock, which spreadsheets read as-is.
  const local = (value: Date | null) =>
    value
      ? new Intl.DateTimeFormat("sv-SE", {
          timeZone: pharmacy.timezone,
          dateStyle: "short",
          timeStyle: "short",
        }).format(value)
      : null;

  const data: CsvCell[][] = [
    [
      t("cashDrawer.colOpened"),
      t("cashDrawer.colClosed"),
      t("cashDrawer.drawer"),
      t("cashDrawer.staff"),
      t("cashDrawer.closedByLabel"),
      t("cashDrawer.openingFloat"),
      t("cashDrawer.cashSales"),
      t("cashDrawer.expected"),
      t("cashDrawer.counted"),
      t("cashDrawer.difference"),
      t("common.status"),
      t("cashDrawer.reason"),
    ],
    ...rows.map((row) => [
      local(row.openedAt),
      local(row.closedAt),
      row.drawerName,
      row.openedBy,
      row.closedBy,
      row.openingBalance,
      row.cashSales,
      row.expectedCash,
      row.countedCash,
      row.difference,
      t(STATUS_BADGE[sessionStatus(row)].label),
      row.note,
    ]),
  ];
  const suffix = filters.month ?? todayInTimezone(pharmacy.timezone);
  return csvResponse(`cash-sessions-${suffix}.csv`, data);
}
