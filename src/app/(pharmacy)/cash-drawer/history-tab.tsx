import { and, count, eq, ne, or } from "drizzle-orm";
import { Download } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { FilterSelect, Pagination } from "@/components/ui/list-controls";
import { Toolbar } from "@/components/ui/page";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { cashDrawers, cashShifts, users } from "@/db/schema";
import type { MessageKey } from "@/i18n/messages";
import { todayInTimezone } from "@/lib/dates";
import { PAGE_SIZE, pageCountOf, parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  historyRows,
  historyWhere,
  parseHistoryFilters,
  recentMonths,
  sessionStatus,
  type SessionStatus,
} from "./history-query";
import type { Ctx } from "./shared";

export const STATUS_BADGE: Record<SessionStatus, { tone: "success" | "warning" | "danger"; label: MessageKey }> = {
  open: { tone: "danger", label: "cashDrawer.statusOpen" },
  review: { tone: "warning", label: "cashDrawer.statusReview" },
  rejected: { tone: "danger", label: "cashDrawer.statusRejected" },
  closed: { tone: "success", label: "cashDrawer.statusClosed" },
};

/** Every session of the branch, filtered by month, drawer and staff. */
export async function HistoryTab({
  ctx,
  params,
}: {
  ctx: Ctx;
  params: { page?: string; month?: string; drawer?: string; staff?: string };
}) {
  const { db, pharmacy, branch, t, f } = ctx;
  const filters = parseHistoryFilters(params);
  const page = parsePage(params.page);
  const where = historyWhere(branch, pharmacy, filters);

  const [[{ total }], rows, drawers, staff] = await Promise.all([
    db.select({ total: count() }).from(cashShifts).where(where),
    historyRows(db, where)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ id: cashDrawers.id, name: cashDrawers.name })
      .from(cashDrawers)
      .where(and(eq(cashDrawers.pharmacyId, pharmacy.id), eq(cashDrawers.branchId, branch.id)))
      .orderBy(cashDrawers.createdAt),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.pharmacyId, pharmacy.id),
          ne(users.role, "superadmin"),
          or(eq(users.role, "admin"), eq(users.branchId, branch.id)),
        ),
      )
      .orderBy(users.name),
  ]);

  const months = recentMonths(todayInTimezone(pharmacy.timezone), 12);
  const exportQuery = new URLSearchParams(
    Object.entries({ month: filters.month, drawer: filters.drawerId, staff: filters.staffId }).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  ).toString();
  const signed = (value: number | null) =>
    value === null ? "—" : `${value > 0 ? "+" : ""}${f.money(value)}`;

  return (
    <>
      <Toolbar>
        <FilterSelect
          param="month"
          aria-label={t("cashDrawer.month")}
          options={[
            { value: "", label: t("cashDrawer.allMonths") },
            ...months.map((m) => ({ value: m, label: f.month(m) })),
          ]}
        />
        {drawers.length > 1 && (
          <FilterSelect
            param="drawer"
            aria-label={t("cashDrawer.drawer")}
            options={[
              { value: "", label: t("cashDrawer.allDrawers") },
              ...drawers.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        )}
        <FilterSelect
          param="staff"
          aria-label={t("cashDrawer.staff")}
          options={[
            { value: "", label: t("cashDrawer.allStaff") },
            ...staff.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Link
          href={`/cash-drawer/export${exportQuery ? `?${exportQuery}` : ""}`}
          className={buttonClass({ variant: "outline", className: "sm:ml-auto" })}
          prefetch={false}
        >
          <Download />
          {t("cashDrawer.exportCsv")}
        </Link>
      </Toolbar>

      {rows.length === 0 ? (
        <Card className="px-6 py-14 text-center text-muted-foreground">{t("cashDrawer.historyEmpty")}</Card>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("cashDrawer.colOpened")}</TH>
              <TH>{t("cashDrawer.drawer")}</TH>
              <TH>{t("cashDrawer.staff")}</TH>
              <TH className="text-right">{t("cashDrawer.cashSales")}</TH>
              <TH className="text-right">{t("cashDrawer.expected")}</TH>
              <TH className="text-right">{t("cashDrawer.counted")}</TH>
              <TH className="text-right">{t("cashDrawer.difference")}</TH>
              <TH>{t("common.status")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const status = STATUS_BADGE[sessionStatus(row)];
              return (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap tabular-nums">
                    <Link href={`/cash-drawer/${row.id}`} className="font-medium hover:text-primary hover:underline">
                      {f.dateTime(row.openedAt)}
                    </Link>
                  </TD>
                  <TD>{row.drawerName}</TD>
                  <TD>
                    <p>{row.openedBy ?? "—"}</p>
                    {row.closedBy && row.closedBy !== row.openedBy && (
                      <p className="text-xs text-muted-foreground">
                        {t("cashDrawer.closedBy", { name: row.closedBy })}
                      </p>
                    )}
                    {row.note && (
                      <p className="max-w-56 truncate text-xs text-muted-foreground" title={row.note}>
                        {row.note}
                      </p>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{row.closedAt ? f.money(row.cashSales) : "—"}</TD>
                  <TD className="text-right tabular-nums">{row.closedAt ? f.money(row.expectedCash) : "—"}</TD>
                  <TD className="text-right tabular-nums">{row.closedAt ? f.money(row.countedCash) : "—"}</TD>
                  <TD
                    className={cn(
                      "text-right font-medium tabular-nums",
                      row.difference === 0 && "text-success",
                      row.difference !== null && row.difference > 0 && "text-info",
                      row.difference !== null && row.difference < 0 && "text-destructive",
                    )}
                  >
                    {row.closedAt ? signed(row.difference) : "—"}
                  </TD>
                  <TD>
                    <Badge tone={status.tone}>{t(status.label)}</Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <Pagination page={page} pageCount={pageCountOf(total)} />
    </>
  );
}
